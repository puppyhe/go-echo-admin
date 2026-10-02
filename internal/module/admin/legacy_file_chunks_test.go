package admin

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/storage"
)

func chunkContext(method, target string, body *bytes.Reader, identityValue any) *echo.Context {
	var reader io.Reader = http.NoBody
	if body != nil {
		reader = body
	}
	req := httptest.NewRequest(method, target, reader)
	if body != nil {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	c.Set(identityKey, identityValue)
	return c
}

func chunkResponse(t *testing.T, c *echo.Context) map[string]any {
	t.Helper()
	var envelope struct {
		Data map[string]any `json:"data"`
	}
	body := c.Response().(*echo.Response).ResponseWriter.(*httptest.ResponseRecorder).Body.Bytes()
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("response=%s: %v", body, err)
	}
	return envelope.Data
}

func TestFileChunkUploadCanResumeAndComplete(t *testing.T) {
	s := testService(t)
	store, err := storage.NewLocal(filepath.Join(t.TempDir(), "uploads"))
	if err != nil {
		t.Fatal(err)
	}
	s.Storage = store
	if err := s.Seed(context.Background(), "alice", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "acme", "alice")
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	initBody, _ := json.Marshal(map[string]any{"name": "avatar.png", "mime": "image/png", "size": len(png), "chunkSize": len(png) / 2, "totalParts": 2})
	initCtx := chunkContext(http.MethodPost, "/files/multipart/initiate", bytes.NewReader(initBody), id)
	if err := s.fileChunkInitiate(initCtx); err != nil {
		t.Fatal(err)
	}
	data := chunkResponse(t, initCtx)
	uploadID := data["uploadId"].(string)
	chunkSize := int(data["chunkSize"].(float64))
	for i, part := range [][]byte{png[:chunkSize], png[chunkSize:]} {
		req := httptest.NewRequest(http.MethodPut, "/files/multipart/"+uploadID+"/parts/"+strconv.Itoa(i+1), bytes.NewReader(part))
		rec := httptest.NewRecorder()
		c := echo.New().NewContext(req, rec)
		c.Set(identityKey, id)
		c.SetPath("/files/multipart/:id/parts/:part")
		c.SetPathValues(echo.PathValues{{Name: "id", Value: uploadID}, {Name: "part", Value: strconv.Itoa(i + 1)}})
		if err := s.fileChunkPut(c); err != nil {
			t.Fatalf("part %d: %v", i+1, err)
		}
	}
	statusCtx := chunkContext(http.MethodGet, "/files/multipart/"+uploadID, bytes.NewReader(nil), id)
	statusCtx.SetPath("/files/multipart/:id")
	statusCtx.SetPathValues(echo.PathValues{{Name: "id", Value: uploadID}})
	if err := s.fileChunkStatus(statusCtx); err != nil {
		t.Fatal(err)
	}
	status := chunkResponse(t, statusCtx)
	if int(status["received"].(float64)) != len(png) {
		t.Fatalf("received=%v", status["received"])
	}
	completeBody, _ := json.Marshal(map[string]any{})
	completeCtx := chunkContext(http.MethodPost, "/files/multipart/"+uploadID+"/complete", bytes.NewReader(completeBody), id)
	completeCtx.SetPath("/files/multipart/:id/complete")
	completeCtx.SetPathValues(echo.PathValues{{Name: "id", Value: uploadID}})
	if err := s.fileChunkComplete(completeCtx); err != nil {
		t.Fatal(err)
	}
	completed := chunkResponse(t, completeCtx)
	if completed["status"] != "completed" {
		t.Fatalf("completion=%v", completed)
	}
	var session database.FileUploadSession
	if err := s.DB.First(&session, "id=?", uploadID).Error; err != nil {
		t.Fatal(err)
	}
	if session.Status != "completed" {
		t.Fatalf("session status=%s", session.Status)
	}
	if !strings.Contains(completeCtx.Response().(*echo.Response).ResponseWriter.(*httptest.ResponseRecorder).Body.String(), "fileId") {
		t.Fatal("completion did not return file id")
	}
}
