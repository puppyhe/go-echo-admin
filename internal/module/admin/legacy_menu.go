package admin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"gorm.io/gorm"
)

func boolValue(v any) bool { b, ok := v.(bool); return ok && b || number(v) == 1 }

func (s *Service) iamMenuView(db *gorm.DB, row database.Menu) map[string]any {
	var setting database.IAMMenuSetting
	_ = db.Where("tenant_id = ? AND menu_id = ?", row.TenantID, row.ID).First(&setting).Error
	title, icon, component := setting.Title, setting.Icon, setting.Component
	if title == "" {
		title = row.Name
	}
	if icon == "" {
		icon = row.Icon
	}
	if component == "" {
		component = legacyComponent(row.Path)
	}
	var parameters []map[string]any
	_ = json.Unmarshal([]byte(setting.Parameters), &parameters)
	if parameters == nil {
		parameters = []map[string]any{}
	}
	var buttons []database.IAMMenuButton
	db.Where("tenant_id = ? AND menu_id = ?", row.TenantID, row.ID).Order("id asc").Find(&buttons)
	buttonViews := make([]map[string]any, 0, len(buttons))
	for _, button := range buttons {
		buttonViews = append(buttonViews, map[string]any{"ID": button.ID, "name": button.Name, "desc": button.Description, "sysBaseMenuID": row.ID})
	}
	parent := uint64(0)
	if row.ParentID != nil {
		parent = *row.ParentID
	}
	return map[string]any{"ID": row.ID, "parentId": parent, "path": row.Path, "name": row.Name, "hidden": row.Hidden, "component": component, "sort": row.Sort, "permission": row.Permission, "type": row.Type, "meta": map[string]any{"title": title, "icon": icon, "keepAlive": row.Cache, "defaultMenu": setting.DefaultMenu, "closeTab": setting.CloseTab}, "parameters": parameters, "menuBtn": buttonViews, "children": []any{}}
}

func validateMenuParent(db *gorm.DB, tenantID, menuID, parentID uint64) error {
	seen := map[uint64]bool{}
	for parentID > 0 {
		if parentID == menuID || seen[parentID] {
			return httpx.NewError(400, "MENU_CYCLE", "菜单层级不能形成循环")
		}
		seen[parentID] = true
		var parent database.Menu
		if db.Where("tenant_id = ? AND id = ?", tenantID, parentID).First(&parent).Error != nil {
			return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "父菜单不属于当前租户")
		}
		parentID = 0
		if parent.ParentID != nil {
			parentID = *parent.ParentID
		}
	}
	return nil
}

