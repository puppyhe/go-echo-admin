package admin

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
)

const identityKey = "echo-admin.identity"

// RegisterRoutes adds authentication and the management APIs to an Echo instance.
func RegisterRoutes(e *echo.Echo, s *Service) {
	// The platform flow is intentionally separate from tenant authentication:
	// platform operators sign in first, provision tenants, then tenant users sign in
	// with the returned tenant code.
	e.POST("/api/platform/login", s.platformLogin)
	e.GET("/api/tenancy/info", s.tenancyInfo)
	e.GET("/api/tenancy/resolve", s.tenancyResolve)
	platform := e.Group("/api/platform", s.PlatformAuthMiddleware)
	platform.GET("/tenants", s.platformTenants)
	platform.POST("/tenants", s.platformCreateTenant)
	platform.POST("/tenants/:id/enable", s.platformTenantAction)
	platform.POST("/tenants/:id/disable", s.platformTenantAction)
	platform.POST("/tenants/:id/retry", s.platformTenantAction)

	api := e.Group("/api/v1")
	api.POST("/auth/login", s.login)
	api.POST("/auth/refresh", s.refresh)
	api.POST("/auth/switch-tenant", s.switchTenantSelection)
	protected := api.Group("", s.AuthMiddleware)
	protected.POST("/auth/logout", s.logout)
	protected.GET("/auth/me", s.me)
	protected.GET("/dashboard/summary", s.dashboard, s.RequirePermission("dashboard:view"))
	protected.GET("/dashboard", s.dashboard, s.RequirePermission("dashboard:view"))
	protected.GET("/tenants", s.tenants, s.RequirePlatform)
	protected.GET("/tenants/current", s.currentTenant)
	protected.GET("/users", s.users, s.RequirePermission("user:list"))
	protected.GET("/roles", s.roles, s.RequirePermission("role:list"))
	protected.POST("/roles", s.createRole, s.RequirePermission("role:create"))
	protected.GET("/departments", s.departments, s.RequirePermission("department:list"))
	protected.GET("/dictionaries", s.dictionaries, s.RequirePermission("dictionary:list"))
	protected.GET("/params", s.params, s.RequirePermission("param:list"))
	protected.GET("/audit/login-logs", s.loginLogs, s.RequirePermission("audit:list"))
	protected.GET("/audit/logs", s.auditLogs, s.RequirePermission("audit:list"))
	protected.POST("/users", s.createUser, s.RequirePermission("user:create"))
	protected.GET("/users/:id", s.getUser, s.RequirePermission("user:list"))
	protected.PUT("/users/:id", s.updateUser, s.RequirePermission("user:update"))
	protected.DELETE("/users/:id", s.deleteUser, s.RequirePermission("user:delete"))
	protected.GET("/menus", s.menus, s.RequirePermission("menu:list"))
	protected.GET("/permissions", s.permissions, s.RequirePermission("menu:list"))
	protected.POST("/files", s.uploadFileCanonical, s.RequirePermission("file:create"))
	RegisterFileChunkRoutes(protected, s)
	protected.GET("/files", s.legacyFileList, s.RequirePermission("file:list"))
	protected.GET("/files/:id", s.legacyFileFind, s.RequirePermission("file:list"))
	protected.PUT("/files/:id", s.legacyFileUpdate, s.RequirePermission("file:update"))
	protected.DELETE("/files/:id", s.legacyFileDelete, s.RequirePermission("file:delete"))
	// The stage-three contracts are also exposed under the versioned API. The
	// compatibility group below keeps the reference frontend working while
	// integrations can use the stable /api/v1 namespace.
	RegisterStage3Routes(protected, s)

	// Compatibility endpoints keep the reference Ant Design Pro frontend
	// usable while the versioned API remains the canonical contract. The dev
	// proxy strips /api for these legacy paths; the /api aliases support the
	// production Nginx configuration as well.
	for _, prefix := range []string{"", "/api"} {
		e.POST(prefix+"/base/captcha", s.legacyCaptcha)
		e.POST(prefix+"/base/login", s.legacyLogin)
		legacy := e.Group(prefix, s.AuthMiddleware)
		legacy.Use(s.legacyAuditMiddleware)
		legacy.GET("/user/getUserInfo", s.legacyUserInfo)
		legacy.POST("/user/getUserList", s.legacyUserList, s.RequirePermission("user:list"))
		legacy.POST("/authority/getAuthorityList", s.legacyRoleList, s.RequirePermission("role:list"))
		legacy.POST("/menu/getMenu", s.legacyMenu, s.RequirePermission("menu:list"))
		legacy.POST("/menu/getMenuList", s.legacyMenuList, s.RequirePermission("menu:list"))
		legacy.POST("/menu/getBaseMenuTree", s.legacyMenu, s.RequirePermission("menu:list"))
		RegisterLegacySystemRoutes(legacy, s)
		RegisterLegacyAPIRoutes(legacy, s)
		legacy.GET("/enterprise/org/departments", s.legacyDepartmentTree, s.RequirePermission("department:list"))
		legacy.POST("/enterprise/org/departments", s.legacyDepartmentMutation, s.RequirePermission("department:create"))
		legacy.PUT("/enterprise/org/departments/:id", s.legacyDepartmentMutation, s.RequirePermission("department:update"))
		legacy.DELETE("/enterprise/org/departments/:id", s.legacyDepartmentDelete, s.RequirePermission("department:delete"))
		legacy.GET("/enterprise/org/positions", s.legacyPositionList, s.RequirePermission("position:list"))
		legacy.POST("/enterprise/org/positions", s.legacyPositionMutation, s.RequirePermission("position:create"))
		legacy.PUT("/enterprise/org/positions/:id", s.legacyPositionMutation, s.RequirePermission("position:update"))
		legacy.DELETE("/enterprise/org/positions/:id", s.legacyPositionDelete, s.RequirePermission("position:delete"))
		legacy.GET("/enterprise/org/users", s.legacyOrgUserList, s.RequirePermission("user:list"))
		legacy.GET("/enterprise/org/:kind/:id/members", s.legacyOrgMembers, s.RequirePermission("department:list"))
		legacy.PUT("/enterprise/org/:kind/:id/members", s.legacyOrgMembers, s.RequirePermission("department:update"))
		legacy.GET("/enterprise/org/user-memberships", s.legacyUserMemberships, s.RequirePermission("user:list"))
		legacy.GET("/enterprise/org/users/:id/memberships", s.legacyUserMembership, s.RequirePermission("user:list"))
		legacy.PUT("/enterprise/org/users/:id/memberships", s.legacyUserMembership, s.RequirePermission("user:update"))
		RegisterLegacyIAMRoutes(legacy, s)
		RegisterLegacyP0Routes(legacy, s)
		RegisterLegacyFileRoutes(legacy, s)
		RegisterFileChunkRoutes(legacy, s)
		RegisterLegacyAutoCodeRoutes(legacy, s)
		RegisterLegacyCompatibilityRoutes(legacy, s)
		RegisterEnterpriseRoutes(legacy, s)
		RegisterStage3Routes(legacy, s)
		legacy.GET("/info/getInfoPublic", s.legacyPublicInfo)
		legacy.POST("/jwt/jsonInBlacklist", s.legacyLogout)
	}
}

