package admin

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/internal/platform/storage"
	"gorm.io/gorm"
)

const defaultFileMaxBytes int64 = 10 * 1024 * 1024

var storageKeyLeafPattern = regexp.MustCompile(`^[a-f0-9]{32}\.[a-z0-9]{1,20}$`)

// RegisterLegacyFileRoutes provides the upload contract consumed by the
// reference frontend, plus tenant-scoped list and delete operations.
func RegisterLegacyFileRoutes(g *echo.Group, s *Service) {
	permission := func(name string) []echo.MiddlewareFunc { return []echo.MiddlewareFunc{s.RequirePermission(name)} }
	g.POST("/fileUploadAndDownload/upload", s.legacyFileUpload, permission("file:create")...)
	g.GET("/fileUploadAndDownload/getFileList", s.legacyFileList, permission("file:list")...)
	g.POST("/fileUploadAndDownload/getFileList", s.legacyFileList, permission("file:list")...)
	g.GET("/fileUploadAndDownload/findFile", s.legacyFileFind, permission("file:list")...)
	g.PUT("/fileUploadAndDownload/updateFile", s.legacyFileUpdate, permission("file:update")...)
	g.POST("/fileUploadAndDownload/updateFile", s.legacyFileUpdate, permission("file:update")...)
	g.DELETE("/fileUploadAndDownload/deleteFile", s.legacyFileDelete, permission("file:delete")...)
	g.POST("/fileUploadAndDownload/deleteFile", s.legacyFileDelete, permission("file:delete")...)
	g.DELETE("/fileUploadAndDownload/deleteFileByIds", s.legacyFileDelete, permission("file:delete")...)
	g.POST("/fileUploadAndDownload/deleteFileByIds", s.legacyFileDelete, permission("file:delete")...)
	g.GET("/uploads/:tenantCode/:key", s.legacyFileDownload, permission("file:list")...)
}

func (s *Service) maxFileBytes() int64 {
	if s.Config.StorageMaxBytes > 0 {
		return s.Config.StorageMaxBytes
	}
	return defaultFileMaxBytes
}

func (s *Service) fileStore() (storage.Store, error) {
	if s.Storage == nil {
		return nil, httpx.NewError(http.StatusServiceUnavailable, "STORAGE_UNAVAILABLE", "文件存储未配置")
	}
	return s.Storage, nil
}

func fileView(row database.FileObject, tenantCode string) map[string]any {
	key := filepath.Base(filepath.ToSlash(row.StorageKey))
	return map[string]any{
		"ID":        row.ID,
		"id":        row.ID,
		"name":      row.Name,
		"size":      row.Size,
		"mime":      row.MIME,
		"type":      row.MIME,
		"hash":      row.Hash,
		"classId":   0,
		"category":  row.Category,
		"tag":       row.Tag,
		"remark":    row.Remark,
		"status":    row.Status,
		"key":       row.StorageKey,
		"url":       "/uploads/" + tenantCode + "/" + key,
		"createdAt": row.CreatedAt,
	}
}

func (s *Service) legacyFileUpload(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	header, err := c.FormFile("file")
	if err != nil || header == nil {
		return httpx.NewError(http.StatusBadRequest, "FILE_REQUIRED", "请选择要上传的文件")
	}
	if header.Size <= 0 {
		return httpx.NewError(http.StatusBadRequest, "FILE_EMPTY", "不能上传空文件")
	}
	if header.Size > s.maxFileBytes() {
		return httpx.NewError(http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", fmt.Sprintf("文件大小不能超过 %d MB", s.maxFileBytes()/(1024*1024)))
	}
	file, err := header.Open()
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, s.maxFileBytes()+1))
	if err != nil {
		return err
	}
	if int64(len(data)) > s.maxFileBytes() {
		return httpx.NewError(http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "文件大小超过系统限制")
	}
	name, ext, err := safeFileName(header.Filename)
	if err != nil {
		return httpx.NewError(http.StatusBadRequest, "FILE_NAME_INVALID", "文件名或扩展名不安全")
	}
	contentType, err := validateFileType(name, ext, header.Header.Get("Content-Type"), data)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(data)
	hash := hex.EncodeToString(digest[:])
	var tenantRow database.Tenant
	if result := s.DB.WithContext(c.Request().Context()).First(&tenantRow, id.TenantID); result.Error != nil {
		return result.Error
	}
	key := fmt.Sprintf("tenants/%d/%s%s", id.TenantID, randomFileID(), ext)
	store, err := s.fileStore()
	if err != nil {
		return err
	}
	if err := store.Put(c.Request().Context(), key, bytes.NewReader(data)); err != nil {
		return err
	}
	row := database.FileObject{TenantID: id.TenantID, UserID: id.UserID, Name: name, Hash: hash, Size: int64(len(data)), MIME: contentType, StorageKey: key, Category: "default", Status: "active"}
	if err := s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		_ = store.Delete(c.Request().Context(), key)
		return err
	}
	return legacyOK(c, map[string]any{"file": fileView(row, tenantRow.Code)})
}

