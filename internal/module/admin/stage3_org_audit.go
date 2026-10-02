package admin

// Stage three adds the operational surfaces that are useful in a real
// installation: a normalized organization view, a role permission matrix,
// tenant-scoped audit reports and a safe runtime monitor. The endpoints are
// intentionally small JSON contracts so they can be consumed by both the
// bundled UI and external automation.

import (
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"gorm.io/gorm"
)

func RegisterStage3Routes(g *echo.Group, s *Service) {
	p := func(permission string) []echo.MiddlewareFunc {
		return []echo.MiddlewareFunc{s.RequirePermission(permission)}
	}
	// Organization aliases provide a stable contract for clients that do not
	// use the reference frontend's memberships endpoints.
	g.GET("/enterprise/org/tree", s.legacyDepartmentTree, p("department:list")...)
	g.GET("/enterprise/org/users/:id/organization", s.stage3UserOrganization, p("user:list")...)
	g.PUT("/enterprise/org/users/:id/organization", s.stage3UserOrganization, p("user:update")...)

	// The matrix combines menus, globally registered APIs and explicit action
	// tuples. A role update replaces all three sets atomically.
	g.GET("/enterprise/permissions/catalog", s.stage3PermissionCatalog, p("role:list")...)
	g.GET("/enterprise/permissions/check", s.stage3PermissionCheck, p("role:list")...)
	g.GET("/enterprise/permissions/matrix/:roleId", s.stage3PermissionMatrix, p("role:list")...)
	g.PUT("/enterprise/permissions/matrix/:roleId", s.stage3PermissionMatrix, p("role:update")...)

	g.GET("/enterprise/audit/report", s.stage3AuditReport, p("audit:list")...)
	g.GET("/enterprise/monitor/overview", s.stage3MonitorOverview, p("health:view")...)
	// Short aliases are convenient for scripts and remain tenant scoped.
	g.GET("/audit/report", s.stage3AuditReport, p("audit:list")...)
	g.GET("/system/monitor/overview", s.stage3MonitorOverview, p("health:view")...)
}

func (s *Service) stage3UserOrganization(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	uid, err := legacyOrgID(c, "id", "用户")
	if err != nil {
		return err
	}
	if c.Request().Method == http.MethodPut {
		var in legacyUserMembershipInput
		if err := c.Bind(&in); err != nil {
			return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "组织关系参数格式错误")
		}
		if err := s.saveUserMembership(c.Request().Context(), id.TenantID, uid, in); err != nil {
			return err
		}
	}
	view, err := s.readUserMembership(c.Request().Context(), id.TenantID, uid)
	if err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"organization": view})
}

type stage3Action struct {
	Resource string `json:"resource"`
	Action   string `json:"action"`
	Effect   *bool  `json:"effect"`
}

func stage3Bool(v *bool) bool {
	return v == nil || *v
}

func stage3Role(c *echo.Context, s *Service) (uint64, database.Role, error) {
	id, err := identityFrom(c)
	if err != nil {
		return 0, database.Role{}, err
	}
	rid, err := legacyOrgID(c, "roleId", "角色")
	if err != nil {
		return id.TenantID, database.Role{}, err
	}
	var role database.Role
	if e := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ? AND id = ?", id.TenantID, rid).First(&role).Error; e != nil {
		if e == gorm.ErrRecordNotFound {
			return id.TenantID, database.Role{}, httpx.NewError(http.StatusNotFound, "NOT_FOUND", "角色不存在")
		}
		return id.TenantID, database.Role{}, e
	}
	return id.TenantID, role, nil
}

func (s *Service) stage3PermissionCatalog(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var menus []database.Menu
	if err := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ?", tid).Order("sort asc,id asc").Find(&menus).Error; err != nil {
		return err
	}
	menuItems := make([]map[string]any, 0, len(menus))
	for _, m := range menus {
		menuItems = append(menuItems, map[string]any{"id": m.ID, "name": m.Name, "path": m.Path, "permission": m.Permission, "type": m.Type, "parentId": m.ParentID})
	}
	var apis []database.APIResource
	if err := s.DB.WithContext(c.Request().Context()).Order("`group` asc, method asc, path asc").Find(&apis).Error; err != nil {
		return err
	}
	apiItems := make([]map[string]any, 0, len(apis))
	for _, a := range apis {
		apiItems = append(apiItems, map[string]any{"id": a.ID, "method": a.Method, "path": a.Path, "group": a.Group, "permission": a.Permission})
	}
	return legacyOK(c, map[string]any{"menus": menuItems, "apis": apiItems, "actions": stage3ActionCatalog()})
}