// legacyAuditMiddleware keeps the compatibility surface observable as well as
// the canonical /api/v1 handlers. The reference frontend performs writes
// through these routes, so auditing only the versioned API would leave the
// operation log empty for normal administrator activity.
func (s *Service) legacyAuditMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		err := next(c)
		if c.Request().Method != http.MethodGet && c.Request().Method != http.MethodHead {
			if id, identityErr := identityFrom(c); identityErr == nil {
				result := "success"
				if err != nil {
					result = "failure"
				}
				s.Audit(c.Request().Context(), id, c, "legacy."+strings.TrimPrefix(c.Path(), "/"), result)
			}
		}
		return err
	}
}

func (s *Service) PlatformAuthMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		raw := strings.TrimSpace(c.Request().Header.Get("x-platform-token"))
		if raw == "" {
			raw = strings.TrimSpace(strings.TrimPrefix(c.Request().Header.Get("Authorization"), "Bearer "))
		}
		claims, err := s.parseToken(raw)
		if err != nil || claims.TokenType != "platform_access" || claims.UserID == 0 {
			return httpx.NewError(http.StatusUnauthorized, "PLATFORM_AUTH_REQUIRED", "请先登录平台管理端")
		}
		var u database.User
		if s.DB.WithContext(c.Request().Context()).First(&u, claims.UserID).Error != nil || !u.PlatformAdmin || u.Status != "active" {
			return httpx.NewError(http.StatusForbidden, "PLATFORM_ACCESS_DENIED", "平台管理员权限不足")
		}
		c.Set("platform_user", u)
		return next(c)
	}
}

func (s *Service) RequirePlatform(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		if claims, ok := c.Get("claims").(Claims); ok && isScopedAPIToken(ok, claims) {
			return httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "API 令牌不能执行平台管理操作")
		}
		id, err := identityFrom(c)
		if err != nil {
			return err
		}
		var count int64
		s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ? AND r.code = ? AND r.status = ?", id.UserID, id.TenantID, "platform_admin", "active").Count(&count)
		if count == 0 {
			return httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "需要平台管理员权限")
		}
		return next(c)
	}
}