func (s *Service) legacyFileList(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	var tenantRow database.Tenant
	if result := s.DB.WithContext(c.Request().Context()).Select("code").First(&tenantRow, id.TenantID); result.Error != nil {
		return result.Error
	}
	query := s.DB.WithContext(c.Request().Context()).Model(&database.FileObject{}).Where("tenant_id = ?", id.TenantID)
	if value := strings.TrimSpace(c.QueryParam("name")); value != "" {
		query = query.Where("name LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(c.QueryParam("category")); value != "" {
		query = query.Where("category = ?", value)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.FileObject
	if err := query.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	list := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		list = append(list, fileView(row, tenantRow.Code))
	}
	return legacyOK(c, map[string]any{"list": list, "page": page, "pageSize": size, "total": total})
}

func (s *Service) legacyFileFind(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	idValue := strings.TrimSpace(c.QueryParam("id"))
	if idValue == "" {
		idValue = strings.TrimSpace(c.Param("id"))
	}
	fileID, _ := strconv.ParseUint(idValue, 10, 64)
	if fileID == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "文件 ID 无效")
	}
	var tenantRow database.Tenant
	var row database.FileObject
	if result := s.DB.WithContext(c.Request().Context()).First(&row, "id = ? AND tenant_id = ?", fileID, id.TenantID); result.Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "文件不存在")
	} else if s.DB.WithContext(c.Request().Context()).Select("code").First(&tenantRow, id.TenantID).Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "租户不存在")
	}
	return legacyOK(c, fileView(row, tenantRow.Code))
}

