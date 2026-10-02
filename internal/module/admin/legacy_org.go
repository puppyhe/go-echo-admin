package admin

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
	"gorm.io/gorm"
)

// legacyOrgIdentity deliberately uses the authenticated tenant identity. No
// organization endpoint accepts a tenant id from the request body or query.
func legacyOrgIdentity(c *echo.Context) (tenant.Identity, error) {
	v := c.Get(identityKey)
	id, ok := v.(tenant.Identity)
	if !ok || id.TenantID == 0 || id.UserID == 0 || id.MembershipID == 0 {
		return tenant.Identity{}, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_TOKEN", "Authentication context is missing")
	}
	return id, nil
}

func legacyOrgID(c *echo.Context, name, label string) (uint64, error) {
	raw := strings.TrimSpace(c.Param(name))
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id == 0 {
		return 0, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少有效的"+label+" ID")
	}
	return id, nil
}

func legacyOrgStatus(v any) string {
	switch x := v.(type) {
	case bool:
		if x {
			return "active"
		}
		return "disabled"
	case string:
		if strings.EqualFold(strings.TrimSpace(x), "disabled") || strings.EqualFold(strings.TrimSpace(x), "inactive") {
			return "disabled"
		}
	}
	return "active"
}

func legacyOrgUserExists(db *gorm.DB, tenantID, userID uint64) error {
	var m database.TenantMembership
	if err := db.Where("tenant_id = ? AND user_id = ? AND status = ?", tenantID, userID, "active").First(&m).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusBadRequest, "USER_TENANT_MISMATCH", "用户不属于当前租户")
		}
		return err
	}
	var u database.User
	if err := db.Where("id = ? AND status = ?", userID, "active").First(&u).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusBadRequest, "USER_DISABLED", "用户不存在或已禁用")
		}
		return err
	}
	return nil
}

func legacyDepartmentOutput(db *gorm.DB, row database.Department) map[string]any {
	parent := uint64(0)
	if row.ParentID != nil {
		parent = *row.ParentID
	}
	var leader map[string]any
	if row.LeaderID != nil {
		var u database.User
		if db.Table("users u").Joins("JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = ? AND tm.status = ?", row.TenantID, "active").Where("u.id = ?", *row.LeaderID).First(&u).Error == nil {
			leader = map[string]any{"id": u.ID, "username": u.Username, "nickName": u.Nickname, "phone": u.Phone, "email": optionalString(u.Email), "enable": u.Status == "active"}
		}
	}
	return map[string]any{"id": row.ID, "parentId": parent, "name": row.Name, "code": row.Code, "leaderId": row.LeaderID, "leader": leader, "sort": row.Sort, "status": row.Status == "active", "children": []any{}}
}

// legacyDepartmentView is kept for callers that render a single department
// without a database handle (the tree endpoint uses legacyDepartmentOutput to
// also hydrate a tenant-scoped leader object).
func legacyDepartmentView(row database.Department) map[string]any {
	parent := uint64(0)
	if row.ParentID != nil {
		parent = *row.ParentID
	}
	return map[string]any{"id": row.ID, "parentId": parent, "name": row.Name, "code": row.Code, "leaderId": row.LeaderID, "leader": nil, "sort": row.Sort, "status": row.Status == "active", "children": []any{}}
}

func (s *Service) legacyDepartmentTree(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	var rows []database.Department
	if err := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ?", id.TenantID).Order("sort asc, id asc").Find(&rows).Error; err != nil {
		return err
	}
	nodes := make(map[uint64]map[string]any, len(rows))
	children := make(map[uint64][]uint64)
	for _, row := range rows {
		parent := uint64(0)
		if row.ParentID != nil {
			parent = *row.ParentID
		}
		nodes[row.ID] = legacyDepartmentOutput(s.DB.WithContext(c.Request().Context()), row)
		children[parent] = append(children[parent], row.ID)
	}
	for parent := range children {
		sort.SliceStable(children[parent], func(i, j int) bool {
			a, b := nodes[children[parent][i]], nodes[children[parent][j]]
			as, _ := a["sort"].(int)
			bs, _ := b["sort"].(int)
			if as != bs {
				return as < bs
			}
			return children[parent][i] < children[parent][j]
		})
	}
	var build func(uint64, map[uint64]bool) []map[string]any
	build = func(parent uint64, visiting map[uint64]bool) []map[string]any {
		out := make([]map[string]any, 0, len(children[parent]))
		for _, child := range children[parent] {
			if visiting[child] {
				continue
			}
			item := nodes[child]
			next := make(map[uint64]bool, len(visiting)+1)
			for key := range visiting {
				next[key] = true
			}
			next[child] = true
			item["children"] = build(child, next)
			out = append(out, item)
		}
		return out
	}
	return legacyOK(c, map[string]any{"list": build(0, map[uint64]bool{})})
}