func (s *Service) RequirePermission(permission string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			id, err := identityFrom(c)
			if err != nil {
				return err
			}
			if claims, ok := c.Get("claims").(Claims); ok && isScopedAPIToken(ok, claims) && c.Get(apiResourceAuthorizedKey) == true {
				return next(c)
			}
			var platform int64
			s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ? AND rm.tenant_id = r.tenant_id AND r.code = ? AND r.status = ?", id.UserID, id.TenantID, "platform_admin", "active").Count(&platform)
			claims, scopedToken := c.Get("claims").(Claims)
			if platform > 0 && !isScopedAPIToken(scopedToken, claims) {
				return next(c)
			}
			// The tenant administrator is the operational owner of its tenant.
			// Keep the explicit permission checks for custom roles, while allowing
			// the bootstrap tenant admin to manage the full tenant surface.
			var tenantAdmin int64
			s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ? AND r.code = ? AND r.status = ?", id.UserID, id.TenantID, "tenant_admin", "active").Count(&tenantAdmin)
			if tenantAdmin > 0 && !isScopedAPIToken(scopedToken, claims) {
				return next(c)
			}
			var allowed int64
			query := s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN role_menus rmenu ON rmenu.role_id = rm.role_id AND rmenu.tenant_id = rm.tenant_id").Joins("JOIN menus menu ON menu.id = rmenu.menu_id AND menu.tenant_id = rmenu.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ? AND menu.permission = ?", id.UserID, id.TenantID, permission)
			if isScopedAPIToken(scopedToken, claims) {
				query = query.Where("rm.role_id = ?", claims.RoleID)
			}
			query.Count(&allowed)
			// Stage three supports an explicit resource/action grant. Existing
			// roles that have no action rows keep the legacy menu-permission
			// behavior; once a role starts using the matrix, the finer grant is
			// required as well. An explicit deny always wins across roles.
			actionChecked := false
			if resource, action, ok := splitPermission(permission); ok {
				actionChecked = true
				configuredQuery := s.DB.WithContext(c.Request().Context()).Table("iam_role_actions ra").Joins("JOIN role_memberships rm ON rm.role_id = ra.role_id AND rm.tenant_id = ra.tenant_id").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id AND r.status = ?", "active").Where("ra.tenant_id = ? AND rm.user_id = ?", id.TenantID, id.UserID)
				if isScopedAPIToken(scopedToken, claims) {
					configuredQuery = configuredQuery.Where("rm.role_id = ?", claims.RoleID)
				}
				var deny int64
				configuredQuery.Where("ra.resource = ? AND ra.action = ? AND ra.effect = ?", resource, action, false).Count(&deny)
				if deny > 0 {
					return httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "当前账号被明确拒绝执行此动作")
				}
				var configured int64
				configuredQuery.Count(&configured)
				var actionAllowed int64
				configuredQuery.Where("ra.resource = ? AND ra.action = ? AND ra.effect = ?", resource, action, true).Count(&actionAllowed)
				if actionAllowed == 0 && (allowed == 0 || configured > 0) {
					return httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "当前账号没有执行此动作的权限")
				}
			}
			if allowed == 0 && !actionChecked {
				return httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "当前账号没有执行此操作的权限")
			}
			if allowed == 0 && actionChecked {
				// actionAllowed was already checked above, so an explicitly
				// allowed action may authorize an operation without a dedicated
				// menu permission (useful for headless API roles).
				var actionAllowed int64
				actionQuery := s.DB.WithContext(c.Request().Context()).Table("iam_role_actions ra").Joins("JOIN role_memberships rm ON rm.role_id = ra.role_id AND rm.tenant_id = ra.tenant_id").Where("ra.tenant_id = ? AND rm.user_id = ? AND ra.effect = ?", id.TenantID, id.UserID, true)
				if isScopedAPIToken(scopedToken, claims) {
					actionQuery = actionQuery.Where("rm.role_id = ?", claims.RoleID)
				}
				resource, action, _ := splitPermission(permission)
				actionQuery.Where("ra.resource = ? AND ra.action = ?", resource, action).Count(&actionAllowed)
				if actionAllowed == 0 {
					return httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "当前账号没有执行此操作的权限")
				}
			}
			return next(c)
		}
	}
}

func splitPermission(permission string) (string, string, bool) {
	parts := strings.SplitN(strings.TrimSpace(permission), ":", 2)
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return "", "", false
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), true
}

