package admin

import (
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
	"gorm.io/gorm"
)

const apiResourceAuthorizedKey = "echo-admin.api-resource-authorized"

// authorizeAPIResource applies the API registry after the session has been
// authenticated and before a handler executes. API resources are opt-in: a
// route that has not been synchronized into api_resources keeps the existing
// menu/permission behavior so older deployments remain compatible.
//
// A registered resource is enabled for a tenant unless an explicit disabled
// TenantAPIGrant exists. Once one or more roles are assigned to a resource,
// the caller must hold one of those roles. Platform and tenant administrators
// retain their operational-owner bypass, consistent with RequirePermission.
func (s *Service) authorizeAPIResource(c *echo.Context, id tenant.Identity) error {
	claims, hasClaims := c.Get("claims").(Claims)
	isScopedToken := isScopedAPIToken(hasClaims, claims)
	// API tokens carry the role selected at issuance. Even when the backing
	// user is a global platform operator, a scoped token must not silently
	// expand back to that user's browser privileges.
	if id.PlatformAdmin && !isScopedToken {
		return nil
	}

	method := strings.ToUpper(strings.TrimSpace(c.Request().Method))
	path := strings.TrimSpace(c.Path())
	if path == "" {
		path = strings.TrimSpace(c.Request().URL.Path)
	}
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		return nil
	}

	ctx := c.Request().Context()
	var resource database.APIResource
	result := s.DB.WithContext(ctx).Where("method = ? AND path = ?", method, path).First(&resource)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return nil
	}
	if result.Error != nil {
		return result.Error
	}

	// The tenant grant is deliberately sparse. Missing means enabled; an
	// explicit false is the only way for a tenant to disable a global API.
	var grant database.TenantAPIGrant
	if result := s.DB.WithContext(ctx).Where("tenant_id = ? AND api_resource_id = ?", id.TenantID, resource.ID).First(&grant); result.Error == nil && !grant.Enabled {
		return httpx.NewError(http.StatusForbidden, "API_DISABLED", "当前租户已禁用该接口")
	} else if result.Error != nil && !errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return result.Error
	}

	var assigned int64
	if err := s.DB.WithContext(ctx).Model(&database.IAMRoleAPI{}).Where("tenant_id = ? AND api_resource_id = ?", id.TenantID, resource.ID).Count(&assigned).Error; err != nil {
		return err
	}
	if assigned == 0 {
		// The resource is registered and enabled, but no API role assignment
		// has been configured yet. Keep compatibility with the existing menu
		// permission chain; a scoped token still has to pass that chain.
		return nil
	}

	// tenant_admin is the tenant's operational owner and follows the same
	// bypass semantics as menu permissions.
	var tenantAdmin int64
	if err := s.DB.WithContext(ctx).Table("role_memberships rm").
		Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").
		Where("rm.user_id = ? AND rm.tenant_id = ? AND r.code = ? AND r.status = ?", id.UserID, id.TenantID, "tenant_admin", "active").
		Count(&tenantAdmin).Error; err != nil {
		return err
	}
	if tenantAdmin > 0 && !isScopedToken {
		return nil
	}

	var allowed int64
	query := s.DB.WithContext(ctx).Table("role_memberships rm").
		Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id AND r.status = ?", "active").
		Joins("JOIN iam_role_apis ra ON ra.role_id = rm.role_id AND ra.tenant_id = rm.tenant_id").
		Where("rm.user_id = ? AND rm.tenant_id = ? AND ra.api_resource_id = ?", id.UserID, id.TenantID, resource.ID)
	if isScopedToken {
		query = query.Where("rm.role_id = ?", claims.RoleID)
	}
	if err := query.Count(&allowed).Error; err != nil {
		return err
	}
	if allowed == 0 {
		return httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "当前账号没有访问该接口的权限")
	}
	c.Set(apiResourceAuthorizedKey, true)
	return nil
}

func isScopedAPIToken(hasClaims bool, claims Claims) bool {
	return hasClaims && claims.TokenType == "api_access" && claims.RoleID > 0
}