type legacyDepartmentInput struct {
	Name     string  `json:"name"`
	Code     string  `json:"code"`
	ParentID *uint64 `json:"parentId"`
	LeaderID *uint64 `json:"leaderId"`
	Sort     int     `json:"sort"`
	Status   any     `json:"status"`
}

func (s *Service) legacyDepartmentMutation(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	var in legacyDepartmentInput
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "部门参数格式错误")
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "部门名称不能为空")
	}
	departmentID := uint64(0)
	if c.Param("id") != "" {
		departmentID, err = legacyOrgID(c, "id", "部门")
		if err != nil {
			return err
		}
	}
	if in.ParentID != nil && *in.ParentID == 0 {
		in.ParentID = nil
	}
	if in.LeaderID != nil && *in.LeaderID == 0 {
		in.LeaderID = nil
	}
	db := s.DB.WithContext(c.Request().Context())
	if in.ParentID != nil {
		if *in.ParentID == departmentID {
			return httpx.NewError(http.StatusBadRequest, "DEPARTMENT_CYCLE", "部门不能将自己设为父部门")
		}
		var parent database.Department
		if db.Where("tenant_id = ? AND id = ?", id.TenantID, *in.ParentID).First(&parent).Error != nil {
			return httpx.NewError(http.StatusBadRequest, "PARENT_TENANT_MISMATCH", "父部门不存在或不属于当前租户")
		}
		for cursor, seen := *in.ParentID, map[uint64]bool{}; cursor != 0; {
			if seen[cursor] {
				return httpx.NewError(http.StatusBadRequest, "DEPARTMENT_CYCLE", "部门层级存在循环")
			}
			seen[cursor] = true
			var p database.Department
			if db.Where("tenant_id = ? AND id = ?", id.TenantID, cursor).First(&p).Error != nil || p.ParentID == nil {
				break
			}
			if p.ParentID != nil && *p.ParentID == departmentID {
				return httpx.NewError(http.StatusBadRequest, "DEPARTMENT_CYCLE", "部门层级存在循环")
			}
			cursor = *p.ParentID
		}
	}
	if in.LeaderID != nil {
		if err := legacyOrgUserExists(db, id.TenantID, *in.LeaderID); err != nil {
			return err
		}
	}
	status := legacyOrgStatus(in.Status)
	code := strings.TrimSpace(in.Code)
	if code == "" {
		code = departmentCode(in.Name)
	}
	var row database.Department
	if departmentID > 0 {
		if db.Where("tenant_id = ? AND id = ?", id.TenantID, departmentID).First(&row).Error != nil {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "部门不存在")
		}
		row.Name, row.Code, row.ParentID, row.LeaderID, row.Sort, row.Status = in.Name, code, in.ParentID, in.LeaderID, in.Sort, status
		if err := db.Save(&row).Error; err != nil {
			return httpx.NewError(http.StatusConflict, "DEPARTMENT_EXISTS", "部门编码已存在")
		}
	} else {
		row = database.Department{TenantID: id.TenantID, Name: in.Name, Code: code, ParentID: in.ParentID, LeaderID: in.LeaderID, Sort: in.Sort, Status: status}
		if err := db.Create(&row).Error; err != nil {
			return httpx.NewError(http.StatusConflict, "DEPARTMENT_EXISTS", "部门编码已存在")
		}
	}
	return legacyOK(c, legacyDepartmentOutput(db, row))
}