func (s *Service) AuthMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		raw := strings.TrimSpace(strings.TrimPrefix(c.Request().Header.Get("Authorization"), "Bearer "))
		if raw == "" {
			raw = strings.TrimSpace(c.Request().Header.Get("x-token"))
		}
		if raw == "" {
			return httpx.NewError(http.StatusUnauthorized, "AUTH_REQUIRED", "请先登录")
		}
		claims, err := s.parseToken(raw)
		if err != nil || claims.TokenType != "access" {
			claims, err = s.apiTokenClaims(c.Request().Context(), raw)
			if err != nil {
				return httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_TOKEN", "登录凭证无效")
			}
		}
		var membership struct {
			ID       uint64
			TenantID uint64
			UserID   uint64
			Status   string
		}
		if result := s.DB.WithContext(c.Request().Context()).Table("tenant_memberships").Where("id = ? AND user_id = ?", claims.MembershipID, claims.UserID).First(&membership); result.Error != nil || membership.Status != "active" || membership.TenantID != claims.TenantID {
			return httpx.NewError(http.StatusForbidden, "TENANT_ACCESS_DENIED", "当前租户成员关系不可用")
		}
		var status string
		if result := s.DB.WithContext(c.Request().Context()).Table("tenants").Where("id = ?", claims.TenantID).Pluck("status", &status); result.Error != nil || status != "active" {
			return httpx.NewError(http.StatusForbidden, "TENANT_SUSPENDED", "当前租户不可用")
		}
		var userStatus string
		if result := s.DB.WithContext(c.Request().Context()).Table("users").Where("id = ?", claims.UserID).Pluck("status", &userStatus); result.Error != nil || userStatus != "active" {
			return httpx.NewError(http.StatusForbidden, "AUTH_ACCOUNT_DISABLED", "用户账号已停用")
		}
		var profileStatus string
		if result := s.DB.WithContext(c.Request().Context()).Table("iam_user_profiles").Where("tenant_id = ? AND user_id = ?", claims.TenantID, claims.UserID).Pluck("status", &profileStatus); result.Error == nil && profileStatus != "" && profileStatus != "active" {
			return httpx.NewError(http.StatusForbidden, "AUTH_ACCOUNT_DISABLED", "当前租户中的账号已停用")
		}
		// Platform operators keep their global platform capability when they
		// enter a tenant that was provisioned later and therefore only has a
		// tenant_admin membership row.
		var globalPlatform bool
		s.DB.WithContext(c.Request().Context()).Table("users").Where("id = ?", claims.UserID).Pluck("platform_admin", &globalPlatform)
		var platformCount int64
		s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ? AND r.code = ? AND r.status = ?", claims.UserID, claims.TenantID, "platform_admin", "active").Count(&platformCount)
		id := tenant.Identity{TenantID: claims.TenantID, UserID: claims.UserID, MembershipID: claims.MembershipID, PlatformAdmin: globalPlatform || platformCount > 0}
		c.Set(identityKey, id)
		c.Set("claims", claims)
		c.SetRequest(c.Request().WithContext(tenant.WithIdentity(c.Request().Context(), id)))
		if err := s.authorizeAPIResource(c, id); err != nil {
			return err
		}
		return next(c)
	}
}

func (s *Service) legacyCaptcha(c *echo.Context) error {
	// Captcha is deliberately disabled in the development scaffold. Keeping a
	// stable response lets the reference frontend render the normal login form;
	// deployments that need a challenge can replace this endpoint independently.
	return legacyOK(c, map[string]any{"captchaId": "disabled", "picPath": "", "captchaLength": 0, "openCaptcha": false})
}

func (s *Service) legacyLogin(c *echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return legacyError(c, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请输入用户名和密码"))
	}
	if strings.TrimSpace(req.TenantCode) == "" {
		req.TenantCode = strings.TrimSpace(c.Request().Header.Get("x-tenant-id"))
	}
	if strings.TrimSpace(req.Username) == "" || req.Password == "" || req.TenantCode == "" {
		return legacyError(c, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请输入租户编码、用户名和密码"))
	}
	result, err := s.Login(c.Request().Context(), req, c.Response().Header().Get("X-Request-ID"), c.RealIP())
	if err != nil {
		return legacyError(c, err)
	}
	tokens, ok := result.(tokenResponse)
	if !ok {
		return legacyError(c, httpx.NewError(http.StatusInternalServerError, "INTERNAL_ERROR", "登录响应无效"))
	}
	legacyUser := s.legacyUser(c.Request().Context(), tokens.User, tokens.Tenant)
	return legacyOK(c, map[string]any{
		"token": tokens.AccessToken, "expiresAt": time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second).UnixMilli(),
		"user": legacyUser, "tenant": tokens.Tenant, "sessionKind": "tenant",
	})
}

func (s *Service) legacyUserInfo(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var u database.User
	if s.DB.WithContext(c.Request().Context()).First(&u, id.UserID).Error != nil {
		return httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_TOKEN", "登录状态已失效")
	}
	var t database.Tenant
	if s.DB.WithContext(c.Request().Context()).First(&t, id.TenantID).Error != nil {
		return httpx.NewError(http.StatusForbidden, "TENANT_ACCESS_DENIED", "租户不存在")
	}
	return legacyOK(c, map[string]any{"userInfo": s.legacyUser(c.Request().Context(), userView(u), &TenantView{ID: fmt.Sprint(t.ID), Name: t.Name, Code: t.Code, Status: t.Status})})
}

func (s *Service) legacyLogout(c *echo.Context) error {
	return legacyOK(c, map[string]any{"revoked": true})
}