func (s *Service) stage3PermissionCheck(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	resource, action := strings.TrimSpace(c.QueryParam("resource")), strings.TrimSpace(c.QueryParam("action"))
	if resource == "" || action == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "resource 和 action 不能为空")
	}
	var denied, allowed int64
	q := s.DB.WithContext(c.Request().Context()).Table("iam_role_actions ra").Joins("JOIN role_memberships rm ON rm.role_id = ra.role_id AND rm.tenant_id = ra.tenant_id").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id AND r.status = ?", "active").Where("ra.tenant_id = ? AND rm.user_id = ? AND ra.resource = ? AND ra.action = ?", id.TenantID, id.UserID, resource, action)
	q.Where("ra.effect = ?", false).Count(&denied)
	q.Where("ra.effect = ?", true).Count(&allowed)
	if allowed == 0 && denied == 0 {
		// Legacy menu grants remain effective when a role has not opted into
		// explicit action rows yet.
		s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN role_menus rmenu ON rmenu.role_id = rm.role_id AND rmenu.tenant_id = rm.tenant_id").Joins("JOIN menus m ON m.id = rmenu.menu_id AND m.tenant_id = rmenu.tenant_id").Where("rm.tenant_id = ? AND rm.user_id = ? AND m.permission = ?", id.TenantID, id.UserID, resource+":"+action).Count(&allowed)
	}
	// Built-in administrators keep the existing operational-owner semantics.
	var tenantAdmin int64
	s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").Where("rm.tenant_id = ? AND rm.user_id = ? AND r.code = ? AND r.status = ?", id.TenantID, id.UserID, "tenant_admin", "active").Count(&tenantAdmin)
	if id.PlatformAdmin || tenantAdmin > 0 || allowed > 0 && denied == 0 {
		return legacyOK(c, map[string]any{"allowed": true, "resource": resource, "action": action, "reason": "授权"})
	}
	return legacyOK(c, map[string]any{"allowed": false, "resource": resource, "action": action, "reason": func() string {
		if denied > 0 {
			return "明确拒绝"
		}
		return "未授权"
	}()})
}

func stage3ActionCatalog() []map[string]any {
	resources := map[string][]string{
		"user":       {"list", "create", "update", "delete", "export"},
		"role":       {"list", "create", "update", "delete", "assign"},
		"menu":       {"list", "create", "update", "delete", "assign"},
		"department": {"list", "create", "update", "delete", "assign"},
		"position":   {"list", "create", "update", "delete", "assign"},
		"audit":      {"list", "delete", "export"},
		"file":       {"list", "create", "update", "delete", "download"},
		"health":     {"view"},
		"codegen":    {"list", "create", "rollback"},
	}
	out := make([]map[string]any, 0)
	for resource, actions := range resources {
		for _, action := range actions {
			out = append(out, map[string]any{"resource": resource, "action": action, "key": resource + ":" + action})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["key"].(string) < out[j]["key"].(string) })
	return out
}