func (s *Service) legacyDepartmentDelete(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	departmentID, err := legacyOrgID(c, "id", "部门")
	if err != nil {
		return err
	}
	db := s.DB.WithContext(c.Request().Context())
	var count int64
	for _, check := range []struct {
		query *gorm.DB
		code  string
		msg   string
	}{
		{db.Model(&database.Department{}).Where("tenant_id = ? AND parent_id = ?", id.TenantID, departmentID), "DEPARTMENT_HAS_CHILDREN", "请先删除子部门"},
		{db.Model(&database.DepartmentMember{}).Where("tenant_id = ? AND department_id = ?", id.TenantID, departmentID), "DEPARTMENT_HAS_MEMBERS", "部门仍有成员，不能删除"},
		{db.Model(&database.TenantMembership{}).Where("tenant_id = ? AND primary_department_id = ?", id.TenantID, departmentID), "DEPARTMENT_HAS_MEMBERS", "部门仍是用户主部门，不能删除"},
	} {
		if err := check.query.Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return httpx.NewError(http.StatusConflict, check.code, check.msg)
		}
	}
	res := db.Where("tenant_id = ? AND id = ?", id.TenantID, departmentID).Delete(&database.Department{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "部门不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}

func departmentCode(name string) string {
	value := strings.ToLower(strings.TrimSpace(name))
	value = strings.NewReplacer(" ", "-", "/", "-", "_", "-").Replace(value)
	if value == "" {
		return "department"
	}
	return value
}

type legacyPositionInput struct {
	Name   string `json:"name"`
	Code   string `json:"code"`
	Sort   int    `json:"sort"`
	Status any    `json:"status"`
	Remark string `json:"remark"`
}

func (s *Service) legacyPositionList(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	keyword := strings.TrimSpace(c.QueryParam("keyword"))
	db := s.DB.WithContext(c.Request().Context()).Model(&database.Position{}).Where("tenant_id = ?", id.TenantID)
	if keyword != "" {
		db = db.Where("name LIKE ? OR code LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}
	var total int64
	db.Count(&total)
	var rows []database.Position
	if err := db.Order("sort asc, id asc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, legacyPositionOutput(row))
	}
	return legacyOK(c, map[string]any{"list": items, "page": page, "pageSize": size, "total": total})
}

func legacyPositionOutput(row database.Position) map[string]any {
	return map[string]any{"id": row.ID, "name": row.Name, "code": row.Code, "sort": row.Sort, "status": row.Status == "active", "remark": row.Remark}
}

func (s *Service) legacyPositionMutation(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	var in legacyPositionInput
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "岗位参数格式错误")
	}
	in.Name, in.Code = strings.TrimSpace(in.Name), strings.TrimSpace(in.Code)
	if in.Name == "" || in.Code == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "岗位名称和编码不能为空")
	}
	positionID := uint64(0)
	if c.Param("id") != "" {
		positionID, err = legacyOrgID(c, "id", "岗位")
		if err != nil {
			return err
		}
	}
	db := s.DB.WithContext(c.Request().Context())
	var row database.Position
	if positionID > 0 {
		if db.Where("tenant_id = ? AND id = ?", id.TenantID, positionID).First(&row).Error != nil {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "岗位不存在")
		}
		row.Name, row.Code, row.Sort, row.Status, row.Remark = in.Name, in.Code, in.Sort, legacyOrgStatus(in.Status), strings.TrimSpace(in.Remark)
		if err := db.Save(&row).Error; err != nil {
			return httpx.NewError(http.StatusConflict, "POSITION_EXISTS", "岗位编码已存在")
		}
	} else {
		row = database.Position{TenantID: id.TenantID, Name: in.Name, Code: in.Code, Sort: in.Sort, Status: legacyOrgStatus(in.Status), Remark: strings.TrimSpace(in.Remark)}
		if err := db.Create(&row).Error; err != nil {
			return httpx.NewError(http.StatusConflict, "POSITION_EXISTS", "岗位编码已存在")
		}
	}
	return legacyOK(c, legacyPositionOutput(row))
}