func (s *Service) legacyPublicInfo(c *echo.Context) error {
	// The dashboard consumes this endpoint after authentication. Keep the
	// public-facing shape while returning the tenant's announcement records;
	// older installations with no records still receive an empty list.
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var total int64
	query := s.DB.WithContext(c.Request().Context()).Model(&database.LegacyInfo{}).Where("tenant_id = ?", id.TenantID)
	if err := query.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.LegacyInfo
	if err := query.Order("id desc").Limit(20).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, compatInfoView(row))
	}
	return legacyOK(c, map[string]any{"list": items, "page": 1, "pageSize": 20, "total": total})
}

func legacyPageParams(c *echo.Context) (int, int) {
	var input struct {
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
	}
	_ = c.Bind(&input)
	if input.Page < 1 {
		input.Page = page(c)
	}
	if input.PageSize < 1 {
		input.PageSize = size(c)
	}
	return input.Page, input.PageSize
}

func legacyPageData(result map[string]any) map[string]any {
	return map[string]any{
		"list": result["items"], "page": result["page"], "pageSize": result["page_size"], "total": result["total"],
	}
}

func (s *Service) legacyUserList(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	currentPage, currentSize := legacyPageParams(c)
	result, err := s.ListUsers(c.Request().Context(), id, currentPage, currentSize)
	if err != nil {
		return err
	}
	items := []any{}
	if users, ok := result["items"].([]UserView); ok {
		var tenant TenantView
		s.DB.WithContext(c.Request().Context()).Model(&database.Tenant{}).Where("id = ?", id.TenantID).Select("id, name, code, status").First(&tenant)
		for _, user := range users {
			items = append(items, s.legacyUser(c.Request().Context(), user, &tenant))
		}
	}
	result["items"] = items
	return legacyOK(c, legacyPageData(result))
}

func (s *Service) legacyRoleList(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	currentPage, currentSize := legacyPageParams(c)
	result, err := s.ListRoles(c.Request().Context(), id, currentPage, currentSize)
	if err != nil {
		return err
	}
	items := []map[string]any{}
	if roles, ok := result["items"].([]map[string]any); ok {
		for _, role := range roles {
			idValue, _ := strconv.ParseUint(fmt.Sprint(role["id"]), 10, 64)
			items = append(items, map[string]any{
				"ID": idValue, "authorityId": idValue, "authorityName": roleDisplayName(fmt.Sprint(role["code"]), fmt.Sprint(role["name"])), "parentId": nil,
				"defaultRouter": "仪表盘", "dataAuthorityId": []any{}, "children": []any{}, "status": role["status"], "code": role["code"],
			})
		}
	}
	result["items"] = items
	return legacyOK(c, legacyPageData(result))
}

func (s *Service) legacyMenuList(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	currentPage, currentSize := legacyPageParams(c)
	var total int64
	var rows []database.Menu
	query := s.DB.WithContext(c.Request().Context()).Model(&database.Menu{}).Where("tenant_id = ?", id.TenantID)
	query.Count(&total)
	query.Order("sort asc, id asc").Offset((currentPage - 1) * currentSize).Limit(currentSize).Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, s.iamMenuView(s.DB.WithContext(c.Request().Context()), row))
	}
	return legacyOK(c, map[string]any{"list": items, "page": currentPage, "pageSize": currentSize, "total": total})
}

func (s *Service) legacyMenu(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var rows []database.Menu
	s.DB.WithContext(c.Request().Context()).Where("tenant_id = ?", id.TenantID).Order("sort asc,id asc").Find(&rows)
	allowed := map[uint64]bool{}
	var menuIDs []uint64
	s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN role_menus rmenu ON rmenu.role_id = rm.role_id AND rmenu.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ?", id.UserID, id.TenantID).Pluck("rmenu.menu_id", &menuIDs)
	for _, menuID := range menuIDs {
		allowed[menuID] = true
	}
	parents := make(map[uint64]uint64, len(rows))
	for _, row := range rows {
		if row.ParentID != nil {
			parents[row.ID] = *row.ParentID
		}
	}
	for menuID := range allowed {
		for parent := parents[menuID]; parent > 0; parent = parents[parent] {
			allowed[parent] = true
		}
	}
	fullAccess := id.PlatformAdmin
	if !fullAccess {
		var tenantAdmin int64
		s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ? AND r.code = ? AND r.status = ?", id.UserID, id.TenantID, "tenant_admin", "active").Count(&tenantAdmin)
		fullAccess = tenantAdmin > 0
	}
	buttonPermissions := map[string]int{}
	if fullAccess {
		buttonPermissions = map[string]int{"create": 1, "add": 1, "update": 1, "edit": 1, "delete": 1, "view": 1, "export": 1}
	}
	var nodes []map[string]any
	for _, row := range rows {
		// API tokens are automation credentials and are intentionally managed by
		// platform administrators only. Do not expose a dead-end menu to tenant
		// administrators or custom tenant roles.
		if row.Path == "/iam/api-tokens" && !id.PlatformAdmin {
			continue
		}
		if !id.PlatformAdmin && !allowed[row.ID] {
			continue
		}
		parentID := uint64(0)
		if row.ParentID != nil {
			parentID = *row.ParentID
		}
		component := legacyComponent(row.Path)
		view := s.iamMenuView(s.DB.WithContext(c.Request().Context()), row)
		nodes = append(nodes, map[string]any{
			"ID": row.ID, "parentId": parentID, "path": row.Path, "name": row.Name, "hidden": row.Hidden,
			"component": component, "sort": row.Sort, "btns": buttonPermissions,
			"meta":    map[string]any{"title": row.Name, "icon": row.Icon, "defaultMenu": false, "keepAlive": true, "closeTab": false},
			"menuBtn": view["menuBtn"], "parameters": view["parameters"],
		})
	}
	byParent := map[uint64][]map[string]any{}
	for _, node := range nodes {
		parent, _ := node["parentId"].(uint64)
		byParent[parent] = append(byParent[parent], node)
	}
	var build func(uint64) []map[string]any
	build = func(parent uint64) []map[string]any {
		children := byParent[parent]
		for _, node := range children {
			idValue, _ := node["ID"].(uint64)
			if nested := build(idValue); len(nested) > 0 {
				node["children"] = nested
			}
		}
		return children
	}
	return legacyOK(c, map[string]any{"menus": build(0)})
}

