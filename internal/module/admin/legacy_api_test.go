package admin

import (
	"context"
	"net/http"
	"testing"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
)

func TestLegacyAPIRegistryIsTenantReadableAndPlatformWritable(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "platform", "password-123", "platform", "平台", true); err != nil {
		t.Fatal(err)
	}
	if err := s.Seed(ctx, "tenant", "password-123", "tenant", "租户", false); err != nil {
		t.Fatal(err)
	}
	platform := orgIdentity(t, s, "platform", "platform")
	platform.PlatformAdmin = true
	tenantID := orgIdentity(t, s, "tenant", "tenant")

	create := orgContext(s, http.MethodPost, "/api/createApi", map[string]any{
		"path": "/reports/list", "method": "get", "apiGroup": "报表", "description": "报表列表",
	}, platform)
	if err := s.legacyAPIMutation(create); err != nil {
		t.Fatal(err)
	}
	var resource database.APIResource
	if err := s.DB.Where("path = ?", "/reports/list").First(&resource).Error; err != nil {
		t.Fatal(err)
	}

	read := orgContext(s, http.MethodPost, "/api/getApiList", map[string]any{"page": 1, "pageSize": 20}, tenantID)
	if err := s.legacyAPIList(read); err != nil {
		t.Fatal(err)
	}
	// The handler returns a normal envelope; the recorder is intentionally
	// hidden behind Echo's response writer, so the absence of an error is the
	// assertion here.

	denied := orgContext(s, http.MethodPost, "/api/updateApi", map[string]any{
		"ID": resource.ID, "path": "/reports/changed", "method": "GET", "apiGroup": "报表", "description": "修改",
	}, tenantID)
	err := s.legacyAPIMutation(denied)
	if err == nil {
		t.Fatal("tenant unexpectedly changed a global API")
	}
	if _, ok := err.(*httpx.Error); !ok {
		t.Fatalf("expected domain permission error, got %T: %v", err, err)
	}

	role := database.Role{TenantID: tenantID.TenantID, Name: "审计", Code: "auditor", Status: "active"}
	if err := s.DB.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	set := orgContext(s, http.MethodPost, "/api/setApiRoles", map[string]any{
		"path": "/reports/list", "method": "GET", "authorityIds": []uint64{role.ID},
	}, tenantID)
	if err := s.legacyAPISetRoles(set); err != nil {
		t.Fatal(err)
	}
	var assignment database.IAMRoleAPI
	if err := s.DB.Where("tenant_id = ? AND role_id = ? AND api_resource_id = ?", tenantID.TenantID, role.ID, resource.ID).First(&assignment).Error; err != nil {
		t.Fatal(err)
	}
}

func TestLegacyAPISetRolesRejectsCrossTenantRole(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "one", "password-123", "one", "一", false); err != nil {
		t.Fatal(err)
	}
	if err := s.Seed(ctx, "two", "password-123", "two", "二", false); err != nil {
		t.Fatal(err)
	}
	one := orgIdentity(t, s, "one", "one")
	two := orgIdentity(t, s, "two", "two")
	resource := database.APIResource{Method: "GET", Path: "/cross", Group: "系统", Permission: "跨租户"}
	if err := s.DB.Create(&resource).Error; err != nil {
		t.Fatal(err)
	}
	role := database.Role{TenantID: two.TenantID, Name: "二租户角色", Code: "two-role", Status: "active"}
	if err := s.DB.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	set := orgContext(s, http.MethodPost, "/api/setApiRoles", map[string]any{
		"path": "/cross", "method": "GET", "authorityIds": []uint64{role.ID},
	}, one)
	if err := s.legacyAPISetRoles(set); err == nil {
		t.Fatal("cross-tenant role assignment unexpectedly succeeded")
	}
}
