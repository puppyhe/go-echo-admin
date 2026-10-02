package admin

import (
	"context"
	"net/http"
	"testing"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

func TestTenantProfileCanEditPlatformIdentityWithoutGlobalMutation(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	if err := s.ensureIAMSchema(ctx); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	var before database.User
	if err := s.DB.Where("id=?", id.UserID).First(&before).Error; err != nil {
		t.Fatal(err)
	}
	c := orgContext(s, http.MethodPut, "/user/setUserInfo", map[string]any{"ID": id.UserID, "nickName": "租户管理员", "email": "tenant@example.com", "enable": 2}, id)
	if err := s.legacySetUserInfo(c); err != nil {
		t.Fatal(err)
	}
	var after database.User
	if err := s.DB.Where("id=?", id.UserID).First(&after).Error; err != nil {
		t.Fatal(err)
	}
	if after.PasswordHash != before.PasswordHash || !after.PlatformAdmin {
		t.Fatal("tenant profile update changed global identity")
	}
	var membership database.TenantMembership
	if err := s.DB.Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&membership).Error; err != nil {
		t.Fatal(err)
	}
	if membership.Status != "disabled" {
		t.Fatalf("membership status was not synchronized: %s", membership.Status)
	}
	var profile iamProfile
	if err := s.DB.Table("iam_user_profiles").Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&profile).Error; err != nil {
		t.Fatal(err)
	}
	if profile.Nickname != "租户管理员" || profile.Email == nil || *profile.Email != "tenant@example.com" {
		t.Fatalf("profile not persisted: %#v", profile)
	}
}

func TestSelfProfileUpdateUsesIdentityAndOnlyAllowsProfileFields(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	if err := s.ensureIAMSchema(ctx); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	var before database.TenantMembership
	if err := s.DB.Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&before).Error; err != nil {
		t.Fatal(err)
	}
	var roleCount int64
	s.DB.Model(&database.RoleMembership{}).Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).Count(&roleCount)

	// Client supplied IDs and administrative fields are rejected before any
	// profile write, so a self-service caller cannot target another user or
	// change membership/role state.
	for _, payload := range []map[string]any{
		{"ID": id.UserID + 999, "nickName": "不应写入"},
		{"roles": []uint64{999}, "nickName": "不应写入"},
		{"enable": 2, "nickName": "不应写入"},
	} {
		if err := s.legacySetSelfInfo(orgContext(s, http.MethodPut, "/user/setSelfInfo", payload, id)); err == nil {
			t.Fatalf("administrative self-service payload unexpectedly succeeded: %#v", payload)
		}
	}

	if err := s.legacySetSelfInfo(orgContext(s, http.MethodPut, "/user/setSelfInfo", map[string]any{
		"nickName": "新的昵称", "phone": "13800000000", "email": "self@example.com", "avatar": "avatar-key",
	}, id)); err != nil {
		t.Fatal(err)
	}
	var profile iamProfile
	if err := s.DB.Table("iam_user_profiles").Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&profile).Error; err != nil {
		t.Fatal(err)
	}
	if profile.Nickname != "新的昵称" || profile.Phone != "13800000000" || profile.Email == nil || *profile.Email != "self@example.com" || profile.Avatar != "avatar-key" {
		t.Fatalf("self profile was not updated: %#v", profile)
	}
	var after database.TenantMembership
	if err := s.DB.Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&after).Error; err != nil {
		t.Fatal(err)
	}
	if after.Status != before.Status {
		t.Fatalf("self profile update changed membership status from %q to %q", before.Status, after.Status)
	}
	var afterRoleCount int64
	s.DB.Model(&database.RoleMembership{}).Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).Count(&afterRoleCount)
	if afterRoleCount != roleCount {
		t.Fatalf("self profile update changed role memberships from %d to %d", roleCount, afterRoleCount)
	}
}

