package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/puppyhe/go-echo-admin/internal/testdb"
)

// TestLegacyExportDownloadContract protects the two-step contract used by
// the original export-template page: request a URL, then download bytes from
// its authenticated *ByToken endpoint.
func TestLegacyExportDownloadContract(t *testing.T) {
	cfg := &Config{Environment: "development"}
	cfg.Database = testdb.Config(t)
	cfg.Auth.JWTSecret = "01234567890123456789012345678901"
	cfg.Auth.AccessTTL, cfg.Auth.RefreshTTL = time.Minute, time.Hour
	a, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if err := a.Seed(context.Background(), "admin", "correct horse battery", "default", "Default", true); err != nil {
		t.Fatal(err)
	}

	call := func(method, path, body, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		a.Echo.ServeHTTP(rec, req)
		return rec
	}
	login := call(http.MethodPost, "/api/base/login", `{"username":"admin","password":"correct horse battery","tenant_code":"default"}`, "")
	if login.Code != http.StatusOK {
		t.Fatalf("login status=%d body=%s", login.Code, login.Body.String())
	}
	var loginEnvelope struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(login.Body.Bytes(), &loginEnvelope); err != nil || loginEnvelope.Data.Token == "" {
		t.Fatalf("login response=%s", login.Body.String())
	}
	token := loginEnvelope.Data.Token
	// The API page exposes a built-in `api` template on fresh installations;
	// it should work before a user creates any custom export template.
	builtin := call(http.MethodGet, "/api/sysExportTemplate/exportTemplate?templateID=api", "", token)
	if builtin.Code != http.StatusOK {
		t.Fatalf("builtin template status=%d body=%s", builtin.Code, builtin.Body.String())
	}
	var builtinEnvelope struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(builtin.Body.Bytes(), &builtinEnvelope); err != nil || builtinEnvelope.Data.URL == "" {
		t.Fatalf("builtin template response=%s", builtin.Body.String())
	}
	builtinDownload := call(http.MethodGet, builtinEnvelope.Data.URL, "", token)
	if builtinDownload.Code != http.StatusOK || !strings.Contains(builtinDownload.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("builtin download status=%d content-disposition=%q body=%s", builtinDownload.Code, builtinDownload.Header().Get("Content-Disposition"), builtinDownload.Body.String())
	}
	created := call(http.MethodPost, "/api/sysExportTemplate/createSysExportTemplate", `{"name":"Users","templateID":"users"}`, token)
	if created.Code != http.StatusOK {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	requested := call(http.MethodGet, "/api/sysExportTemplate/exportTemplate?templateID=users", "", token)
	if requested.Code != http.StatusOK {
		t.Fatalf("url status=%d body=%s", requested.Code, requested.Body.String())
	}
	var urlEnvelope struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(requested.Body.Bytes(), &urlEnvelope); err != nil || urlEnvelope.Data.URL == "" {
		t.Fatalf("url response=%s", requested.Body.String())
	}
	download := call(http.MethodGet, urlEnvelope.Data.URL, "", token)
	if download.Code != http.StatusOK || !strings.Contains(download.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("download status=%d content-disposition=%q body=%s", download.Code, download.Header().Get("Content-Disposition"), download.Body.String())
	}
}
