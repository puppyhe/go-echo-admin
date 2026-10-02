package admin

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"gorm.io/gorm"
)

const (
	defaultUploadChunkSize int64 = 5 * 1024 * 1024
	maxUploadParts               = 10000
	maxUploadSessionHours        = 24
)

var uploadSessionLocks sync.Map

func uploadSessionLock(id string) *sync.Mutex {
	value, _ := uploadSessionLocks.LoadOrStore(id, &sync.Mutex{})
	return value.(*sync.Mutex)
}

// RegisterFileChunkRoutes exposes resumable upload APIs. A session is always
// bound to the current tenant and user; neither a session ID nor a part number
// can be used to access another tenant's temporary objects.
func RegisterFileChunkRoutes(g *echo.Group, s *Service) {
	permission := func(name string) []echo.MiddlewareFunc { return []echo.MiddlewareFunc{s.RequirePermission(name)} }
	g.GET("/files/capabilities", s.fileChunkCapabilities, permission("file:list")...)
	g.POST("/files/multipart/initiate", s.fileChunkInitiate, permission("file:create")...)
	g.GET("/files/multipart/:id", s.fileChunkStatus, permission("file:list")...)
	g.PUT("/files/multipart/:id/parts/:part", s.fileChunkPut, permission("file:create")...)
	g.POST("/files/multipart/:id/complete", s.fileChunkComplete, permission("file:create")...)
	g.DELETE("/files/multipart/:id", s.fileChunkAbort, permission("file:delete")...)
}

func (s *Service) fileChunkCapabilities(c *echo.Context) error {
	return legacyOK(c, map[string]any{"maxFileSize": s.maxFileBytes(), "partSize": defaultUploadChunkSize, "multipartEnabled": true, "maxParts": maxUploadParts, "expiresHours": maxUploadSessionHours})
}

func (s *Service) fileChunkStatus(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	session, err := s.loadUploadSession(c.Request().Context(), c.Param("id"), id.TenantID, id.UserID)
	if err != nil {
		return err
	}
	var parts []database.FileUploadPart
	if err := s.DB.WithContext(c.Request().Context()).Where("session_id=? AND tenant_id=?", session.ID, id.TenantID).Order("part_no asc").Find(&parts).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(parts))
	var received int64
	for _, part := range parts {
		received += part.Size
		items = append(items, map[string]any{"part": part.PartNo, "size": part.Size, "hash": part.Hash})
	}
	return legacyOK(c, map[string]any{"uploadId": session.ID, "name": session.Name, "size": session.ExpectedSize, "chunkSize": session.ChunkSize, "totalParts": session.TotalParts, "received": received, "status": session.Status, "expiresAt": session.ExpiresAt, "fileId": session.FileID, "parts": items})
}

