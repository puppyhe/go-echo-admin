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

func TestApplicationLoginAndTenantScope(t *testing.T) {
	cfg := &Config{Environment: "development"}
	cfg.Database = testdb.Config(t)
	cfg.Auth.JWTSecret = "01234567890123456789012345678901"
	cfg.Auth.AccessTTL = time.Minute
	cfg.Auth.RefreshTTL = time.Hour
	a, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if err := a.Seed(context.Background(), "admin", "correct horse battery", "default", "Default", true); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{"username":"admin","password":"correct horse battery","tenant_code":"default"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	a.Echo.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login status=%d body=%s", rec.Code, rec.Body.String())
	}
	var envelope struct {
		Code string `json:"code"`
		Data struct {
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Code != "OK" || envelope.Data.AccessToken == "" {
		t.Fatalf("unexpected response: %s", rec.Body.String())
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/users?page=1&page_size=20", nil)
	request.Header.Set("Authorization", "Bearer "+envelope.Data.AccessToken)
	response := httptest.NewRecorder()
	a.Echo.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("users status=%d body=%s", response.Code, response.Body.String())
	}
}