func (s *Service) legacyPositionDelete(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	positionID, err := legacyOrgID(c, "id", "岗位")
	if err != nil {
		return err
	}
	db := s.DB.WithContext(c.Request().Context())
	var members int64
	if err := db.Model(&database.PositionMember{}).Where("tenant_id = ? AND position_id = ?", id.TenantID, positionID).Count(&members).Error; err != nil {
		return err
	}
	if members > 0 {
		return httpx.NewError(http.StatusConflict, "POSITION_HAS_MEMBERS", "岗位仍有成员，不能删除")
	}
	res := db.Where("tenant_id = ? AND id = ?", id.TenantID, positionID).Delete(&database.Position{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "岗位不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}

func (s *Service) legacyOrgUserList(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	keyword := strings.TrimSpace(c.QueryParam("keyword"))
	username := strings.TrimSpace(c.QueryParam("username"))
	nickname := strings.TrimSpace(c.QueryParam("nickName"))
	db := s.DB.WithContext(c.Request().Context()).Table("users u").Joins("JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = ? AND tm.status = ?", id.TenantID, "active").Where("u.status = ?", "active")
	if c.QueryParam("onlyEnabled") == "false" {
		db = s.DB.WithContext(c.Request().Context()).Table("users u").Joins("JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = ?", id.TenantID).Where("tm.status = ?", "active")
	}
	if keyword != "" {
		db = db.Where("u.username LIKE ? OR u.nickname LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}
	if username != "" {
		db = db.Where("u.username LIKE ?", "%"+username+"%")
	}
	if nickname != "" {
		db = db.Where("u.nickname LIKE ?", "%"+nickname+"%")
	}
	var total int64
	db.Count(&total)
	var rows []database.User
	if err := db.Select("u.*").Order("u.id asc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, u := range rows {
		items = append(items, map[string]any{"id": u.ID, "username": u.Username, "nickName": u.Nickname, "phone": u.Phone, "email": optionalString(u.Email), "enable": u.Status == "active"})
	}
	return legacyOK(c, map[string]any{"list": items, "page": page, "pageSize": size, "total": total})
}

type legacyMemberInput struct {
	UserIDs []uint64 `json:"userIds"`
}

func (s *Service) legacyOrgMembers(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	kind := strings.TrimSuffix(strings.ToLower(c.Param("kind")), "/")
	targetID, err := legacyOrgID(c, "id", "组织对象")
	if err != nil {
		return err
	}
	db := s.DB.WithContext(c.Request().Context())
	var userIDs []uint64
	switch kind {
	case "departments":
		var target database.Department
		if db.Where("tenant_id = ? AND id = ?", id.TenantID, targetID).First(&target).Error != nil {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "部门不存在")
		}
		if c.Request().Method == http.MethodPut && target.Status != "active" {
			return httpx.NewError(http.StatusConflict, "ORGANIZATION_DISABLED", "部门已禁用，不能修改成员")
		}
		db.Model(&database.DepartmentMember{}).Where("tenant_id = ? AND department_id = ?", id.TenantID, targetID).Pluck("user_id", &userIDs)
	case "positions":
		var target database.Position
		if db.Where("tenant_id = ? AND id = ?", id.TenantID, targetID).First(&target).Error != nil {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "岗位不存在")
		}
		if c.Request().Method == http.MethodPut && target.Status != "active" {
			return httpx.NewError(http.StatusConflict, "ORGANIZATION_DISABLED", "岗位已禁用，不能修改成员")
		}
		db.Model(&database.PositionMember{}).Where("tenant_id = ? AND position_id = ?", id.TenantID, targetID).Pluck("user_id", &userIDs)
	default:
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "组织类型必须是 departments 或 positions")
	}
	sort.Slice(userIDs, func(i, j int) bool { return userIDs[i] < userIDs[j] })
	if c.Request().Method == http.MethodPut {
		var in legacyMemberInput
		if err := c.Bind(&in); err != nil {
			return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "成员参数格式错误")
		}
		unique := make([]uint64, 0, len(in.UserIDs))
		seen := map[uint64]bool{}
		for _, userID := range in.UserIDs {
			if userID == 0 || seen[userID] {
				continue
			}
			if err := legacyOrgUserExists(db, id.TenantID, userID); err != nil {
				return err
			}
			seen[userID] = true
			unique = append(unique, userID)
		}
		if err := s.replaceOrgMembers(c.Request().Context(), id.TenantID, kind, targetID, unique); err != nil {
			return err
		}
		userIDs = unique
		sort.Slice(userIDs, func(i, j int) bool { return userIDs[i] < userIDs[j] })
	}
	page, size := legacyPageParams(c)
	items := make([]map[string]any, 0, len(userIDs))
	for _, userID := range userIDs {
		var u database.User
		if db.Where("id = ?", userID).First(&u).Error == nil {
			items = append(items, map[string]any{"id": u.ID, "username": u.Username, "nickName": u.Nickname, "phone": u.Phone, "email": optionalString(u.Email), "enable": u.Status == "active"})
		}
	}
	return legacyOK(c, map[string]any{"list": items, "page": page, "pageSize": size, "total": len(items), "userIds": userIDs})
}

func (s *Service) replaceOrgMembers(ctx context.Context, tenantID uint64, kind string, targetID uint64, userIDs []uint64) error {
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		switch kind {
		case "departments":
			if err := tx.Where("tenant_id = ? AND department_id = ?", tenantID, targetID).Delete(&database.DepartmentMember{}).Error; err != nil {
				return err
			}
			for _, userID := range userIDs {
				if err := tx.Create(&database.DepartmentMember{TenantID: tenantID, DepartmentID: targetID, UserID: userID}).Error; err != nil {
					return err
				}
			}
		case "positions":
			if err := tx.Where("tenant_id = ? AND position_id = ?", tenantID, targetID).Delete(&database.PositionMember{}).Error; err != nil {
				return err
			}
			for _, userID := range userIDs {
				if err := tx.Create(&database.PositionMember{TenantID: tenantID, PositionID: targetID, UserID: userID}).Error; err != nil {
					return err
				}
			}
		default:
			return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "组织类型无效")
		}
		return nil
	})
}