func (s *Service) legacyMenuMutation(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "菜单参数格式错误")
	}
	mid, parent := number(first(in, "ID", "id")), number(in["parentId"])
	name, path := stringValue(in["name"]), stringValue(in["path"])
	if name == "" || path == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "菜单名称和路径不能为空")
	}
	meta, _ := in["meta"].(map[string]any)
	var saved database.Menu
	err = s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if err := validateMenuParent(tx, id.TenantID, mid, parent); err != nil {
			return err
		}
		if mid > 0 {
			if tx.Where("tenant_id = ? AND id = ?", id.TenantID, mid).First(&saved).Error != nil {
				return httpx.NewError(404, "NOT_FOUND", "菜单不存在")
			}
		} else {
			saved.TenantID = id.TenantID
		}
		var parentPtr *uint64
		if parent > 0 {
			parentPtr = &parent
		}
		saved.Name, saved.Path, saved.RouteName, saved.ParentID = name, path, name, parentPtr
		saved.Hidden, saved.Sort, saved.Icon, saved.Cache = boolValue(in["hidden"]), int(number(in["sort"])), stringValue(meta["icon"]), boolValue(meta["keepAlive"])
		if v, ok := in["permission"]; ok {
			saved.Permission = stringValue(v)
		}
		saved.Type = stringValue(in["type"])
		if saved.Type == "" {
			saved.Type = "page"
			if stringValue(in["component"]) == "routerHolder" {
				saved.Type = "directory"
			}
		}
		if err := tx.Save(&saved).Error; err != nil {
			return err
		}
		parameters, _ := json.Marshal(in["parameters"])
		setting := database.IAMMenuSetting{TenantID: id.TenantID, MenuID: saved.ID, Title: stringValue(meta["title"]), Icon: saved.Icon, KeepAlive: saved.Cache, DefaultMenu: boolValue(meta["defaultMenu"]), CloseTab: boolValue(meta["closeTab"]), Component: stringValue(in["component"]), Parameters: string(parameters)}
		if err := tx.Save(&setting).Error; err != nil {
			return err
		}
		if rawButtons, ok := in["menuBtn"].([]any); ok {
			keep := []uint64{}
			names := map[string]bool{}
			for _, raw := range rawButtons {
				b, ok := raw.(map[string]any)
				if !ok {
					return httpx.NewError(400, "VALIDATION_ERROR", "按钮参数格式错误")
				}
				bname := stringValue(b["name"])
				if bname == "" || names[bname] {
					return httpx.NewError(400, "VALIDATION_ERROR", "按钮标识不能为空或重复")
				}
				names[bname] = true
				button := database.IAMMenuButton{TenantID: id.TenantID, MenuID: saved.ID, Name: bname, Description: stringValue(b["desc"])}
				if bid := number(b["ID"]); bid > 0 {
					if tx.Where("tenant_id=? AND menu_id=? AND id=?", id.TenantID, saved.ID, bid).First(&button).Error != nil {
						return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "按钮不属于当前菜单")
					}
					button.Name, button.Description = bname, stringValue(b["desc"])
				}
				if err := tx.Save(&button).Error; err != nil {
					return err
				}
				keep = append(keep, button.ID)
			}
			q := tx.Where("tenant_id=? AND menu_id=?", id.TenantID, saved.ID)
			if len(keep) > 0 {
				q = q.Where("id NOT IN ?", keep)
			}
			var removed []database.IAMMenuButton
			if err := q.Find(&removed).Error; err != nil {
				return err
			}
			for _, b := range removed {
				if err := tx.Where("tenant_id=? AND button_id=?", id.TenantID, b.ID).Delete(&database.IAMRoleButton{}).Error; err != nil {
					return err
				}
			}
			if err := q.Delete(&database.IAMMenuButton{}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"menu": s.iamMenuView(s.DB.WithContext(c.Request().Context()), saved)})
}

func (s *Service) legacyMenuDetail(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	var m database.Menu
	db := s.DB.WithContext(c.Request().Context())
	if db.Where("tenant_id=? AND id=?", id.TenantID, number(first(in, "ID", "id"))).First(&m).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "菜单不存在")
	}
	return legacyOK(c, map[string]any{"menu": s.iamMenuView(db, m)})
}

func (s *Service) legacyMenuDelete(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	mid := number(first(in, "ID", "id"))
	err = s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		var m database.Menu
		if tx.Where("tenant_id=? AND id=?", id.TenantID, mid).First(&m).Error != nil {
			return httpx.NewError(404, "NOT_FOUND", "菜单不存在")
		}
		var n int64
		tx.Model(&database.Menu{}).Where("tenant_id=? AND parent_id=?", id.TenantID, mid).Count(&n)
		if n > 0 {
			return httpx.NewError(409, "MENU_HAS_CHILDREN", "请先删除子菜单")
		}
		var bs []database.IAMMenuButton
		tx.Where("tenant_id=? AND menu_id=?", id.TenantID, mid).Find(&bs)
		for _, b := range bs {
			if err := tx.Where("tenant_id=? AND button_id=?", id.TenantID, b.ID).Delete(&database.IAMRoleButton{}).Error; err != nil {
				return err
			}
		}
		for _, model := range []any{&database.RoleMenu{}, &database.IAMMenuSetting{}, &database.IAMMenuButton{}} {
			if err := tx.Where("tenant_id=? AND menu_id=?", id.TenantID, mid).Delete(model).Error; err != nil {
				return err
			}
		}
		return tx.Delete(&m).Error
	})
	if err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"deleted": true})
}