func (s *Service) legacyFileUpdate(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in struct {
		ID       uint64 `json:"id"`
		Name     string `json:"name"`
		Category string `json:"category"`
		Tag      string `json:"tag"`
		Remark   string `json:"remark"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "文件参数格式错误")
	}
	if in.ID == 0 {
		in.ID, _ = strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	}
	if in.ID == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "文件参数格式错误")
	}
	var row database.FileObject
	if result := s.DB.WithContext(c.Request().Context()).Where("id = ? AND tenant_id = ?", in.ID, id.TenantID).First(&row); result.Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "文件不存在")
	}
	if strings.TrimSpace(in.Name) != "" {
		name, ext, nameErr := safeFileName(in.Name)
		if nameErr != nil || !strings.EqualFold(ext, filepath.Ext(row.StorageKey)) {
			return httpx.NewError(http.StatusBadRequest, "FILE_NAME_INVALID", "文件名或扩展名不安全")
		}
		row.Name = name
	}
	row.Category = strings.TrimSpace(in.Category)
	row.Tag = strings.TrimSpace(in.Tag)
	row.Remark = strings.TrimSpace(in.Remark)
	if err := s.DB.WithContext(c.Request().Context()).Save(&row).Error; err != nil {
		return err
	}
	var tenantRow database.Tenant
	if err := s.DB.WithContext(c.Request().Context()).Select("code").First(&tenantRow, id.TenantID).Error; err != nil {
		return err
	}
	return legacyOK(c, fileView(row, tenantRow.Code))
}

func (s *Service) legacyFileDelete(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	ids := parseFileIDs(c)
	if len(ids) == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请选择要删除的文件")
	}
	store, err := s.fileStore()
	if err != nil {
		return err
	}
	var rows []database.FileObject
	if result := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ? AND id IN ?", id.TenantID, ids).Find(&rows); result.Error != nil {
		return result.Error
	}
	if len(rows) == 0 {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "文件不存在")
	}
	txErr := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		return tx.Where("tenant_id = ? AND id IN ?", id.TenantID, ids).Delete(&database.FileObject{}).Error
	})
	if txErr != nil {
		return txErr
	}
	for _, row := range rows {
		if err := store.Delete(c.Request().Context(), row.StorageKey); err != nil {
			// Metadata is already gone. Keep the API successful and allow an
			// operator's storage reconciliation job to remove an orphan.
			continue
		}
	}
	return legacyOK(c, map[string]any{"deleted": len(rows)})
}

func parseFileIDs(c *echo.Context) []uint64 {
	values := append([]string{}, c.QueryParams()["id"]...)
	values = append(values, c.QueryParams()["ids"]...)
	if value := strings.TrimSpace(c.Param("id")); value != "" {
		values = append(values, value)
	}
	var body struct {
		ID  any   `json:"id"`
		IDs []any `json:"ids"`
	}
	if c.Request().Method != http.MethodGet {
		_ = c.Bind(&body)
		if body.ID != nil {
			values = append(values, fmt.Sprint(body.ID))
		}
		for _, value := range body.IDs {
			values = append(values, fmt.Sprint(value))
		}
	}
	ids := make([]uint64, 0, len(values))
	seen := map[uint64]bool{}
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			n, _ := strconv.ParseUint(strings.TrimSpace(part), 10, 64)
			if n > 0 && !seen[n] {
				seen[n] = true
				ids = append(ids, n)
			}
		}
	}
	return ids
}

func (s *Service) legacyFileDownload(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var tenantRow database.Tenant
	if result := s.DB.WithContext(c.Request().Context()).Select("code").First(&tenantRow, id.TenantID); result.Error != nil {
		return result.Error
	}
	if !strings.EqualFold(strings.TrimSpace(c.Param("tenantCode")), tenantRow.Code) {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "文件不存在")
	}
	requestedKey := filepath.Base(filepath.Clean(c.Param("key")))
	if requestedKey == "." || requestedKey == ".." || requestedKey == "" || strings.Contains(requestedKey, "\\") || !storageKeyLeafPattern.MatchString(requestedKey) {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "文件不存在")
	}
	var row database.FileObject
	if result := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ? AND status = ?", id.TenantID, "active").Where("storage_key LIKE ?", "%/"+requestedKey).First(&row); result.Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "文件不存在")
	}
	store, err := s.fileStore()
	if err != nil {
		return err
	}
	reader, err := store.Open(c.Request().Context(), row.StorageKey)
	if err != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "文件内容不存在")
	}
	defer reader.Close()
	c.Response().Header().Set(echo.HeaderContentType, row.MIME)
	c.Response().Header().Set(echo.HeaderContentDisposition, "inline; filename*=UTF-8''"+urlEscapeFileName(row.Name))
	c.Response().Header().Set(echo.HeaderContentLength, strconv.FormatInt(row.Size, 10))
	c.Response().Header().Set("Cache-Control", "private, max-age=300")
	return c.Stream(http.StatusOK, row.MIME, reader)
}

func urlEscapeFileName(name string) string {
	return url.PathEscape(name)
}

func safeFileName(raw string) (string, string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", errors.New("invalid name")
	}
	// Keep only the final path component. Storage keys are generated by the
	// server, so an uploaded path can never influence the persisted location.
	raw = strings.ReplaceAll(raw, "\\", "/")
	name := filepath.Base(raw)
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || r == '/' || r == '\\' {
			return -1
		}
		return r
	}, name)
	if name == "" || name == "." || name == ".." || len([]rune(name)) > 180 {
		return "", "", errors.New("invalid name")
	}
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" || len(ext) > 20 || strings.ContainsAny(ext, " /\\") {
		return "", "", errors.New("invalid extension")
	}
	return name, ext, nil
}

func validateFileType(name, ext, supplied string, data []byte) (string, error) {
	allowed := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
		".pdf": "application/pdf", ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json", ".xml": "application/xml", ".zip": "application/zip", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xls": "application/vnd.ms-excel", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	}
	want, ok := allowed[ext]
	if !ok {
		return "", httpx.NewError(http.StatusUnsupportedMediaType, "FILE_TYPE_UNSUPPORTED", "不支持该文件类型")
	}
	detected := http.DetectContentType(data)
	if supplied != "" {
		supplied = strings.TrimSpace(strings.Split(supplied, ";")[0])
	}
	if supplied != "" && supplied != "application/octet-stream" && supplied != want && !(want == "text/plain" && strings.HasPrefix(supplied, "text/")) {
		return "", httpx.NewError(http.StatusUnsupportedMediaType, "FILE_MIME_MISMATCH", "文件类型与扩展名不匹配")
	}
	// Office XML files are ZIP containers and browsers often report either
	// application/zip or an empty type. Images/PDFs must match their signature.
	if want != "application/zip" && !strings.HasPrefix(want, "application/vnd.openxmlformats") && !strings.HasPrefix(want, "application/vnd.ms-") && want != "text/plain" && want != "text/csv" && want != "image/svg+xml" && !mimeMatch(detected, want) {
		return "", httpx.NewError(http.StatusUnsupportedMediaType, "FILE_CONTENT_MISMATCH", "文件内容与扩展名不匹配")
	}
	return want, nil
}

func mimeMatch(detected, expected string) bool {
	if detected == expected {
		return true
	}
	if expected == "image/jpeg" && detected == "image/jpeg" {
		return true
	}
	return false
}

func randomFileID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		// crypto/rand failures are exceptionally rare; the hash still avoids
		// exposing the original name while preserving a valid storage key.
		h := sha256.Sum256([]byte(strconv.FormatInt(time.Now().UnixNano(), 10)))
		return hex.EncodeToString(h[:16])
	}
	return hex.EncodeToString(raw[:])
}

// Canonical API wrappers let new modules use the same storage behavior without
// depending on the legacy response envelope.
func (s *Service) uploadFileCanonical(c *echo.Context) error {
	return s.legacyFileUpload(c)
}
