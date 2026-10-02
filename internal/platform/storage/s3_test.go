package storage

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestS3StoreUsesTenantSafeObjectPathAndSignature(t *testing.T) {
	var method, requestPath, auth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method, requestPath, auth = r.Method, r.URL.Path, r.Header.Get("Authorization")
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte("payload"))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	store, err := NewS3(S3Config{Endpoint: server.URL, Bucket: "echo", Region: "us-east-1", AccessKey: "key", SecretKey: "secret", UsePathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Put(context.Background(), "tenants/1/file.bin", strings.NewReader("payload")); err != nil {
		t.Fatal(err)
	}
	if method != http.MethodPut || requestPath != "/echo/tenants/1/file.bin" || !strings.HasPrefix(auth, "AWS4-HMAC-SHA256 ") {
		t.Fatalf("unexpected request %s %s %s", method, requestPath, auth)
	}
	reader, err := store.Open(context.Background(), "tenants/1/file.bin")
	if err != nil {
		t.Fatal(err)
	}
	content, _ := io.ReadAll(reader)
	_ = reader.Close()
	if string(content) != "payload" {
		t.Fatalf("unexpected body %q", content)
	}
	if err := store.Delete(context.Background(), "tenants/1/file.bin"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Open(context.Background(), "../escape"); err == nil {
		t.Fatal("path traversal was accepted")
	}
}
