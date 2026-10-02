package admin

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/storage"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

func multipartFileContext(t *testing.T, identity tenant.Identity, filename, contentType string, data []byte) *echo.Context {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
	header.Set("Content-Type", contentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/fileUploadAndDownload/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	c.Set(identityKey, identity)
	return c
}

func TestFileCenterStoresTenantScopedMetadataAndBytes(t *testing.T) {
	s := testService(t)
	root := t.TempDir()
	store, err := storage.NewLocal(filepath.Join(root, "uploads"))
	if err != nil {
		t.Fatal(err)
	}
	s.Storage = store
	if err := s.Seed(context.Background(), "alice", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	if err := s.Seed(context.Background(), "bob", "correct horse battery", "beta", "Beta", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "acme", "alice")
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	ctx := multipartFileContext(t, id, "avatar.png", "image/png", png)
	if err := s.legacyFileUpload(ctx); err != nil {
		t.Fatal(err)
	}
	var row database.FileObject
	if err := s.DB.Where("tenant_id = ?", id.TenantID).First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(row.StorageKey, "tenants/"+fmt.Sprint(id.TenantID)+"/") || row.Hash == "" || row.Size == 0 {
		t.Fatalf("unexpected file metadata: %#v", row)
	}
	if _, err := os.Stat(filepath.Join(root, "uploads", filepath.FromSlash(row.StorageKey))); err != nil {
		t.Fatalf("stored bytes missing: %v", err)
	}
	other := orgIdentity(t, s, "beta", "bob")
	c := orgContext(s, http.MethodGet, "/fileUploadAndDownload/getFileList", nil, other)
	if err := s.legacyFileList(c); err != nil {
		t.Fatal(err)
	}
	response := c.Response().(*echo.Response)
	if !strings.Contains(response.ResponseWriter.(*httptest.ResponseRecorder).Body.String(), `"total":0`) {
		t.Fatal("cross-tenant file list exposed rows")
	}
}

func TestFileCenterRejectsUnsupportedAndUnsafeFiles(t *testing.T) {
	name, _, nameErr := safeFileName("../secret.exe")
	if nameErr != nil || name != "secret.exe" {
		t.Fatal("path traversal unexpectedly changed safe name")
	}
	if _, err := validateFileType("secret.exe", ".exe", "application/octet-stream", []byte("MZ")); err == nil {
		t.Fatal("unsupported executable type accepted")
	}
	if _, err := validateFileType("photo.png", ".png", "image/png", []byte("plain text")); err == nil {
		t.Fatal("MIME/content mismatch accepted")
	}
	if got, err := validateFileType("notes.txt", ".txt", "text/plain", []byte("hello")); err != nil || got != "text/plain" {
		t.Fatalf("text file rejected: %q %v", got, err)
	}
}
