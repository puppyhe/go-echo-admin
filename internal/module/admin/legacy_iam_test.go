package admin

import (
	"context"
	"testing"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

func TestIAMRoleAssignmentIsTenantScoped(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	var one database.Tenant
	if err := s.DB.Where("code=?", "one").First(&one).Error; err != nil {
		t.Fatal(err)
	}
	role := database.Role{TenantID: one.ID, Name: "租户编辑", Code: "tenant_editor", Status: "active"}
	if err := s.DB.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	var admin database.User
	if err := s.DB.Where("username=?", "admin").First(&admin).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.ensureIAMSchema(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.replaceUserRoles(ctx, tenant.Identity{TenantID: one.ID, UserID: admin.ID, MembershipID: 1}, admin.ID, []uint64{role.ID}); err != nil {
		t.Fatal(err)
	}
	var count int64
	s.DB.Model(&database.RoleMembership{}).Where("tenant_id=? AND user_id=? AND role_id=?", one.ID, admin.ID, role.ID).Count(&count)
	if count != 1 {
		t.Fatalf("expected role assignment, got %d", count)
	}
	if err := s.replaceUserRoles(ctx, tenant.Identity{TenantID: one.ID, UserID: admin.ID, MembershipID: 1}, admin.ID, []uint64{role.ID + 100000}); err == nil {
		t.Fatal("cross-tenant or unknown role must be rejected")
	}
}

func TestIAMMembershipPasswordAndProfileIsolation(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	if err := s.ensureIAMSchema(ctx); err != nil {
		t.Fatal(err)
	}
	var first database.Tenant
	if err := s.DB.Where("code=?", "one").First(&first).Error; err != nil {
		t.Fatal(err)
	}
	var user database.User
	if err := s.DB.Where("username=?", "admin").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	var second database.Tenant
	if err := s.DB.Create(&database.Tenant{Name: "Two", Code: "two", Status: "active"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Where("code=?", "two").First(&second).Error; err != nil {
		t.Fatal(err)
	}
	hash := "tenant-two-hash"
	if err := s.DB.Create(&database.TenantMembership{TenantID: second.ID, UserID: user.ID, Status: "active", PasswordHash: &hash}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.saveProfile(ctx, iamProfile{TenantID: first.ID, UserID: user.ID, Nickname: "一号管理员", Status: "active"}); err != nil {
		t.Fatal(err)
	}
	if err := s.saveProfile(ctx, iamProfile{TenantID: second.ID, UserID: user.ID, Nickname: "二号管理员", Status: "active"}); err != nil {
		t.Fatal(err)
	}
	var p1, p2 iamProfile
	s.DB.Table("iam_user_profiles").Where("tenant_id=? AND user_id=?", first.ID, user.ID).First(&p1)
	s.DB.Table("iam_user_profiles").Where("tenant_id=? AND user_id=?", second.ID, user.ID).First(&p2)
	if p1.Nickname != "一号管理员" || p2.Nickname != "二号管理员" {
		t.Fatalf("profiles crossed tenant boundary: %#v %#v", p1, p2)
	}
	if _, err := s.Login(ctx, loginRequest{Username: "admin", Password: "correct horse battery", TenantCode: "two"}, "req", "127.0.0.1"); err == nil {
		t.Fatal("tenant-specific password must isolate the shared global password")
	}
}