func legacyComponent(path string) string {
	switch path {
	case "/dashboard":
		return "dashboard"
	case "/person":
		return "person/person"
	case "/iam/users":
		return "superAdmin/user/user"
	case "/iam/roles":
		return "superAdmin/authority/authority"
	case "/iam/menus":
		return "superAdmin/menu/menu"
	case "/iam/departments":
		return "org/department"
	case "/iam/positions":
		return "org/position"
	case "/iam/apis":
		return "superAdmin/api/api"
	case "/iam/api-tokens":
		return "systemTools/apiToken"
	case "/iam/permissions":
		return "superAdmin/permissionMatrix"
	case "/system/dictionaries":
		return "superAdmin/dictionary/sysDictionary"
	case "/system/params":
		return "superAdmin/params/sysParams"
	case "/system/security":
		return "systemConfig/security"
	case "/system/files":
		return "systemTools/fileCenter"
	case "/ops/login-logs":
		return "systemTools/loginLog"
	case "/ops/audit":
		return "superAdmin/operation/sysOperationRecord"
	case "/ops/errors":
		return "systemTools/sysError"
	case "/ops/health":
		return "systemTools/serverState"
	case "/ops/jobs":
		return "monitor/jobs"
	case "/ops/report":
		return "systemTools/auditReport"
	case "/ops/monitor":
		return "systemTools/monitorOverview"
	case "/notify/inbox":
		return "notifyCenter/notifyInbox"
	case "/notify/channels":
		return "notifyCenter/notifyChannel"
	case "/notify/templates":
		return "notifyCenter/notifyTemplate"
	case "/notify/preferences":
		return "notifyCenter/notifyPreference"
	case "/notify/deliveries":
		return "notifyCenter/notifyDelivery"
	case "/notify/config":
		return "notifyCenter/notifyConfig"
	case "/dev/auto-code":
		return "systemTools/autoCode"
	case "/dev/auto-code/history":
		return "systemTools/autoCodeAdmin"
	case "/dev/auto-package":
		return "systemTools/autoPkg/autoPkg"
	default:
		return "routerHolder"
	}
}

func identityFrom(c *echo.Context) (tenant.Identity, error) {
	value := c.Get(identityKey)
	id, ok := value.(tenant.Identity)
	if !ok || id.TenantID == 0 || id.UserID == 0 || id.MembershipID == 0 {
		return tenant.Identity{}, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_TOKEN", "Authentication context is missing")
	}
	return id, nil
}

func (s *Service) login(c *echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "Request body is invalid")
	}
	if strings.TrimSpace(req.Username) == "" || req.Password == "" || strings.TrimSpace(req.TenantCode) == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请输入用户名、密码和租户编码")
	}
	result, err := s.Login(c.Request().Context(), req, c.Response().Header().Get("X-Request-ID"), c.RealIP())
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}

type legacyEnvelope struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data any    `json:"data,omitempty"`
}

func legacyOK(c *echo.Context, data any) error {
	return c.JSON(http.StatusOK, legacyEnvelope{Code: 0, Msg: "success", Data: data})
}
func legacyError(c *echo.Context, err error) error {
	var domain *httpx.Error
	if errors.As(err, &domain) {
		return c.JSON(domain.Status, legacyEnvelope{Code: 1, Msg: domain.Message, Data: domain.Data})
	}
	return err
}

func (s *Service) platformLogin(c *echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.Username) == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, legacyEnvelope{Code: 1, Msg: "请输入平台用户名和密码"})
	}
	result, err := s.PlatformLogin(c.Request().Context(), req.Username, req.Password, c.Response().Header().Get("X-Request-ID"), c.RealIP())
	if err != nil {
		return legacyError(c, err)
	}
	return legacyOK(c, map[string]any{"token": result.AccessToken, "refreshToken": result.RefreshToken, "expiresIn": result.ExpiresIn, "user": result.User})
}

