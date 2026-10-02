package admin

// Compatibility handlers for the API registry used by the reference frontend.
// APIResource is a global route catalogue. Tenant data is represented by
// TenantAPIGrant and IAMRoleAPI rows, so a tenant can consume and assign API
// permissions without being able to alter the platform catalogue.

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"gorm.io/gorm"
)

// RegisterLegacyAPIRoutes registers the API registry and role assignment
// endpoints. The group is already protected by AuthMiddleware by the caller.
func RegisterLegacyAPIRoutes(g *echo.Group, s *Service) {
	p := func(permission string) []echo.MiddlewareFunc {
		return []echo.MiddlewareFunc{s.RequirePermission(permission)}
	}
	g.POST("/api/getApiList", s.legacyAPIList, p("api:list")...)
	g.POST("/api/createApi", s.legacyAPIMutation, p("api:create")...)
	g.POST("/api/getApiById", s.legacyAPIGet, p("api:list")...)
	g.POST("/api/updateApi", s.legacyAPIMutation, p("api:update")...)
	g.POST("/api/deleteApi", s.legacyAPIDelete, p("api:delete")...)
	g.DELETE("/api/deleteApisByIds", s.legacyAPIBatchDelete, p("api:delete")...)
	g.POST("/api/getAllApis", s.legacyAPIAll, p("api:list")...)
	g.GET("/api/getApiGroups", s.legacyAPIGroups, p("api:list")...)
	g.GET("/api/freshCasbin", s.legacyAPIFresh, p("api:update")...)
	g.GET("/api/syncApi", s.legacyAPISync, p("api:list")...)
	g.POST("/api/ignoreApi", s.legacyAPIIgnore, p("api:update")...)
	g.POST("/api/enterSyncApi", s.legacyAPIEnterSync, p("api:create")...)
	g.GET("/api/getApiRoles", s.legacyAPIRoles, p("role:list")...)
	g.POST("/api/setApiRoles", s.legacyAPISetRoles, p("role:update")...)
}

type legacyAPIInput struct {
	ID          uint64 `json:"ID"`
	Path        string `json:"path"`
	Method      string `json:"method"`
	Group       string `json:"apiGroup"`
	Description string `json:"description"`
}

func legacyAPIView(row database.APIResource) map[string]any {
	return map[string]any{
		"ID": row.ID, "id": row.ID, "path": row.Path, "method": row.Method,
		"apiGroup": row.Group, "description": row.Permission, "permission": row.Permission,
		"createdAt": row.CreatedAt, "updatedAt": row.UpdatedAt,
	}
}

func legacyAPIBind(c *echo.Context) (legacyAPIInput, error) {
	var in legacyAPIInput
	if err := c.Bind(&in); err != nil {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 参数格式错误")
	}
	in.Path = strings.TrimSpace(in.Path)
	in.Method = strings.ToUpper(strings.TrimSpace(in.Method))
	in.Group = strings.TrimSpace(in.Group)
	in.Description = strings.TrimSpace(in.Description)
	if in.Path == "" || !strings.HasPrefix(in.Path, "/") {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 路径必须以 / 开头")
	}
	validMethod := map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true, "OPTIONS": true}
	if !validMethod[in.Method] {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请求方法不受支持")
	}
	if in.Group == "" {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 分组不能为空")
	}
	if in.Description == "" {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 描述不能为空")
	}
	return in, nil
}

func (s *Service) legacyAPIPlatform(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	if !id.PlatformAdmin {
		return httpx.NewError(http.StatusForbidden, "API_PLATFORM_ONLY", "只有平台管理员可以维护全局 API 资源")
	}
	return nil
}

func (s *Service) legacyAPIList(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	pageNo, pageSize := legacyPageParams(c)
	var in map[string]any
	_ = c.Bind(&in)
	query := s.DB.WithContext(c.Request().Context()).Model(&database.APIResource{})
	if v := strings.TrimSpace(stringValue(in["path"])); v != "" {
		query = query.Where("path LIKE ?", "%"+v+"%")
	}
	if v := strings.TrimSpace(stringValue(in["apiGroup"])); v != "" {
		query = query.Where("`group` LIKE ?", "%"+v+"%")
	}
	if v := strings.TrimSpace(stringValue(in["method"])); v != "" {
		query = query.Where("method = ?", strings.ToUpper(v))
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.APIResource
	if err := query.Order("id asc").Offset((pageNo - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, legacyAPIView(row))
	}
	_ = id // kept explicit: query is global by design; tenant grants are maintained separately.
	return legacyOK(c, map[string]any{"list": items, "page": pageNo, "pageSize": pageSize, "total": total})
}

func (s *Service) legacyAPIAll(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var rows []database.APIResource
	if err := s.DB.WithContext(c.Request().Context()).Order("`group` asc, method asc, path asc").Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, legacyAPIView(row))
	}
	return legacyOK(c, map[string]any{"apis": items})
}

func (s *Service) legacyAPIGet(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 参数格式错误")
	}
	id := number(in["ID"])
	if id == 0 {
		id = number(in["id"])
	}
	if id == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少 API ID")
	}
	var row database.APIResource
	if err := s.DB.WithContext(c.Request().Context()).First(&row, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "API 资源不存在")
		}
		return err
	}
	return legacyOK(c, map[string]any{"api": legacyAPIView(row)})
}