func (s *Service) legacyMenuRoles(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	mid := number(c.QueryParam("menuId"))
	var m database.Menu
	if s.DB.Where("tenant_id=? AND id=?", id.TenantID, mid).First(&m).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "菜单不存在")
	}
	var result []uint64
	s.DB.Model(&database.RoleMenu{}).Where("tenant_id=? AND menu_id=?", id.TenantID, mid).Pluck("role_id", &result)
	if result == nil {
		result = []uint64{}
	}
	return legacyOK(c, result)
}

func (s *Service) legacySetMenuRoles(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	mid := number(in["menuId"])
	roles := unique(ids(first(in, "authorityIds", "roleIds")))
	err = s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		var n int64
		tx.Model(&database.Menu{}).Where("tenant_id=? AND id=?", id.TenantID, mid).Count(&n)
		if n != 1 {
			return httpx.NewError(404, "NOT_FOUND", "菜单不存在")
		}
		if len(roles) > 0 {
			tx.Model(&database.Role{}).Where("tenant_id=? AND id IN ?", id.TenantID, roles).Count(&n)
			if n != int64(len(roles)) {
				return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "角色不属于当前租户")
			}
		}
		if err := tx.Where("tenant_id=? AND menu_id=?", id.TenantID, mid).Delete(&database.RoleMenu{}).Error; err != nil {
			return err
		}
		for _, rid := range roles {
			if err := tx.Create(&database.RoleMenu{TenantID: id.TenantID, RoleID: rid, MenuID: mid}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}

func (s *Service) legacyMenuAuthority(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	rid := number(in["authorityId"])
	db := s.DB.WithContext(c.Request().Context())
	var role database.Role
	if db.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&role).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	if strings.HasSuffix(c.Path(), "/addMenuAuthority") {
		selected := []uint64{}
		var walk func([]any)
		walk = func(nodes []any) {
			for _, raw := range nodes {
				if m, ok := raw.(map[string]any); ok {
					selected = append(selected, number(first(m, "ID", "id")))
					if children, ok := m["children"].([]any); ok {
						walk(children)
					}
				}
			}
		}
		raw, _ := in["menus"].([]any)
		walk(raw)
		selected = unique(selected)
		err = db.Transaction(func(tx *gorm.DB) error {
			var n int64
			if len(selected) > 0 {
				tx.Model(&database.Menu{}).Where("tenant_id=? AND id IN ?", id.TenantID, selected).Count(&n)
				if n != int64(len(selected)) {
					return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "菜单不属于当前租户")
				}
			}
			if err := tx.Where("tenant_id=? AND role_id=?", id.TenantID, rid).Delete(&database.RoleMenu{}).Error; err != nil {
				return err
			}
			for _, mid := range selected {
				if err := tx.Create(&database.RoleMenu{TenantID: id.TenantID, RoleID: rid, MenuID: mid}).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	var rows []database.Menu
	db.Table("menus m").Joins("JOIN role_menus rm ON rm.menu_id=m.id AND rm.tenant_id=m.tenant_id").Where("rm.tenant_id=? AND rm.role_id=?", id.TenantID, rid).Order("m.sort,m.id").Find(&rows)
	items := make([]map[string]any, 0, len(rows))
	for _, m := range rows {
		items = append(items, s.iamMenuView(db, m))
	}
	return legacyOK(c, map[string]any{"menus": items})
}

func (s *Service) legacyAuthorityButtons(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	db := s.DB.WithContext(c.Request().Context())
	if strings.HasSuffix(c.Path(), "/canRemoveAuthorityBtn") {
		bid := number(c.QueryParam("id"))
		var b database.IAMMenuButton
		if db.Where("tenant_id=? AND id=?", id.TenantID, bid).First(&b).Error != nil {
			return httpx.NewError(404, "NOT_FOUND", "按钮不存在")
		}
		var n int64
		db.Model(&database.IAMRoleButton{}).Where("tenant_id=? AND button_id=?", id.TenantID, bid).Count(&n)
		if n > 0 {
			return httpx.NewError(409, "BUTTON_IN_USE", "按钮已分配给角色，请先取消授权")
		}
		return legacyOK(c, map[string]any{"removable": true})
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	rid, mid := number(in["authorityId"]), number(in["menuID"])
	var role database.Role
	var menu database.Menu
	if db.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&role).Error != nil || db.Where("tenant_id=? AND id=?", id.TenantID, mid).First(&menu).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色或菜单不存在")
	}
	if strings.HasSuffix(c.Path(), "/setAuthorityBtn") {
		chosen := unique(ids(in["selected"]))
		err = db.Transaction(func(tx *gorm.DB) error {
			var buttons []database.IAMMenuButton
			tx.Where("tenant_id=? AND menu_id=?", id.TenantID, mid).Find(&buttons)
			all := []uint64{}
			valid := map[uint64]bool{}
			for _, b := range buttons {
				all = append(all, b.ID)
				valid[b.ID] = true
			}
			for _, b := range chosen {
				if !valid[b] {
					return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "按钮不属于当前菜单")
				}
			}
			if len(all) > 0 {
				if err := tx.Where("tenant_id=? AND role_id=? AND button_id IN ?", id.TenantID, rid, all).Delete(&database.IAMRoleButton{}).Error; err != nil {
					return err
				}
			}
			for _, b := range chosen {
				if err := tx.Create(&database.IAMRoleButton{TenantID: id.TenantID, RoleID: rid, ButtonID: b}).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	var selected []uint64
	db.Table("iam_role_buttons rb").Joins("JOIN iam_menu_buttons b ON b.id=rb.button_id AND b.tenant_id=rb.tenant_id").Where("rb.tenant_id=? AND rb.role_id=? AND b.menu_id=?", id.TenantID, rid, mid).Pluck("rb.button_id", &selected)
	if selected == nil {
		selected = []uint64{}
	}
	return legacyOK(c, map[string]any{"selected": selected})
}

func (s *Service) legacyAuthorityData(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "数据范围参数格式错误")
	}
	rid := number(first(in, "authorityId", "ID", "id"))
	var role database.Role
	if s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&role).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	raw, _ := in["dataAuthorityId"].([]any)
	idsToSave := []uint64{}
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			if n := number(first(m, "authorityId", "ID", "id")); n > 0 {
				idsToSave = append(idsToSave, n)
			}
		} else if n := number(item); n > 0 {
			idsToSave = append(idsToSave, n)
		}
	}
	idsToSave = unique(idsToSave)
	if len(idsToSave) > 0 {
		var count int64
		s.DB.Model(&database.Role{}).Where("tenant_id=? AND id IN ?", id.TenantID, idsToSave).Count(&count)
		if count != int64(len(idsToSave)) {
			return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "数据范围角色不属于当前租户")
		}
	}
	encoded, _ := json.Marshal(idsToSave)
	var setting database.IAMRoleSetting
	if s.DB.Where("tenant_id=? AND role_id=?", id.TenantID, rid).First(&setting).Error != nil {
		setting = database.IAMRoleSetting{TenantID: id.TenantID, RoleID: rid}
	}
	setting.DataAuthorityIDs = string(encoded)
	if scope := stringValue(in["dataScope"]); scope != "" {
		setting.DataScope = scope
	}
	if err := s.DB.Save(&setting).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}