func (s *Service) fileChunkInitiate(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in struct {
		Name       string `json:"name"`
		MIME       string `json:"mime"`
		Size       int64  `json:"size"`
		ChunkSize  int64  `json:"chunkSize"`
		TotalParts int    `json:"totalParts"`
		Hash       string `json:"hash"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "分片上传参数格式错误")
	}
	name, ext, nameErr := safeFileName(in.Name)
	if nameErr != nil {
		return httpx.NewError(http.StatusBadRequest, "FILE_NAME_INVALID", "文件名或扩展名不安全")
	}
	if in.Size <= 0 || in.Size > s.maxFileBytes() {
		return httpx.NewError(http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "文件大小超过系统限制")
	}
	if in.ChunkSize <= 0 {
		in.ChunkSize = defaultUploadChunkSize
	}
	if in.ChunkSize > s.maxFileBytes() {
		return httpx.NewError(http.StatusBadRequest, "CHUNK_TOO_LARGE", "分片大小超过文件限制")
	}
	if in.TotalParts <= 0 {
		in.TotalParts = int((in.Size + in.ChunkSize - 1) / in.ChunkSize)
	}
	if in.TotalParts <= 0 || in.TotalParts > maxUploadParts || int64(in.TotalParts)*in.ChunkSize < in.Size {
		return httpx.NewError(http.StatusBadRequest, "PARTS_INVALID", "分片数量或大小无效")
	}
	if in.Hash != "" && !isSHA256(in.Hash) {
		return httpx.NewError(http.StatusBadRequest, "HASH_INVALID", "文件哈希必须是 SHA-256")
	}
	// Validate the extension up front. Content sniffing is repeated after all
	// parts are assembled, when the complete bytes are available.
	_ = ext
	sessionID := randomFileID()
	session := database.FileUploadSession{ID: sessionID, TenantID: id.TenantID, UserID: id.UserID, Name: name, MIME: strings.TrimSpace(in.MIME), ExpectedSize: in.Size, ChunkSize: in.ChunkSize, TotalParts: in.TotalParts, ExpectedHash: strings.ToLower(strings.TrimSpace(in.Hash)), Status: "initiated", ExpiresAt: time.Now().Add(maxUploadSessionHours * time.Hour)}
	if err := s.DB.WithContext(c.Request().Context()).Create(&session).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"id": session.ID, "uploadId": session.ID, "name": session.Name, "size": session.ExpectedSize, "chunkSize": session.ChunkSize, "totalParts": session.TotalParts, "expiresAt": session.ExpiresAt, "status": session.Status})
}

func (s *Service) loadUploadSession(ctx context.Context, id string, tenantID, userID uint64) (database.FileUploadSession, error) {
	if len(id) != 32 || !isHex(id) {
		return database.FileUploadSession{}, httpx.NewError(http.StatusNotFound, "NOT_FOUND", "上传会话不存在")
	}
	var row database.FileUploadSession
	if err := s.DB.WithContext(ctx).Where("id=? AND tenant_id=? AND user_id=?", id, tenantID, userID).First(&row).Error; err != nil {
		return row, httpx.NewError(http.StatusNotFound, "NOT_FOUND", "上传会话不存在")
	}
	if row.ExpiresAt.Before(time.Now()) && row.Status != "completed" {
		return row, httpx.NewError(http.StatusGone, "UPLOAD_EXPIRED", "上传会话已过期")
	}
	return row, nil
}

func (s *Service) fileChunkPut(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	partNo, parseErr := strconv.Atoi(strings.TrimSpace(c.Param("part")))
	if parseErr != nil || partNo <= 0 || partNo > maxUploadParts {
		return httpx.NewError(http.StatusBadRequest, "PART_INVALID", "分片序号无效")
	}
	session, err := s.loadUploadSession(c.Request().Context(), c.Param("id"), id.TenantID, id.UserID)
	if err != nil {
		return err
	}
	if session.Status == "completed" || session.Status == "aborted" {
		return httpx.NewError(http.StatusConflict, "UPLOAD_CLOSED", "上传会话已关闭")
	}
	if partNo > session.TotalParts {
		return httpx.NewError(http.StatusBadRequest, "PART_INVALID", "分片序号超出范围")
	}
	limit := session.ChunkSize
	if partNo == session.TotalParts {
		limit = session.ExpectedSize - int64(partNo-1)*session.ChunkSize
	}
	if limit <= 0 {
		return httpx.NewError(http.StatusBadRequest, "PART_INVALID", "分片大小无效")
	}
	data, readErr := io.ReadAll(io.LimitReader(c.Request().Body, limit+1))
	if readErr != nil {
		return readErr
	}
	if int64(len(data)) <= 0 || int64(len(data)) > limit {
		return httpx.NewError(http.StatusRequestEntityTooLarge, "PART_TOO_LARGE", "分片大小无效")
	}
	if expected := strings.TrimSpace(c.Request().Header.Get("X-Chunk-Hash")); expected != "" {
		digest := sha256.Sum256(data)
		if !strings.EqualFold(expected, hex.EncodeToString(digest[:])) {
			return httpx.NewError(http.StatusBadRequest, "HASH_MISMATCH", "分片哈希校验失败")
		}
	}
	digest := sha256.Sum256(data)
	key := fmt.Sprintf("multipart/%d/%s/%06d.part", id.TenantID, session.ID, partNo)
	store, err := s.fileStore()
	if err != nil {
		return err
	}
	if err := store.Put(c.Request().Context(), key, bytes.NewReader(data)); err != nil {
		return err
	}
	part := database.FileUploadPart{SessionID: session.ID, TenantID: id.TenantID, PartNo: partNo, Size: int64(len(data)), Hash: hex.EncodeToString(digest[:]), StoreKey: key}
	// An idempotent retry replaces the previous part. Update its metadata only
	// after the bytes have been committed to storage.
	if err := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		var old database.FileUploadPart
		if tx.Where("session_id=? AND part_no=? AND tenant_id=?", session.ID, partNo, id.TenantID).First(&old).Error == nil {
			if err := tx.Model(&old).Updates(map[string]any{"size": part.Size, "hash": part.Hash, "store_key": part.StoreKey}).Error; err != nil {
				return err
			}
		} else if err := tx.Create(&part).Error; err != nil {
			return err
		}
		return tx.Model(&database.FileUploadSession{}).Where("id=? AND tenant_id=?", session.ID, id.TenantID).Updates(map[string]any{"status": "uploading"}).Error
	}); err != nil {
		_ = store.Delete(c.Request().Context(), key)
		return err
	}
	return legacyOK(c, map[string]any{"uploadId": session.ID, "part": partNo, "size": part.Size, "hash": part.Hash, "status": "uploading"})
}

func (s *Service) fileChunkComplete(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	lock := uploadSessionLock(c.Param("id"))
	lock.Lock()
	defer lock.Unlock()
	session, err := s.loadUploadSession(c.Request().Context(), c.Param("id"), id.TenantID, id.UserID)
	if err != nil {
		return err
	}
	if session.Status == "completed" {
		return legacyOK(c, map[string]any{"uploadId": session.ID, "fileId": session.FileID, "status": session.Status})
	}
	if session.Status == "aborted" {
		return httpx.NewError(http.StatusConflict, "UPLOAD_CLOSED", "上传会话已取消")
	}
	var parts []database.FileUploadPart
	if err := s.DB.WithContext(c.Request().Context()).Where("session_id=? AND tenant_id=?", session.ID, id.TenantID).Order("part_no asc").Find(&parts).Error; err != nil {
		return err
	}
	if len(parts) != session.TotalParts {
		return httpx.NewError(http.StatusConflict, "PARTS_MISSING", "仍有分片未上传")
	}
	var input struct {
		Hash string `json:"hash"`
	}
	_ = c.Bind(&input)
	if input.Hash != "" && !isSHA256(input.Hash) {
		return httpx.NewError(http.StatusBadRequest, "HASH_INVALID", "文件哈希必须是 SHA-256")
	}
	store, err := s.fileStore()
	if err != nil {
		return err
	}
	temp, tempErr := os.CreateTemp("", "echo-upload-*")
	if tempErr != nil {
		return tempErr
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	defer temp.Close()
	digestWriter := sha256.New()
	writer := io.MultiWriter(temp, digestWriter)
	var assembledSize int64
	for index, part := range parts {
		if part.PartNo != index+1 {
			return httpx.NewError(http.StatusConflict, "PARTS_MISSING", "分片序号不连续")
		}
		reader, openErr := store.Open(c.Request().Context(), part.StoreKey)
		if openErr != nil {
			return httpx.NewError(http.StatusConflict, "PART_MISSING", "分片内容不存在")
		}
		written, copyErr := io.Copy(writer, io.LimitReader(reader, part.Size+1))
		if copyErr != nil {
			_ = reader.Close()
			return copyErr
		}
		if written != part.Size {
			_ = reader.Close()
			return httpx.NewError(http.StatusConflict, "PART_SIZE_MISMATCH", "分片内容大小校验失败")
		}
		assembledSize += written
		_ = reader.Close()
	}
	if assembledSize != session.ExpectedSize {
		return httpx.NewError(http.StatusConflict, "SIZE_MISMATCH", "文件大小校验失败")
	}
	hash := hex.EncodeToString(digestWriter.Sum(nil))
	expectedHash := strings.ToLower(strings.TrimSpace(input.Hash))
	if expectedHash == "" {
		expectedHash = session.ExpectedHash
	}
	if expectedHash != "" && !strings.EqualFold(expectedHash, hash) {
		return httpx.NewError(http.StatusBadRequest, "HASH_MISMATCH", "文件哈希校验失败")
	}
	if _, err := temp.Seek(0, io.SeekStart); err != nil {
		return err
	}
	sample, _ := io.ReadAll(io.LimitReader(temp, 512*1024))
	contentType, err := validateFileType(session.Name, strings.ToLower(filepathExt(session.Name)), session.MIME, sample)
	if err != nil {
		return err
	}
	var tenantRow database.Tenant
	if err := s.DB.WithContext(c.Request().Context()).Select("code").First(&tenantRow, id.TenantID).Error; err != nil {
		return err
	}
	finalKey := fmt.Sprintf("tenants/%d/%s%s", id.TenantID, randomFileID(), filepathExt(session.Name))
	if _, err := temp.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if err := store.Put(c.Request().Context(), finalKey, temp); err != nil {
		return err
	}
	row := database.FileObject{TenantID: id.TenantID, UserID: id.UserID, Name: session.Name, Hash: hash, Size: assembledSize, MIME: contentType, StorageKey: finalKey, Category: "default", Status: "active"}
	if err := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		return tx.Model(&database.FileUploadSession{}).Where("id=? AND tenant_id=?", session.ID, id.TenantID).Updates(map[string]any{"status": "completed", "received": session.ExpectedSize, "file_id": row.ID}).Error
	}); err != nil {
		_ = store.Delete(c.Request().Context(), finalKey)
		return err
	}
	for _, part := range parts {
		_ = store.Delete(c.Request().Context(), part.StoreKey)
	}
	return legacyOK(c, map[string]any{"uploadId": session.ID, "fileId": row.ID, "file": fileView(row, tenantRow.Code), "status": "completed"})
}

func (s *Service) fileChunkAbort(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	lock := uploadSessionLock(c.Param("id"))
	lock.Lock()
	defer lock.Unlock()
	session, err := s.loadUploadSession(c.Request().Context(), c.Param("id"), id.TenantID, id.UserID)
	if err != nil {
		return err
	}
	var parts []database.FileUploadPart
	_ = s.DB.Where("session_id=? AND tenant_id=?", session.ID, id.TenantID).Find(&parts).Error
	if err := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&database.FileUploadSession{}).Where("id=? AND tenant_id=?", session.ID, id.TenantID).Updates(map[string]any{"status": "aborted"}).Error; err != nil {
			return err
		}
		return tx.Where("session_id=? AND tenant_id=?", session.ID, id.TenantID).Delete(&database.FileUploadPart{}).Error
	}); err != nil {
		return err
	}
	if store, storeErr := s.fileStore(); storeErr == nil {
		for _, part := range parts {
			_ = store.Delete(c.Request().Context(), part.StoreKey)
		}
	}
	return legacyOK(c, map[string]any{"uploadId": session.ID, "status": "aborted"})
}

func filepathExt(name string) string {
	i := strings.LastIndexByte(name, '.')
	if i < 0 {
		return ""
	}
	return strings.ToLower(name[i:])
}
func isSHA256(value string) bool { return len(value) == 64 && isHex(value) }
func isHex(value string) bool {
	for _, char := range value {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
			return false
		}
	}
	return true
}
