package admin

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"golang.org/x/crypto/bcrypt"
)

func TestP0ChangePasswordUsesTenantCredential(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	c := orgContext(s, http.MethodPost, "/user/changePassword", map[string]any{"password": "correct horse battery", "newPassword": "new password 123"}, id)
	if err := s.legacyChangePassword(c); err != nil {
		t.Fatal(err)
	}
	var membership database.TenantMembership
	if err := s.DB.Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&membership).Error; err != nil {
		t.Fatal(err)
	}
	if membership.PasswordHash == nil || bcrypt.CompareHashAndPassword([]byte(*membership.PasswordHash), []byte("new password 123")) != nil {
		t.Fatal("tenant credential was not updated")
	}
}

func TestP0APITokenIssueListAndRevoke(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	if err := s.Seed(ctx, "admin", "correct horse battery", "one", "One", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "one", "admin")
	id.PlatformAdmin = true
	var role database.Role
	if err := s.DB.Where("tenant_id=? AND code=?", id.TenantID, "platform_admin").First(&role).Error; err != nil {
		t.Fatal(err)
	}
	issue := orgContext(s, http.MethodPost, "/sysApiToken/createApiToken", map[string]any{"userId": id.UserID, "authorityId": role.ID, "days": 30}, id)
	if err := s.legacyAPITokenCreate(issue); err != nil {
		t.Fatal(err)
	}
	var token database.APIToken
	if err := s.DB.Where("tenant_id=?", id.TenantID).First(&token).Error; err != nil {
		t.Fatal(err)
	}
	list := orgContext(s, http.MethodPost, "/sysApiToken/getApiTokenList", map[string]any{"page": 1, "pageSize": 10}, id)
	if err := s.legacyAPITokenList(list); err != nil {
		t.Fatal(err)
	}
	remove := orgContext(s, http.MethodPost, "/sysApiToken/deleteApiToken", map[string]any{"ID": token.ID}, id)
	if err := s.legacyAPITokenDelete(remove); err != nil {
		t.Fatal(err)
	}
	if err := s.DB.Where("id=?", token.ID).First(&token).Error; err != nil {
		t.Fatal(err)
	}
	if token.RevokedAt == nil {
		t.Fatal("token was not revoked")
	}
}

func TestP0APITokenAuthenticatesThroughTenantMembership(t *testing.T) {
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
	clear := "gea_test_api_token"
	if err := s.DB.Create(&database.APIToken{TenantID: id.TenantID, UserID: id.UserID, AuthorityID: role.ID, TokenHash: hashToken(clear), ExpiresAt: ptrTime(time.Now().Add(time.Hour))}).Error; err != nil {
		t.Fatal(err)
	}
	claims, err := s.apiTokenClaims(ctx, clear)
	if err != nil {
		t.Fatal(err)
	}
	if claims.TokenType != "api_access" || claims.TenantID != id.TenantID || claims.MembershipID != id.MembershipID {
		t.Fatalf("unexpected API token claims: %#v", claims)
	}
	if _, err := s.apiTokenClaims(ctx, "gea_expired"); err == nil {
		t.Fatal("unknown API token unexpectedly authenticated")
	}
}

func ptrTime(value time.Time) *time.Time { return &value }