func (s *Service) tenancyInfo(c *echo.Context) error {
	return legacyOK(c, map[string]any{"enabled": true})
}

func (s *Service) tenancyResolve(c *echo.Context) error {
	code := strings.TrimSpace(c.QueryParam("code"))
	if code == "" {
		return c.JSON(http.StatusBadRequest, legacyEnvelope{Code: 1, Msg: "请输入租户编码"})
	}
	var t database.Tenant
	if s.DB.WithContext(c.Request().Context()).Where("code = ?", code).First(&t).Error != nil || t.Status != "active" {
		return c.JSON(http.StatusNotFound, legacyEnvelope{Code: 1, Msg: "租户不存在或已停用"})
	}
	return legacyOK(c, map[string]any{"id": fmt.Sprint(t.ID), "code": t.Code, "name": t.Name, "state": t.Status, "schemaVersion": 1, "createdAt": t.CreatedAt, "updatedAt": t.UpdatedAt})
}

func (s *Service) platformTenants(c *echo.Context) error {
	result, err := s.ListTenants(c.Request().Context(), page(c), size(c))
	if err != nil {
		return err
	}
	items, _ := result["items"].([]TenantView)
	list := make([]map[string]any, 0, len(items))
	for _, t := range items {
		list = append(list, map[string]any{"id": t.ID, "code": t.Code, "name": t.Name, "state": t.Status, "schemaVersion": 1})
	}
	return legacyOK(c, map[string]any{"list": list, "total": result["total"]})
}

func (s *Service) platformCreateTenant(c *echo.Context) error {
	var in struct {
		Code          string `json:"code"`
		Name          string `json:"name"`
		AdminUsername string `json:"adminUsername"`
		AdminPassword string `json:"adminPassword"`
		Contact       string `json:"contact"`
		Domain        string `json:"domain"`
	}
	if err := c.Bind(&in); err != nil {
		return c.JSON(http.StatusBadRequest, legacyEnvelope{Code: 1, Msg: "请求参数格式错误"})
	}
	if in.AdminUsername == "" {
		in.AdminUsername = "admin"
	}
	result, err := s.CreateTenant(c.Request().Context(), in.Name, in.Code, in.AdminUsername, in.AdminPassword, in.Contact, in.Domain)
	if err != nil {
		return legacyError(c, err)
	}
	t := result["tenant"].(TenantView)
	return legacyOK(c, map[string]any{"id": t.ID, "code": t.Code, "name": t.Name, "state": t.Status, "schemaVersion": 1})
}

func (s *Service) platformTenantAction(c *echo.Context) error {
	id, err := parseID(c)
	if err != nil {
		return err
	}
	action := c.Path()
	status := "active"
	if strings.HasSuffix(action, "/disable") {
		status = "disabled"
	}
	var t database.Tenant
	if s.DB.WithContext(c.Request().Context()).First(&t, id).Error != nil {
		return httpx.NewError(http.StatusNotFound, "TENANT_NOT_FOUND", "租户不存在")
	}
	if err := s.DB.WithContext(c.Request().Context()).Model(&t).Update("status", status).Error; err != nil {
		return legacyError(c, err)
	}
	t.Status = status
	return legacyOK(c, map[string]any{"id": fmt.Sprint(t.ID), "code": t.Code, "name": t.Name, "state": t.Status, "schemaVersion": 1})
}
func (s *Service) refresh(c *echo.Context) error {
	var req refreshRequest
	if err := c.Bind(&req); err != nil || req.RefreshToken == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "Refresh token is required")
	}
	result, err := s.Refresh(c.Request().Context(), req.RefreshToken)
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) switchTenantSelection(c *echo.Context) error {
	var req switchTenantRequest
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.TenantCode) == "" || strings.TrimSpace(req.SelectionToken) == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "tenant_code and selection_token are required")
	}
	claims, err := s.parseToken(req.SelectionToken)
	if err != nil || claims.TokenType != "selection" {
		return httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_TOKEN", "Selection token is invalid")
	}
	result, err := s.SwitchTenant(c.Request().Context(), tenant.Identity{UserID: claims.UserID}, req.TenantCode)
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}