// legacyDataScope backs the reference data-scope editor and stores the policy
// in the tenant-local role settings table. The same setting is consumed by
// ListUsers so the UI choice changes server-side results rather than only
// hiding rows in the browser.
func (s *Service) legacyDataScope(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	rid := number(c.QueryParam("authorityId"))
	var in map[string]any
	if c.Request().Method != http.MethodGet {
		if err := c.Bind(&in); err != nil {
			return httpx.NewError(400, "VALIDATION_ERROR", "数据范围参数格式错误")
		}
		if rid == 0 {
			rid = number(first(in, "authorityId", "ID", "id"))
		}
	}
	var role database.Role
	if s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&role).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	var setting database.IAMRoleSetting
	configured := s.DB.Where("tenant_id=? AND role_id=?", id.TenantID, rid).First(&setting).Error == nil
	mode := setting.DataScope
	if mode == "" {
		mode = "all"
	}
	departmentIDs := []uint64{}
	if setting.DataAuthorityIDs != "" {
		_ = json.Unmarshal([]byte(setting.DataAuthorityIDs), &departmentIDs)
	}
	if c.Request().Method == http.MethodPut {
		mode = stringValue(in["mode"])
		if mode == "" {
			mode = stringValue(in["dataScope"])
		}
		validModes := map[string]bool{"all": true, "department": true, "departmentTree": true, "self": true, "custom": true}
		if !validModes[mode] {
			return httpx.NewError(400, "VALIDATION_ERROR", "数据范围模式无效")
		}
		departmentIDs = unique(ids(first(in, "departmentIds", "departmentIDs", "dataAuthorityId")))
		if mode == "custom" && len(departmentIDs) == 0 {
			return httpx.NewError(400, "VALIDATION_ERROR", "自定义数据范围至少选择一个部门")
		}
		if len(departmentIDs) > 0 {
			var count int64
			s.DB.Model(&database.Department{}).Where("tenant_id=? AND id IN ?", id.TenantID, departmentIDs).Count(&count)
			if count != int64(len(departmentIDs)) {
				return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "部门不属于当前租户")
			}
		}
		encoded, _ := json.Marshal(departmentIDs)
		setting.TenantID, setting.RoleID, setting.DataScope, setting.DataAuthorityIDs = id.TenantID, rid, mode, string(encoded)
		if err := s.DB.Save(&setting).Error; err != nil {
			return err
		}
	}
	departments := s.dataScopeDepartments(c, id.TenantID)
	return legacyOK(c, map[string]any{"authorityId": rid, "mode": mode, "departmentIds": departmentIDs, "version": 1, "configured": configured, "canWrite": true, "departments": departments})
}