func (s *Service) legacyAPIMutation(c *echo.Context) error {
	if err := s.legacyAPIPlatform(c); err != nil {
		return err
	}
	in, err := legacyAPIBind(c)
	if err != nil {
		return err
	}
	db := s.DB.WithContext(c.Request().Context())
	var row database.APIResource
	if in.ID > 0 {
		if err := db.First(&row, in.ID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "API 资源不存在")
			}
			return err
		}
	}
	var duplicate database.APIResource
	if q := db.Where("method = ? AND path = ? AND id <> ?", in.Method, in.Path, in.ID).First(&duplicate); q.Error == nil {
		return httpx.NewError(http.StatusConflict, "API_EXISTS", "相同请求方法和路径的 API 已存在")
	} else if q.Error != gorm.ErrRecordNotFound {
		return q.Error
	}
	row.Method, row.Path, row.Group, row.Permission = in.Method, in.Path, in.Group, in.Description
	if err := db.Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"api": legacyAPIView(row)})
}

func (s *Service) legacyAPIDelete(c *echo.Context) error {
	if err := s.legacyAPIPlatform(c); err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 参数格式错误")
	}
	id := number(in["ID"])
	if id == 0 {
		id = number(in["id"])
	}
	if id == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少 API ID")
	}
	return s.deleteAPI(c, []uint64{id})
}

func (s *Service) legacyAPIBatchDelete(c *echo.Context) error {
	if err := s.legacyAPIPlatform(c); err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 参数格式错误")
	}
	idsValue := ids(in["ids"])
	if len(idsValue) == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请选择要删除的 API")
	}
	return s.deleteAPI(c, idsValue)
}

func (s *Service) deleteAPI(c *echo.Context, idsValue []uint64) error {
	db := s.DB.WithContext(c.Request().Context())
	var refs int64
	db.Model(&database.IAMRoleAPI{}).Where("api_resource_id IN ?", idsValue).Count(&refs)
	if refs > 0 {
		return httpx.NewError(http.StatusConflict, "API_IN_USE", "API 已分配给角色，请先解除角色授权")
	}
	db.Model(&database.TenantAPIGrant{}).Where("api_resource_id IN ?", idsValue).Count(&refs)
	if refs > 0 {
		return httpx.NewError(http.StatusConflict, "API_IN_USE", "API 已分配给租户，请先解除租户授权")
	}
	if err := db.Where("id IN ?", idsValue).Delete(&database.APIResource{}).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"deleted": len(idsValue)})
}

func (s *Service) legacyAPIGroups(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var groups []string
	if err := s.DB.WithContext(c.Request().Context()).Model(&database.APIResource{}).Distinct("group").Where("`group` <> ''").Order("`group` asc").Pluck("group", &groups).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"groups": groups, "groupApiMap": map[string]string{}})
}

func (s *Service) legacyAPIFresh(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"refreshed": true})
}

func (s *Service) legacyAPISync(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	if s.RouteProvider == nil {
		return legacyOK(c, map[string]any{"newApis": []any{}, "deleteApis": []any{}, "ignoreApis": []any{}})
	}
	seen := map[string]bool{}
	for _, route := range s.RouteProvider() {
		method, path := strings.ToUpper(strings.TrimSpace(route.Method)), strings.TrimSpace(route.Path)
		if path == "" || strings.Contains(path, "*") || !strings.HasPrefix(path, "/api") {
			continue
		}
		if method == echo.RouteNotFound || method == echo.RouteAny || method == http.MethodHead || method == http.MethodOptions {
			continue
		}
		seen[method+":"+path] = true
	}
	var existing []database.APIResource
	if err := s.DB.WithContext(c.Request().Context()).Find(&existing).Error; err != nil {
		return err
	}
	byKey := make(map[string]database.APIResource, len(existing))
	for _, row := range existing {
		byKey[strings.ToUpper(row.Method)+":"+row.Path] = row
	}
	newApis := make([]map[string]any, 0)
	ignoreApis := make([]map[string]any, 0)
	for key := range seen {
		row, ok := byKey[key]
		if !ok {
			pathPart := key[strings.IndexByte(key, ':')+1:]
			parts := strings.Split(strings.Trim(pathPart, "/"), "/")
			group := "系统"
			if len(parts) > 1 && parts[1] != "" {
				group = parts[1]
			}
			method, path, _ := strings.Cut(key, ":")
			newApis = append(newApis, map[string]any{"path": path, "method": method, "apiGroup": group, "description": ""})
			continue
		}
		var grant database.TenantAPIGrant
		if result := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND api_resource_id=?", id.TenantID, row.ID).First(&grant); result.Error == nil && !grant.Enabled {
			ignoreApis = append(ignoreApis, legacyAPIView(row))
		}
	}
	deleteApis := make([]map[string]any, 0)
	for key, row := range byKey {
		if !seen[key] {
			deleteApis = append(deleteApis, legacyAPIView(row))
		}
	}
	return legacyOK(c, map[string]any{"newApis": newApis, "deleteApis": deleteApis, "ignoreApis": ignoreApis})
}