func (s *Service) switchTenant(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var req switchTenantRequest
	if err := c.Bind(&req); err != nil || strings.TrimSpace(req.TenantCode) == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "Tenant code is required")
	}
	result, err := s.SwitchTenant(c.Request().Context(), id, req.TenantCode)
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) logout(c *echo.Context) error {
	claims, ok := c.Get("claims").(Claims)
	if !ok {
		return httpx.NewError(http.StatusUnauthorized, "AUTH_REQUIRED", "Authentication is required")
	}
	var req logoutRequest
	if c.Request().ContentLength > 0 {
		if err := c.Bind(&req); err != nil {
			return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "Request body is invalid")
		}
	}
	if err := s.RevokeRefresh(c.Request().Context(), req.RefreshToken, claims.UserID); err != nil {
		return err
	}
	return httpx.Respond(c, map[string]any{"revoked": true})
}
func (s *Service) me(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.Me(c.Request().Context(), id)
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) dashboard(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.GetDashboard(c.Request().Context(), id)
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) currentTenant(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var t struct {
		ID                         uint64
		Name, Code, Domain, Status string
	}
	if result := s.DB.WithContext(c.Request().Context()).Table("tenants").Where("id = ?", id.TenantID).First(&t); result.Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "Tenant not found")
	}
	return httpx.Respond(c, TenantView{ID: strconv.FormatUint(t.ID, 10), Name: t.Name, Code: t.Code, Domain: t.Domain, Status: t.Status})
}
func (s *Service) tenants(c *echo.Context) error {
	result, err := s.ListTenants(c.Request().Context(), page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) users(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.ListUsers(c.Request().Context(), id, page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) createUser(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Email    string `json:"email"`
		Nickname string `json:"nickname"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "Request body is invalid")
	}
	result, err := s.CreateUser(c.Request().Context(), id, in)
	if err != nil {
		return err
	}
	s.Audit(c.Request().Context(), id, c, "user.create", "success")
	return httpx.Respond(c, result)
}
func parseID(c *echo.Context) (uint64, error) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		return 0, httpx.NewError(400, "VALIDATION_ERROR", "id must be a positive integer")
	}
	return id, nil
}
func (s *Service) getUser(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	uid, err := parseID(c)
	if err != nil {
		return err
	}
	result, err := s.GetUser(c.Request().Context(), id, uid)
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) updateUser(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	uid, err := parseID(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "Request body is invalid")
	}
	result, err := s.UpdateUser(c.Request().Context(), id, uid, in)
	if err != nil {
		return err
	}
	s.Audit(c.Request().Context(), id, c, "user.update", "success")
	return httpx.Respond(c, result)
}
func (s *Service) deleteUser(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	uid, err := parseID(c)
	if err != nil {
		return err
	}
	if err := s.DeleteUser(c.Request().Context(), id, uid); err != nil {
		return err
	}
	s.Audit(c.Request().Context(), id, c, "user.delete", "success")
	return httpx.Respond(c, map[string]any{"deleted": true})
}
func (s *Service) menus(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var items []MenuView
	var rows []struct {
		ID                                            uint64
		ParentID                                      *uint64
		Type, Name, Path, RouteName, Icon, Permission string
		Sort                                          int
		Hidden                                        bool
	}
	s.DB.WithContext(c.Request().Context()).Table("menus").Where("tenant_id = ?", id.TenantID).Order("sort asc,id asc").Find(&rows)
	for _, row := range rows {
		var parent *string
		if row.ParentID != nil {
			value := strconv.FormatUint(*row.ParentID, 10)
			parent = &value
		}
		items = append(items, MenuView{ID: strconv.FormatUint(row.ID, 10), ParentID: parent, Type: row.Type, Name: row.Name, Path: row.Path, RouteName: row.RouteName, Icon: row.Icon, Permission: row.Permission, Sort: row.Sort, Hidden: row.Hidden})
	}
	return httpx.Respond(c, items)
}
func (s *Service) permissions(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var values []string
	s.DB.WithContext(c.Request().Context()).Table("menus").Where("tenant_id = ? AND permission <> ''", id.TenantID).Order("sort asc").Pluck("permission", &values)
	return httpx.Respond(c, values)
}
func (s *Service) roles(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.ListRoles(c.Request().Context(), id, page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) createRole(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in struct {
		Name        string `json:"name"`
		Code        string `json:"code"`
		Description string `json:"description"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "Request body is invalid")
	}
	result, err := s.CreateRole(c.Request().Context(), id, in.Name, in.Code, in.Description)
	if err != nil {
		return err
	}
	s.Audit(c.Request().Context(), id, c, "role.create", "success")
	return httpx.Respond(c, result)
}
func (s *Service) departments(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.ListDepartments(c.Request().Context(), id, page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) dictionaries(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.ListDictionaries(c.Request().Context(), id, page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) params(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.ListParams(c.Request().Context(), id, page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) loginLogs(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.ListLoginLogs(c.Request().Context(), id, page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func (s *Service) auditLogs(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	result, err := s.ListAuditLogs(c.Request().Context(), id, page(c), size(c))
	if err != nil {
		return err
	}
	return httpx.Respond(c, result)
}
func page(c *echo.Context) int {
	value, _ := strconv.Atoi(c.QueryParam("page"))
	if value < 1 {
		value = 1
	}
	return value
}
func size(c *echo.Context) int {
	value, _ := strconv.Atoi(c.QueryParam("page_size"))
	if value < 1 {
		value = 20
	}
	if value > 100 {
		value = 100
	}
	return value
}