func (s *Service) dataScopeDepartments(c *echo.Context, tenantID uint64) []map[string]any {
	var rows []database.Department
	s.DB.WithContext(c.Request().Context()).Where("tenant_id=?", tenantID).Order("sort asc,id asc").Find(&rows)
	byParent := map[uint64][]map[string]any{}
	for _, row := range rows {
		parent := uint64(0)
		if row.ParentID != nil {
			parent = *row.ParentID
		}
		byParent[parent] = append(byParent[parent], map[string]any{"id": row.ID, "parentId": row.ParentID, "name": row.Name, "status": row.Status == "active", "disabled": row.Status != "active", "children": []any{}})
	}
	var walk func(uint64) []map[string]any
	walk = func(parent uint64) []map[string]any {
		items := byParent[parent]
		for _, item := range items {
			item["children"] = walk(parseUintValue(item["id"]))
		}
		return items
	}
	return walk(0)
}

func (s *Service) legacyCasbinGet(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	rid := number(in["authorityId"])
	var role database.Role
	if s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&role).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	var resources []database.APIResource
	s.DB.Table("api_resources ar").Joins("JOIN iam_role_apis ra ON ra.api_resource_id=ar.id AND ra.tenant_id=?", id.TenantID).Where("ra.tenant_id=? AND ra.role_id=?", id.TenantID, rid).Order("ar.id asc").Find(&resources)
	paths := make([]map[string]any, 0, len(resources))
	for _, r := range resources {
		paths = append(paths, map[string]any{"path": r.Path, "method": r.Method})
	}
	return legacyOK(c, map[string]any{"paths": paths})
}

func (s *Service) legacyCasbinUpdate(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	rid := number(in["authorityId"])
	var role database.Role
	if s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&role).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	items, _ := in["casbinInfos"].([]any)
	return s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id=? AND role_id=?", id.TenantID, rid).Delete(&database.IAMRoleAPI{}).Error; err != nil {
			return err
		}
		for _, raw := range items {
			m, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			path, method := stringValue(m["path"]), strings.ToUpper(stringValue(m["method"]))
			if path == "" || method == "" {
				continue
			}
			var resource database.APIResource
			if tx.Where("path=? AND method=?", path, method).First(&resource).Error != nil {
				return httpx.NewError(400, "API_NOT_REGISTERED", "API资源尚未注册")
			}
			if err := tx.Create(&database.IAMRoleAPI{TenantID: id.TenantID, RoleID: rid, APIResourceID: resource.ID}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
