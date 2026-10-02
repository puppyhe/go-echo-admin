package admin

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

// apiTokenClaims resolves a token issued by the API Token page. The clear
// token is only accepted through its hash, and the associated role membership
// is checked before the request is allowed to enter the normal permission
// middleware chain.
func (s *Service) apiTokenClaims(ctx context.Context, raw string) (Claims, error) {
	if !strings.HasPrefix(raw, "gea_") {
		return Claims{}, errors.New("not an echo admin api token")
	}
	var token database.APIToken
	if err := s.DB.WithContext(ctx).
		Where("token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)", hashToken(raw), time.Now()).
		First(&token).Error; err != nil {
		return Claims{}, errors.New("api token is expired or revoked")
	}
	var membership database.TenantMembership
	if err := s.DB.WithContext(ctx).
		Where("tenant_id = ? AND user_id = ? AND status = ?", token.TenantID, token.UserID, "active").
		First(&membership).Error; err != nil {
		return Claims{}, errors.New("api token membership is unavailable")
	}
	var role database.Role
	if err := s.DB.WithContext(ctx).
		Table("roles r").
		Joins("JOIN role_memberships rm ON rm.role_id = r.id AND rm.tenant_id = r.tenant_id").
		Where("r.id = ? AND r.tenant_id = ? AND r.status = ? AND rm.user_id = ?", token.AuthorityID, token.TenantID, "active", token.UserID).
		First(&role).Error; err != nil {
		return Claims{}, errors.New("api token role is unavailable")
	}
	return Claims{UserID: token.UserID, TenantID: token.TenantID, MembershipID: membership.ID, RoleID: token.AuthorityID, TokenType: "api_access"}, nil
}

// apiTokenIdentity is kept separate for tests and for future handlers that
// may want to distinguish automation credentials from browser sessions.
func apiTokenIdentity(claims Claims) tenant.Identity {
	return tenant.Identity{TenantID: claims.TenantID, UserID: claims.UserID, MembershipID: claims.MembershipID}
}