func TestTenantProfileEditPreservesExistingPlatformRole(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	var role database.Role
	if err := s.DB.Where("tenant_id=? AND code=?", id.TenantID, "platform_admin").First(&role).Error; err != nil {
		t.Fatal(err)
	}
	c := orgContext(s, http.MethodPut, "/user/setUserInfo", map[string]any{
		"ID": id.UserID, "nickName": "平台管理员", "authorityIds": []uint64{role.ID}, "enable": 1,
	}, id)
	if err := s.legacySetUserInfo(c); err != nil {
		t.Fatalf("editing an existing platform role should succeed: %v", err)
	}
	var count int64
	s.DB.Model(&database.RoleMembership{}).Where("tenant_id=? AND role_id=? AND user_id=?", id.TenantID, role.ID, id.UserID).Count(&count)
	if count != 1 {
		t.Fatalf("existing platform role was not preserved, count=%d", count)
	}
}

func TestPlatformRoleUsersNoOpSaveIsAllowed(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	var role database.Role
	if err := s.DB.Where("tenant_id=? AND code=?", id.TenantID, "platform_admin").First(&role).Error; err != nil {
		t.Fatal(err)
	}
	var memberships []database.RoleMembership
	if err := s.DB.Where("tenant_id=? AND role_id=?", id.TenantID, role.ID).Find(&memberships).Error; err != nil {
		t.Fatal(err)
	}
	ids := make([]uint64, 0, len(memberships))
	for _, membership := range memberships {
		ids = append(ids, membership.UserID)
	}
	c := orgContext(s, http.MethodPost, "/authority/setRoleUsers", map[string]any{
		"authorityId": role.ID, "userIds": ids,
	}, id)
	if err := s.legacySetRoleUsers(c); err != nil {
		t.Fatalf("saving an unchanged platform role user list should succeed: %v", err)
	}
}

func TestReplaceUserRolesProtectsLastActiveAdminAndAllowsClear(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	if err := s.ensureIAMSchema(ctx); err != nil {
		t.Fatal(err)
	}
	var ten database.Tenant
	if err := s.DB.Where("code=?", "one").First(&ten).Error; err != nil {
		t.Fatal(err)
	}
	var admin database.User
	if err := s.DB.Where("username=?", "admin").First(&admin).Error; err != nil {
		t.Fatal(err)
	}
	var role database.Role
	if err := s.DB.Where("tenant_id=? AND code=?", ten.ID, "tenant_admin").First(&role).Error; err != nil {
		role = database.Role{TenantID: ten.ID, Name: "租户管理员", Code: "tenant_admin", Status: "active"}
		if err := s.DB.Create(&role).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := s.DB.Create(&database.RoleMembership{TenantID: ten.ID, RoleID: role.ID, UserID: admin.ID}).Error; err != nil {
		t.Fatal(err)
	}
	id := tenant.Identity{TenantID: ten.ID, UserID: admin.ID, MembershipID: 1}
	if err := s.replaceUserRoles(ctx, id, admin.ID, nil); err == nil {
		t.Fatal("last active admin role was cleared")
	}
	var user database.User
	if err := s.DB.Create(&database.User{Username: "operator", PasswordHash: "hash", Status: "active"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Where("username=?", "operator").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.TenantMembership{TenantID: ten.ID, UserID: user.ID, Status: "active"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Create(&database.RoleMembership{TenantID: ten.ID, RoleID: role.ID, UserID: user.ID}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.replaceUserRoles(ctx, id, admin.ID, nil); err != nil {
		t.Fatal(err)
	}
	var count int64
	s.DB.Model(&database.RoleMembership{}).Where("tenant_id=? AND role_id=? AND user_id=?", ten.ID, role.ID, admin.ID).Count(&count)
	if count != 0 {
		t.Fatal("empty role assignment did not clear memberships")
	}
}

func TestRoleCreateAcceptsReferenceAuthorityPayloadWithoutCode(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	c := orgContext(s, http.MethodPost, "/authority/createAuthority", map[string]any{"authorityId": 1001, "authorityName": "审计员", "parentId": 0}, id)
	if err := s.legacyRoleMutation(c); err != nil {
		t.Fatal(err)
	}
	var role database.Role
	if err := s.DB.Where("tenant_id=? AND name=?", id.TenantID, "审计员").First(&role).Error; err != nil {
		t.Fatal(err)
	}
	if role.Code == "" {
		t.Fatal("reference role payload produced an empty code")
	}
}