func (s *Service) stage3PermissionMatrix(c *echo.Context) error {
	tenantID, role, err := stage3Role(c, s)
	if err != nil {
		return err
	}
	db := s.DB.WithContext(c.Request().Context())
	if c.Request().Method == http.MethodPut {
		if role.Code == "platform_admin" || role.Code == "tenant_admin" {
			return httpx.NewError(http.StatusForbidden, "BUILTIN_ROLE_PROTECTED", "内置角色不能修改权限矩阵")
		}
		var in struct {
			MenuIDs        []uint64       `json:"menuIds"`
			APIResourceIDs []uint64       `json:"apiResourceIds"`
			Actions        []stage3Action `json:"actions"`
		}
		if err := c.Bind(&in); err != nil {
			return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "权限矩阵参数格式错误")
		}
		in.MenuIDs, in.APIResourceIDs = unique(in.MenuIDs), unique(in.APIResourceIDs)
		var count int64
		if len(in.MenuIDs) > 0 {
			if e := db.Model(&database.Menu{}).Where("tenant_id = ? AND id IN ?", tenantID, in.MenuIDs).Count(&count).Error; e != nil || count != int64(len(in.MenuIDs)) {
				return httpx.NewError(http.StatusBadRequest, "CROSS_TENANT_REFERENCE", "菜单不属于当前租户")
			}
		}
		if len(in.APIResourceIDs) > 0 {
			if e := db.Model(&database.APIResource{}).Where("id IN ?", in.APIResourceIDs).Count(&count).Error; e != nil || count != int64(len(in.APIResourceIDs)) {
				return httpx.NewError(http.StatusBadRequest, "INVALID_API_RESOURCE", "API 资源不存在")
			}
		}
		seen := map[string]int{}
		normalizedActions := make([]stage3Action, 0, len(in.Actions))
		for _, a := range in.Actions {
			a.Resource, a.Action = strings.TrimSpace(a.Resource), strings.TrimSpace(a.Action)
			if a.Resource == "" || a.Action == "" || len(a.Resource) > 160 || len(a.Action) > 80 {
				return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "资源和动作不能为空")
			}
			key := a.Resource + "\x00" + a.Action
			if index, ok := seen[key]; ok {
				// Last write wins, which lets the UI represent an explicit deny
				// after a stale allow without generating duplicate primary keys.
				normalizedActions[index] = a
				continue
			}
			seen[key] = len(normalizedActions)
			normalizedActions = append(normalizedActions, a)
		}
		in.Actions = normalizedActions
		err = db.Transaction(func(tx *gorm.DB) error {
			if e := tx.Where("tenant_id = ? AND role_id = ?", tenantID, role.ID).Delete(&database.RoleMenu{}).Error; e != nil {
				return e
			}
			if e := tx.Where("tenant_id = ? AND role_id = ?", tenantID, role.ID).Delete(&database.IAMRoleAPI{}).Error; e != nil {
				return e
			}
			if e := tx.Where("tenant_id = ? AND role_id = ?", tenantID, role.ID).Delete(&database.IAMRoleAction{}).Error; e != nil {
				return e
			}
			for _, mid := range in.MenuIDs {
				if e := tx.Create(&database.RoleMenu{TenantID: tenantID, RoleID: role.ID, MenuID: mid}).Error; e != nil {
					return e
				}
			}
			for _, aid := range in.APIResourceIDs {
				if e := tx.Create(&database.IAMRoleAPI{TenantID: tenantID, RoleID: role.ID, APIResourceID: aid}).Error; e != nil {
					return e
				}
			}
			for _, a := range in.Actions {
				if a.Resource == "" || a.Action == "" {
					continue
				}
				if e := tx.Create(&database.IAMRoleAction{TenantID: tenantID, RoleID: role.ID, Resource: strings.TrimSpace(a.Resource), Action: strings.TrimSpace(a.Action), Effect: stage3Bool(a.Effect)}).Error; e != nil {
					return e
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	return s.stage3PermissionMatrixView(c, tenantID, role)
}

func (s *Service) stage3PermissionMatrixView(c *echo.Context, tenantID uint64, role database.Role) error {
	db := s.DB.WithContext(c.Request().Context())
	var menuIDs, apiIDs []uint64
	db.Model(&database.RoleMenu{}).Where("tenant_id = ? AND role_id = ?", tenantID, role.ID).Pluck("menu_id", &menuIDs)
	db.Model(&database.IAMRoleAPI{}).Where("tenant_id = ? AND role_id = ?", tenantID, role.ID).Pluck("api_resource_id", &apiIDs)
	menuSet, apiSet := map[uint64]bool{}, map[uint64]bool{}
	for _, id := range menuIDs {
		menuSet[id] = true
	}
	for _, id := range apiIDs {
		apiSet[id] = true
	}
	var actions []database.IAMRoleAction
	db.Where("tenant_id = ? AND role_id = ?", tenantID, role.ID).Order("resource,action").Find(&actions)
	actionItems := make([]map[string]any, 0, len(actions))
	for _, a := range actions {
		actionItems = append(actionItems, map[string]any{"resource": a.Resource, "action": a.Action, "effect": a.Effect})
	}
	var menus []database.Menu
	db.Where("tenant_id = ?", tenantID).Order("sort asc,id asc").Find(&menus)
	menuItems := make([]map[string]any, 0, len(menus))
	for _, m := range menus {
		menuItems = append(menuItems, map[string]any{"id": m.ID, "name": m.Name, "path": m.Path, "permission": m.Permission, "granted": menuSet[m.ID]})
	}
	var apis []database.APIResource
	db.Order("`group` asc,method asc,path asc").Find(&apis)
	apiItems := make([]map[string]any, 0, len(apis))
	for _, a := range apis {
		apiItems = append(apiItems, map[string]any{"id": a.ID, "method": a.Method, "path": a.Path, "group": a.Group, "permission": a.Permission, "granted": apiSet[a.ID]})
	}
	return legacyOK(c, map[string]any{"role": map[string]any{"id": role.ID, "name": role.Name, "code": role.Code}, "menus": menuItems, "apis": apiItems, "actions": actionItems})
}

func stage3TimeParam(value string, end bool) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t, true
	}
	if t, err := time.ParseInLocation("2006-01-02", value, time.Local); err == nil {
		if end {
			return t.Add(24*time.Hour - time.Nanosecond), true
		}
		return t, true
	}
	return time.Time{}, false
}

func (s *Service) stage3AuditReport(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	q := s.DB.WithContext(c.Request().Context()).Model(&database.AuditLog{}).Where("tenant_id = ?", tid)
	if t, ok := stage3TimeParam(c.QueryParam("start"), false); ok {
		q = q.Where("created_at >= ?", t)
	}
	if t, ok := stage3TimeParam(c.QueryParam("end"), true); ok {
		q = q.Where("created_at <= ?", t)
	}
	if v := strings.TrimSpace(c.QueryParam("userId")); v != "" {
		if uid, e := strconv.ParseUint(v, 10, 64); e == nil && uid > 0 {
			q = q.Where("user_id = ?", uid)
		}
	}
	if v := strings.TrimSpace(c.QueryParam("action")); v != "" {
		q = q.Where("action = ?", v)
	}
	if v := strings.TrimSpace(c.QueryParam("resource")); v != "" {
		q = q.Where("resource = ?", v)
	}
	if v := strings.TrimSpace(c.QueryParam("result")); v != "" {
		q = q.Where("result = ?", v)
	}
	var logs []database.AuditLog
	if err := q.Order("created_at asc,id asc").Limit(10000).Find(&logs).Error; err != nil {
		return err
	}
	byAction, byResource, byUser, byDay := map[string]int64{}, map[string]int64{}, map[string]int64{}, map[string]int64{}
	var success, failure int64
	for _, row := range logs {
		byAction[row.Action]++
		byResource[row.Resource]++
		byUser[strconv.FormatUint(ptrID(row.UserID), 10)]++
		byDay[row.CreatedAt.Format("2006-01-02")]++
		if strings.EqualFold(row.Result, "success") {
			success++
		} else {
			failure++
		}
	}
	return legacyOK(c, map[string]any{"summary": map[string]any{"total": len(logs), "success": success, "failure": failure, "truncated": len(logs) >= 10000}, "byAction": stage3SortedCounts(byAction), "byResource": stage3SortedCounts(byResource), "byUser": stage3SortedCounts(byUser), "byDay": stage3SortedCounts(byDay)})
}

func ptrID(v *uint64) uint64 {
	if v == nil {
		return 0
	}
	return *v
}
func stage3SortedCounts(values map[string]int64) []map[string]any {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]map[string]any, 0, len(keys))
	for _, key := range keys {
		out = append(out, map[string]any{"key": key, "count": values[key]})
	}
	return out
}

