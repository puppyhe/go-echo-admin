package admin

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/internal/testdb"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

func testService(t *testing.T) *Service {
	t.Helper()
	db := testdb.Open(t)
	s := &Service{DB: db, Config: RuntimeConfig{JWTSecret: "01234567890123456789012345678901", AccessTTL: time.Minute, RefreshTTL: time.Hour}}
	return s
}

func TestSeedAndLogin(t *testing.T) {
	s := testService(t)
	if err := s.Seed(context.Background(), "admin", "correct horse battery", "acme", "Acme", true); err != nil {
		t.Fatal(err)
	}
	result, err := s.Login(context.Background(), loginRequest{Username: "admin", Password: "correct horse battery", TenantCode: "acme"}, "req-1", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	token := result.(tokenResponse)
	if token.AccessToken == "" || token.RefreshToken == "" || token.Tenant == nil || token.Tenant.Code != "acme" {
		t.Fatalf("unexpected login response: %#v", token)
	}
	if len(token.Menus) == 0 {
		t.Fatal("demo seed should create menus")
	}
}

func TestSeedResetsExistingAdministratorCredentials(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "old-password", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	if err := s.Seed(ctx, "admin", "new-password", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PlatformLogin(ctx, "admin", "new-password", "seed-reset", "127.0.0.1"); err != nil {
		t.Fatalf("platform password was not reset: %v", err)
	}
	if _, err := s.Login(ctx, loginRequest{Username: "admin", Password: "new-password", TenantCode: "acme"}, "seed-reset", "127.0.0.1"); err != nil {
		t.Fatalf("tenant password was not reset: %v", err)
	}
	if _, err := s.PlatformLogin(ctx, "admin", "old-password", "seed-reset", "127.0.0.1"); err == nil {
		t.Fatal("old platform password should no longer work")
	}
}

func TestWrongPasswordIsGeneric(t *testing.T) {
	s := testService(t)
	if err := s.Seed(context.Background(), "admin", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	_, err := s.Login(context.Background(), loginRequest{Username: "admin", Password: "wrong", TenantCode: "acme"}, "req-1", "127.0.0.1")
	if err == nil || err.Error() != "AUTH_INVALID_CREDENTIALS: Invalid username or password" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestTenantScopeCannotReadOtherTenant(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	var second database.Tenant
	if err := s.DB.Create(&database.Tenant{Name: "Two", Code: "two", Status: "active"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Where("code = ?", "two").First(&second).Error; err != nil {
		t.Fatal(err)
	}
	var u database.User
	if err := s.DB.Where("username = ?", "admin").First(&u).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.TenantMembership{TenantID: second.ID, UserID: u.ID, Status: "active"}).Error; err != nil {
		t.Fatal(err)
	}
	id := tenant.Identity{TenantID: second.ID, UserID: u.ID, MembershipID: 2}
	listed, err := s.ListUsers(ctx, id, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if listed["total"].(int64) != 1 {
		t.Fatalf("expected one member in tenant two, got %#v", listed)
	}
	if _, err := s.GetUser(ctx, id, 9999); err == nil {
		t.Fatal("cross tenant or missing user should be rejected")
	}
}

func TestMultipleTenantsRequireExplicitSelection(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", true); err != nil {
		t.Fatal(err)
	}
	var tenantTwo database.Tenant
	if err := s.DB.Create(&database.Tenant{Name: "Two", Code: "two", Status: "active"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Where("code = ?", "two").First(&tenantTwo).Error; err != nil {
		t.Fatal(err)
	}
	var user database.User
	if err := s.DB.Where("username = ?", "admin").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.TenantMembership{TenantID: tenantTwo.ID, UserID: user.ID, Status: "active"}).Error; err != nil {
		t.Fatal(err)
	}
	_, err := s.Login(ctx, loginRequest{Username: "admin", Password: "correct horse battery"}, "request", "127.0.0.1")
	if err == nil || !strings.Contains(err.Error(), "TENANT_SELECTION_REQUIRED") {
		t.Fatalf("expected tenant selection, got %v", err)
	}
	selection := err.(*httpx.Error).Data.(map[string]any)["selection_token"].(string)
	claims, parseErr := s.parseToken(selection)
	if parseErr != nil || claims.UserID != user.ID {
		t.Fatalf("invalid selection token: %v", parseErr)
	}
	result, switchErr := s.SwitchTenant(ctx, tenant.Identity{UserID: user.ID}, "two")
	if switchErr != nil {
		t.Fatal(switchErr)
	}
	if result.(tokenResponse).Tenant.Code != "two" {
		t.Fatal("switch did not select requested tenant")
	}
}

func TestPlatformProvisioningFlow(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "platform", "platform-password", "system", "系统租户", false); err != nil {
		t.Fatal(err)
	}
	platform, err := s.PlatformLogin(ctx, "platform", "platform-password", "req-platform", "127.0.0.1")
	if err != nil || platform.AccessToken == "" {
		t.Fatalf("platform login failed: %v", err)
	}
	created, err := s.CreateTenant(ctx, "Acme 中文", "acme", "acme-admin", "acme-password", "联系人", "acme.example.com")
	if err != nil {
		t.Fatal(err)
	}
	if created["tenant"].(TenantView).Code != "acme" {
		t.Fatalf("unexpected tenant: %#v", created)
	}
	result, err := s.Login(ctx, loginRequest{Username: "acme-admin", Password: "acme-password", TenantCode: "acme"}, "req-tenant", "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	tenantToken := result.(tokenResponse)
	if tenantToken.Tenant.Code != "acme" {
		t.Fatalf("tenant login selected wrong tenant: %#v", result)
	}
	paths := map[string]bool{}
	for _, menu := range tenantToken.Menus {
		paths[menu.Path] = true
	}
	for _, path := range []string{"/person", "/iam/positions", "/system/security", "/ops/errors", "/ops/health"} {
		if !paths[path] {
			t.Fatalf("tenant admin baseline menus missing %s", path)
		}
	}
	if paths["/iam/api-tokens"] {
		t.Fatal("tenant admin must not receive the platform-only API token menu")
	}
	var grants int64
	s.DB.Table("role_menus rm").Joins("JOIN roles r ON r.id = rm.role_id").Where("rm.tenant_id = ? AND r.code = ?", created["tenant"].(TenantView).ID, "tenant_admin").Count(&grants)
	if grants == 0 {
		t.Fatal("tenant admin should receive baseline menu permissions")
	}
	if _, err := s.CreateTenant(ctx, "Beta 中文", "beta", "platform", "tenant-only-password", "", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Login(ctx, loginRequest{Username: "platform", Password: "tenant-only-password", TenantCode: "beta"}, "req-beta", "127.0.0.1"); err != nil {
		t.Fatalf("tenant-scoped admin password should work: %v", err)
	}
	if _, err := s.Login(ctx, loginRequest{Username: "platform", Password: "platform-password", TenantCode: "beta"}, "req-beta", "127.0.0.1"); err == nil {
		t.Fatal("global platform password must not bypass tenant-scoped admin password")
	}
}