func (s *Service) legacyUserMemberships(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	var out []map[string]any
	for _, raw := range strings.Split(c.QueryParam("userIds"), ",") {
		userID, parseErr := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
		if parseErr != nil || userID == 0 {
			continue
		}
		item, readErr := s.readUserMembership(c.Request().Context(), id.TenantID, userID)
		if readErr != nil {
			return readErr
		}
		out = append(out, item)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return legacyOK(c, map[string]any{"list": out})
}

type legacyUserMembershipInput struct {
	DepartmentIDs []uint64 `json:"departmentIds"`
	PositionIDs   []uint64 `json:"positionIds"`
}

func (s *Service) legacyUserMembership(c *echo.Context) error {
	id, err := legacyOrgIdentity(c)
	if err != nil {
		return err
	}
	userID, err := legacyOrgID(c, "id", "用户")
	if err != nil {
		return err
	}
	if c.Request().Method == http.MethodPut {
		var in legacyUserMembershipInput
		if err := c.Bind(&in); err != nil {
			return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "用户组织关系参数格式错误")
		}
		if err := s.saveUserMembership(c.Request().Context(), id.TenantID, userID, in); err != nil {
			return err
		}
	}
	item, err := s.readUserMembership(c.Request().Context(), id.TenantID, userID)
	if err != nil {
		return err
	}
	return legacyOK(c, item)
}