func (s *Service) stage3MonitorOverview(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	dbStatus := "ok"
	if err := s.DB.Ping(ctx); err != nil {
		dbStatus = "error"
	}
	var users, errorsCount, auditCount int64
	s.DB.WithContext(ctx).Table("tenant_memberships").Where("tenant_id = ? AND status = ?", tid, "active").Count(&users)
	s.DB.WithContext(ctx).Model(&database.SystemError{}).Where("tenant_id = ? AND created_at >= ?", tid, time.Now().Add(-24*time.Hour)).Count(&errorsCount)
	dayAgo := time.Now().Add(-24 * time.Hour)
	s.DB.WithContext(ctx).Model(&database.AuditLog{}).Where("tenant_id = ? AND created_at >= ?", tid, dayAgo).Count(&auditCount)
	var requestStats struct {
		Requests int64   `gorm:"column:requests"`
		Average  float64 `gorm:"column:average"`
		Failed   int64   `gorm:"column:failed"`
	}
	s.DB.WithContext(ctx).Model(&database.AuditLog{}).Where("tenant_id = ? AND created_at >= ?", tid, dayAgo).Select("COUNT(*) AS requests, COALESCE(AVG(duration_ms), 0) AS average, SUM(CASE WHEN result <> 'success' THEN 1 ELSE 0 END) AS failed").Scan(&requestStats)
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	stats := map[string]any{}
	if sqlDB, e := s.DB.DB.DB(); e == nil {
		st := sqlDB.Stats()
		stats = map[string]any{"open": st.OpenConnections, "inUse": st.InUse, "idle": st.Idle, "waitCount": st.WaitCount, "waitDurationMs": st.WaitDuration.Milliseconds()}
	}
	return legacyOK(c, map[string]any{"status": map[string]any{"database": dbStatus, "service": "ok", "checkedAt": time.Now()}, "tenant": map[string]any{"activeUsers": users, "errors24h": errorsCount, "auditEvents24h": auditCount}, "requests24h": map[string]any{"total": requestStats.Requests, "failed": requestStats.Failed, "averageDurationMs": requestStats.Average}, "process": map[string]any{"goroutines": runtime.NumGoroutine(), "memoryAllocBytes": mem.Alloc, "memorySysBytes": mem.Sys, "gcCycles": mem.NumGC}, "database": stats})
}