func (s *Service) legacyAPIIgnore(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in struct {
		Path   string `json:"path"`
		Method string `json:"method"`
		Flag   bool   `json:"flag"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "API 参数格式错误")
	}
	var resource database.APIResource
	if err := s.DB.WithContext(c.Request().Context()).Where("path=? AND method=?", strings.TrimSpace(in.Path), strings.ToUpper(strings.TrimSpace(in.Method))).First(&resource).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "API 资源不存在")
		}
		return err
	}
	grant := database.TenantAPIGrant{TenantID: id.TenantID, APIResourceID: resource.ID, Enabled: !in.Flag}
	var existing database.TenantAPIGrant
	if q := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND api_resource_id=?", id.TenantID, resource.ID).First(&existing); q.Error == nil {
		grant.ID = existing.ID
	}
	if err := s.DB.WithContext(c.Request().Context()).Save(&grant).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"ignored": in.Flag})
}

func (s *Service) legacyAPIEnterSync(c *echo.Context) error {
	if err := s.legacyAPIPlatform(c); err != nil {
		return err
	}
	var in struct {
		New    []legacyAPIInput `json:"newApis"`
		Delete []legacyAPIInput `json:"deleteApis"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "同步参数格式错误")
	}
	for _, item := range in.New {
		item.ID = 0
		if _, err := s.upsertAPI(c, item); err != nil {
			return err
		}
	}
	for _, item := range in.Delete {
		var row database.APIResource
		if s.DB.WithContext(c.Request().Context()).Where("path=? AND method=?", item.Path, strings.ToUpper(item.Method)).First(&row).Error == nil {
			if err := s.deleteAPI(c, []uint64{row.ID}); err != nil {
				return err
			}
		}
	}
	return legacyOK(c, map[string]any{"updated": true})
}

func (s *Service) upsertAPI(c *echo.Context, in legacyAPIInput) (database.APIResource, error) {
	// Validate the same fields as create/update while allowing a structured sync body.
	in.Path, in.Method, in.Group, in.Description = strings.TrimSpace(in.Path), strings.ToUpper(strings.TrimSpace(in.Method)), strings.TrimSpace(in.Group), strings.TrimSpace(in.Description)
	if in.Path == "" || !strings.HasPrefix(in.Path, "/") || in.Group == "" || in.Description == "" {
		return database.APIResource{}, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "同步 API 的路径、分组和描述不能为空")
	}
	var row database.APIResource
	q := s.DB.WithContext(c.Request().Context()).Where("method=? AND path=?", in.Method, in.Path).First(&row)
	if q.Error != nil && q.Error != gorm.ErrRecordNotFound {
		return row, q.Error
	}
	row.Method, row.Path, row.Group, row.Permission = in.Method, in.Path, in.Group, in.Description
	return row, s.DB.WithContext(c.Request().Context()).Save(&row).Error
}

func (s *Service) legacyAPIRoles(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	path, method := strings.TrimSpace(c.QueryParam("path")), strings.ToUpper(strings.TrimSpace(c.QueryParam("method")))
	var resource database.APIResource
	if err := s.DB.WithContext(c.Request().Context()).Where("path=? AND method=?", path, method).First(&resource).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "API 资源不存在")
		}
		return err
	}
	var roleIDs []uint64
	if err := s.DB.WithContext(c.Request().Context()).Table("iam_role_apis").Where("tenant_id=? AND api_resource_id=?", id.TenantID, resource.ID).Pluck("role_id", &roleIDs).Error; err != nil {
		return err
	}
	return legacyOK(c, roleIDs)
}

func (s *Service) legacyAPISetRoles(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in struct {
		Path         string   `json:"path"`
		Method       string   `json:"method"`
		AuthorityIDs []uint64 `json:"authorityIds"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "角色 API 参数格式错误")
	}
	var resource database.APIResource
	if err := s.DB.WithContext(c.Request().Context()).Where("path=? AND method=?", strings.TrimSpace(in.Path), strings.ToUpper(strings.TrimSpace(in.Method))).First(&resource).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "API 资源不存在")
		}
		return err
	}
	if err := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id=? AND api_resource_id=?", id.TenantID, resource.ID).Delete(&database.IAMRoleAPI{}).Error; err != nil {
			return err
		}
		if len(in.AuthorityIDs) == 0 {
			return nil
		}
		var count int64
		if err := tx.Model(&database.Role{}).Where("tenant_id=? AND id IN ? AND status=?", id.TenantID, in.AuthorityIDs, "active").Count(&count).Error; err != nil {
			return err
		}
		if count != int64(len(in.AuthorityIDs)) {
			return httpx.NewError(http.StatusBadRequest, "ROLE_TENANT_MISMATCH", "角色不属于当前租户")
		}
		for _, roleID := range in.AuthorityIDs {
			if err := tx.Create(&database.IAMRoleAPI{TenantID: id.TenantID, RoleID: roleID, APIResourceID: resource.ID}).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}