func uniqueIDs(ids []uint64) []uint64 {
	out := make([]uint64, 0, len(ids))
	seen := map[uint64]bool{}
	for _, id := range ids {
		if id > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func (s *Service) saveUserMembership(ctx context.Context, tenantID, userID uint64, in legacyUserMembershipInput) error {
	db := s.DB.WithContext(ctx)
	if err := legacyOrgUserExists(db, tenantID, userID); err != nil {
		return err
	}
	departments, positions := uniqueIDs(in.DepartmentIDs), uniqueIDs(in.PositionIDs)
	for _, departmentID := range departments {
		var row database.Department
		if db.Where("tenant_id = ? AND id = ? AND status = ?", tenantID, departmentID, "active").First(&row).Error != nil {
			return httpx.NewError(http.StatusBadRequest, "DEPARTMENT_TENANT_MISMATCH", "部门不存在、已禁用或不属于当前租户")
		}
	}
	for _, positionID := range positions {
		var row database.Position
		if db.Where("tenant_id = ? AND id = ? AND status = ?", tenantID, positionID, "active").First(&row).Error != nil {
			return httpx.NewError(http.StatusBadRequest, "POSITION_TENANT_MISMATCH", "岗位不存在、已禁用或不属于当前租户")
		}
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id = ? AND user_id = ?", tenantID, userID).Delete(&database.DepartmentMember{}).Error; err != nil {
			return err
		}
		for _, departmentID := range departments {
			if err := tx.Create(&database.DepartmentMember{TenantID: tenantID, DepartmentID: departmentID, UserID: userID}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("tenant_id = ? AND user_id = ?", tenantID, userID).Delete(&database.PositionMember{}).Error; err != nil {
			return err
		}
		for _, positionID := range positions {
			if err := tx.Create(&database.PositionMember{TenantID: tenantID, PositionID: positionID, UserID: userID}).Error; err != nil {
				return err
			}
		}
		primary := any(nil)
		if len(departments) > 0 {
			primary = departments[0]
		}
		position := any(nil)
		if len(positions) > 0 {
			position = positions[0]
		}
		return tx.Model(&database.TenantMembership{}).Where("tenant_id = ? AND user_id = ?", tenantID, userID).Updates(map[string]any{"primary_department_id": primary, "primary_position_id": position}).Error
	})
}

func (s *Service) readUserMembership(ctx context.Context, tenantID, userID uint64) (map[string]any, error) {
	db := s.DB.WithContext(ctx)
	if err := legacyOrgUserExists(db, tenantID, userID); err != nil {
		return nil, err
	}
	var departments []database.Department
	db.Table("departments d").Joins("JOIN department_members dm ON dm.department_id = d.id AND dm.tenant_id = d.tenant_id").Where("dm.tenant_id = ? AND dm.user_id = ?", tenantID, userID).Order("d.sort asc,d.id asc").Find(&departments)
	var positions []database.Position
	db.Table("positions p").Joins("JOIN position_members pm ON pm.position_id = p.id AND pm.tenant_id = p.tenant_id").Where("pm.tenant_id = ? AND pm.user_id = ?", tenantID, userID).Order("p.sort asc,p.id asc").Find(&positions)
	departmentIDs, positionIDs := make([]uint64, 0, len(departments)), make([]uint64, 0, len(positions))
	departmentNames, positionNames := make([]string, 0, len(departments)), make([]string, 0, len(positions))
	departmentViews, positionViews := make([]map[string]any, 0, len(departments)), make([]map[string]any, 0, len(positions))
	for _, row := range departments {
		departmentIDs = append(departmentIDs, row.ID)
		departmentNames = append(departmentNames, row.Name)
		departmentViews = append(departmentViews, map[string]any{"id": row.ID, "name": row.Name, "code": row.Code, "status": row.Status == "active"})
	}
	for _, row := range positions {
		positionIDs = append(positionIDs, row.ID)
		positionNames = append(positionNames, row.Name)
		positionViews = append(positionViews, map[string]any{"id": row.ID, "name": row.Name, "code": row.Code, "status": row.Status == "active"})
	}
	var membership database.TenantMembership
	_ = db.Select("primary_department_id,primary_position_id").Where("tenant_id = ? AND user_id = ?", tenantID, userID).First(&membership).Error
	return map[string]any{"userId": userID, "departmentIds": departmentIDs, "positionIds": positionIDs, "primaryDepartmentId": membership.PrimaryDepartmentID, "primaryPositionId": membership.PrimaryPositionID, "departmentNames": departmentNames, "positionNames": positionNames, "departments": departmentViews, "positions": positionViews, "canManage": true}, nil
}
