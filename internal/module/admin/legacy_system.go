package admin

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"gorm.io/gorm"
)

// RegisterLegacySystemRoutes registers the compatibility API used by the reference frontend.
// Every handler scopes reads and writes to the authenticated tenant.
func RegisterLegacySystemRoutes(g *echo.Group, s *Service) {
	p := func(permission string) []echo.MiddlewareFunc {
		return []echo.MiddlewareFunc{s.RequirePermission(permission)}
	}
	g.GET("/sysDictionary/getSysDictionaryList", s.legacyDictionaryList, p("dictionary:list")...)
	g.POST("/sysDictionary/createSysDictionary", s.legacyDictionaryMutation, p("dictionary:create")...)
	g.PUT("/sysDictionary/updateSysDictionary", s.legacyDictionaryMutation, p("dictionary:update")...)
	g.GET("/sysDictionary/findSysDictionary", s.legacyDictionaryFind, p("dictionary:list")...)
	g.DELETE("/sysDictionary/deleteSysDictionary", s.legacyDictionaryDelete, p("dictionary:delete")...)
	g.GET("/sysDictionary/exportSysDictionary", s.legacyDictionaryExport, p("dictionary:list")...)
	g.POST("/sysDictionary/importSysDictionary", s.legacyDictionaryImport, p("dictionary:create")...)
	g.GET("/sysDictionaryDetail/getDictionaryTreeList", s.legacyDictionaryTree, p("dictionary:list")...)
	g.GET("/sysDictionaryDetail/getDictionaryTreeListByType", s.legacyDictionaryTreeByType, p("dictionary:list")...)
	g.GET("/sysDictionaryDetail/getSysDictionaryDetailList", s.legacyDictionaryDetailList, p("dictionary:list")...)
	g.GET("/sysDictionaryDetail/findSysDictionaryDetail", s.legacyDictionaryDetailFind, p("dictionary:list")...)
	g.GET("/sysDictionaryDetail/getDictionaryDetailsByParent", s.legacyDictionaryDetailsByParent, p("dictionary:list")...)
	g.GET("/sysDictionaryDetail/getDictionaryPath", s.legacyDictionaryPath, p("dictionary:list")...)
	g.POST("/sysDictionaryDetail/createSysDictionaryDetail", s.legacyDictionaryItemMutation, p("dictionary:create")...)
	g.PUT("/sysDictionaryDetail/updateSysDictionaryDetail", s.legacyDictionaryItemMutation, p("dictionary:update")...)
	g.DELETE("/sysDictionaryDetail/deleteSysDictionaryDetail", s.legacyDictionaryItemDelete, p("dictionary:delete")...)

	g.GET("/sysParams/getSysParamsList", s.legacyParamsList, p("param:list")...)
	g.POST("/sysParams/createSysParams", s.legacyParamsMutation, p("param:create")...)
	g.PUT("/sysParams/updateSysParams", s.legacyParamsMutation, p("param:update")...)
	g.GET("/sysParams/findSysParams", s.legacyParamsFind, p("param:list")...)
	g.GET("/sysParams/getSysParam", s.legacyParamValue, p("param:list")...)
	g.DELETE("/sysParams/deleteSysParams", s.legacyParamsDelete, p("param:delete")...)
	g.DELETE("/sysParams/deleteSysParamsByIds", s.legacyParamsDelete, p("param:delete")...)

	g.POST("/sysLoginLog/getLoginLogList", s.legacyLoginLogList, p("audit:list")...)
	g.GET("/sysLoginLog/findLoginLog", s.legacyLoginLogFind, p("audit:list")...)
	g.DELETE("/sysLoginLog/deleteLoginLog", s.legacyLoginLogDelete, p("audit:delete")...)
	g.DELETE("/sysLoginLog/deleteLoginLogByIds", s.legacyLoginLogDelete, p("audit:delete")...)
	g.POST("/sysOperationRecord/getSysOperationRecordList", s.legacyAuditLogList, p("audit:list")...)
	g.GET("/sysOperationRecord/findSysOperationRecord", s.legacyAuditLogFind, p("audit:list")...)
	g.DELETE("/sysOperationRecord/deleteSysOperationRecord", s.legacyAuditLogDelete, p("audit:delete")...)
	g.DELETE("/sysOperationRecord/deleteSysOperationRecordByIds", s.legacyAuditLogDelete, p("audit:delete")...)
}

func systemIdentity(c *echo.Context) (tenantID uint64, err error) {
	id, err := identityFrom(c)
	if err != nil {
		return 0, err
	}
	if id.TenantID == 0 {
		return 0, httpx.NewError(http.StatusBadRequest, "TENANT_REQUIRED", "当前会话未选择租户")
	}
	return id.TenantID, nil
}
func parseUintValue(v any) uint64 {
	n, _ := strconv.ParseUint(strings.TrimSpace(fmt.Sprint(v)), 10, 64)
	return n
}
func boolStatus(v any) string {
	if b, ok := v.(bool); ok && !b {
		return "disabled"
	}
	if strings.EqualFold(fmt.Sprint(v), "false") || fmt.Sprint(v) == "0" {
		return "disabled"
	}
	return "active"
}
func boolEnabled(v string) bool {
	return strings.EqualFold(v, "active") || strings.EqualFold(v, "enabled") || v == "1" || v == "true"
}

func (s *Service) legacyDictionaryList(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	var total int64
	var rows []database.Dictionary
	q := s.DB.WithContext(c.Request().Context()).Model(&database.Dictionary{}).Where("tenant_id = ?", tid)
	if search := strings.TrimSpace(c.QueryParam("name")); search != "" {
		q = q.Where("name LIKE ? OR type LIKE ?", "%"+search+"%", "%"+search+"%")
	}
	q.Count(&total)
	if e := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; e != nil {
		return e
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, dictionaryView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "page": page, "pageSize": size, "total": total})
}
func (s *Service) legacyDictionaryMutation(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		ID                      uint64 `json:"ID"`
		Name, Type, Description string
		Status                  any
		ParentID                *uint64 `json:"parentID"`
	}
	if e := c.Bind(&in); e != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "字典参数格式错误")
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Type = strings.TrimSpace(in.Type)
	if in.Name == "" || in.Type == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "字典名称和类型不能为空")
	}
	db := s.DB.WithContext(c.Request().Context())
	if in.ParentID != nil && *in.ParentID > 0 {
		var p database.Dictionary
		if db.Where("id=? AND tenant_id=?", *in.ParentID, tid).First(&p).Error != nil {
			return httpx.NewError(400, "INVALID_PARENT", "上级字典不存在")
		}
		if in.ID > 0 && (in.ID == *in.ParentID || dictionaryParentCycle(db, tid, *in.ParentID, in.ID)) {
			return httpx.NewError(400, "INVALID_PARENT", "字典层级不能形成循环")
		}
	}
	var row database.Dictionary
	e := db.Transaction(func(tx *gorm.DB) error {
		if in.ID > 0 {
			if tx.Where("id=? AND tenant_id=?", in.ID, tid).First(&row).Error != nil {
				return gorm.ErrRecordNotFound
			}
			row.Name = in.Name
			row.Type = in.Type
			row.Description = strings.TrimSpace(in.Description)
			row.Status = boolStatus(in.Status)
			row.ParentID = in.ParentID
			return tx.Save(&row).Error
		}
		row = database.Dictionary{TenantID: tid, Name: in.Name, Type: in.Type, Description: strings.TrimSpace(in.Description), Status: boolStatus(in.Status), ParentID: in.ParentID}
		return tx.Create(&row).Error
	})
	if errors.Is(e, gorm.ErrRecordNotFound) {
		return httpx.NewError(404, "NOT_FOUND", "字典不存在")
	}
	if e != nil {
		return httpx.NewError(409, "DICTIONARY_EXISTS", "字典类型已存在")
	}
	return legacyOK(c, dictionaryView(row))
}
func dictionaryParentCycle(db *gorm.DB, tenantID, parentID, childID uint64) bool {
	seen := map[uint64]bool{}
	for parentID > 0 && !seen[parentID] {
		seen[parentID] = true
		if parentID == childID {
			return true
		}
		var row database.Dictionary
		if db.Select("parent_id").Where("id=? AND tenant_id=?", parentID, tenantID).First(&row).Error != nil || row.ParentID == nil {
			break
		}
		parentID = *row.ParentID
	}
	return false
}
func itemParentCycle(db *gorm.DB, tenantID, dictionaryID, parentID, childID uint64) bool {
	seen := map[uint64]bool{}
	for parentID > 0 && !seen[parentID] {
		seen[parentID] = true
		if parentID == childID {
			return true
		}
		var row database.DictionaryItem
		if db.Select("parent_id").Where("id=? AND tenant_id=? AND dictionary_id=?", parentID, tenantID, dictionaryID).First(&row).Error != nil || row.ParentID == nil {
			break
		}
		parentID = *row.ParentID
	}
	return false
}

func (s *Service) legacyDictionaryFind(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("id"))
	var row database.Dictionary
	if id == 0 || s.DB.WithContext(c.Request().Context()).Where("id=? AND tenant_id=?", id, tid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "字典不存在")
	}
	return legacyOK(c, map[string]any{"resysDictionary": dictionaryView(row)})
}
func (s *Service) legacyDictionaryDelete(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		ID uint64 `json:"ID"`
	}
	_ = c.Bind(&in)
	if in.ID == 0 {
		in.ID = parseUintValue(c.QueryParam("id"))
	}
	if in.ID == 0 {
		return httpx.NewError(400, "VALIDATION_ERROR", "缺少字典 ID")
	}
	e := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		var d database.Dictionary
		if tx.Where("id=? AND tenant_id=?", in.ID, tid).First(&d).Error != nil {
			return gorm.ErrRecordNotFound
		}
		if e := tx.Where("tenant_id=? AND dictionary_id=?", tid, in.ID).Delete(&database.DictionaryItem{}).Error; e != nil {
			return e
		}
		return tx.Delete(&d).Error
	})
	if errors.Is(e, gorm.ErrRecordNotFound) {
		return httpx.NewError(404, "NOT_FOUND", "字典不存在")
	}
	if e != nil {
		return e
	}
	return legacyOK(c, map[string]any{"deleted": true})
}
func dictionaryView(r database.Dictionary) map[string]any {
	return map[string]any{"ID": r.ID, "name": r.Name, "type": r.Type, "status": boolEnabled(r.Status), "description": r.Description, "parentID": r.ParentID, "children": []any{}, "sysDictionaryDetails": []any{}, "CreatedAt": r.CreatedAt, "UpdatedAt": r.UpdatedAt}
}

func (s *Service) legacyDictionaryExport(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("id"))
	var d database.Dictionary
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&d).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "字典不存在")
	}
	var items []database.DictionaryItem
	s.DB.Where("tenant_id=? AND dictionary_id=?", tid, id).Order("sort asc,id asc").Find(&items)
	out := dictionaryView(d)
	details := make([]map[string]any, 0, len(items))
	for _, i := range items {
		details = append(details, itemView(i))
	}
	out["sysDictionaryDetails"] = details
	return legacyOK(c, out)
}
func (s *Service) legacyDictionaryImport(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		JSON                 string `json:"json"`
		Type                 string `json:"type"`
		Name                 string `json:"name"`
		Description          string `json:"description"`
		Status               any    `json:"status"`
		SysDictionaryDetails []struct {
			Label, Value, Extend string
			Sort                 int
			Status               any
			ParentID             *uint64 `json:"parentID"`
		} `json:"sysDictionaryDetails"`
	}
	if e := c.Bind(&in); e != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "字典 JSON 格式错误")
	}
	if strings.TrimSpace(in.JSON) != "" {
		if e := json.Unmarshal([]byte(in.JSON), &in); e != nil {
			return httpx.NewError(400, "VALIDATION_ERROR", "字典 JSON 格式错误")
		}
	}
	in.Type = strings.TrimSpace(in.Type)
	if in.Type == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "字典类型不能为空")
	}
	db := s.DB.WithContext(c.Request().Context())
	var d database.Dictionary
	e := db.Transaction(func(tx *gorm.DB) error {
		if tx.Where("tenant_id=? AND type=?", tid, in.Type).First(&d).Error != nil {
			d = database.Dictionary{TenantID: tid, Type: in.Type, Name: strings.TrimSpace(in.Name), Description: in.Description, Status: boolStatus(in.Status)}
			if d.Name == "" {
				d.Name = d.Type
			}
			if e := tx.Create(&d).Error; e != nil {
				return e
			}
		} else {
			d.Name = strings.TrimSpace(in.Name)
			if d.Name == "" {
				d.Name = d.Type
			}
			d.Description = in.Description
			d.Status = boolStatus(in.Status)
			if e := tx.Save(&d).Error; e != nil {
				return e
			}
		}
		if e := tx.Where("tenant_id=? AND dictionary_id=?", tid, d.ID).Delete(&database.DictionaryItem{}).Error; e != nil {
			return e
		}
		for _, v := range in.SysDictionaryDetails {
			if strings.TrimSpace(v.Label) == "" || strings.TrimSpace(v.Value) == "" {
				continue
			}
			if e := tx.Create(&database.DictionaryItem{TenantID: tid, DictionaryID: d.ID, Label: strings.TrimSpace(v.Label), Value: strings.TrimSpace(v.Value), Extend: v.Extend, Sort: v.Sort, Status: boolStatus(v.Status), ParentID: v.ParentID}).Error; e != nil {
				return e
			}
		}
		return nil
	})
	if e != nil {
		return httpx.NewError(409, "DICTIONARY_IMPORT_FAILED", "字典导入失败")
	}
	return legacyOK(c, dictionaryView(d))
}

func (s *Service) legacyDictionaryTree(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("sysDictionaryID"))
	if id == 0 {
		id = parseUintValue(c.Get("_dictionary_id"))
	}
	if id == 0 {
		return httpx.NewError(400, "VALIDATION_ERROR", "缺少字典 ID")
	}
	var d database.Dictionary
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&d).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "字典不存在")
	}
	var rows []database.DictionaryItem
	s.DB.Where("tenant_id=? AND dictionary_id=?", tid, id).Order("sort asc,id asc").Find(&rows)
	return legacyOK(c, map[string]any{"list": buildItemTree(rows)})
}
func (s *Service) legacyDictionaryTreeByType(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var d database.Dictionary
	if s.DB.Where("tenant_id=? AND type=?", tid, strings.TrimSpace(c.QueryParam("type"))).First(&d).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "字典不存在")
	}
	c.Set("_dictionary_id", d.ID)
	return s.legacyDictionaryTree(c)
}
func buildItemTree(rows []database.DictionaryItem) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	byParent := map[uint64][]map[string]any{}
	for _, r := range rows {
		p := uint64(0)
		if r.ParentID != nil {
			p = *r.ParentID
		}
		byParent[p] = append(byParent[p], itemView(r))
	}
	var walk func(uint64) []map[string]any
	walk = func(p uint64) []map[string]any {
		a := byParent[p]
		for _, v := range a {
			id := parseUintValue(v["ID"])
			v["children"] = walk(id)
		}
		return a
	}
	out = walk(0)
	return out
}
func itemView(r database.DictionaryItem) map[string]any {
	return map[string]any{"ID": r.ID, "label": r.Label, "value": r.Value, "extend": r.Extend, "status": boolEnabled(r.Status), "sort": r.Sort, "sysDictionaryID": r.DictionaryID, "parentID": r.ParentID, "children": []any{}, "CreatedAt": r.CreatedAt, "UpdatedAt": r.UpdatedAt}
}
func (s *Service) dictionaryForItem(c *echo.Context, id uint64) (uint64, error) {
	tid, err := systemIdentity(c)
	if err != nil {
		return 0, err
	}
	var d database.Dictionary
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&d).Error != nil {
		return 0, httpx.NewError(404, "NOT_FOUND", "字典不存在")
	}
	return tid, nil
}
func (s *Service) legacyDictionaryDetailList(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	did := parseUintValue(c.QueryParam("sysDictionaryID"))
	if _, err = s.dictionaryForItem(c, did); err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	var total int64
	var rows []database.DictionaryItem
	q := s.DB.Where("tenant_id=? AND dictionary_id=?", tid, did)
	q.Count(&total)
	q.Order("sort asc,id asc").Offset((page - 1) * size).Limit(size).Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, itemView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "page": page, "pageSize": size, "total": total})
}
func (s *Service) legacyDictionaryDetailFind(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("id"))
	var r database.DictionaryItem
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&r).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "字典项不存在")
	}
	return legacyOK(c, map[string]any{"resysDictionaryDetail": itemView(r)})
}
func (s *Service) legacyDictionaryDetailsByParent(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	did := parseUintValue(c.QueryParam("sysDictionaryID"))
	if _, err = s.dictionaryForItem(c, did); err != nil {
		return err
	}
	q := s.DB.Where("tenant_id=? AND dictionary_id=?", tid, did)
	if p := parseUintValue(c.QueryParam("parentID")); p > 0 {
		q = q.Where("parent_id=?", p)
	} else if c.QueryParam("parentID") != "" {
		q = q.Where("parent_id IS NULL")
	}
	var rows []database.DictionaryItem
	q.Order("sort asc,id asc").Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, itemView(r))
	}
	return legacyOK(c, map[string]any{"list": out})
}
func (s *Service) legacyDictionaryPath(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("id"))
	var cur database.DictionaryItem
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&cur).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "字典项不存在")
	}
	path := []map[string]any{}
	seen := map[uint64]bool{}
	for cur.ID > 0 && !seen[cur.ID] {
		seen[cur.ID] = true
		path = append([]map[string]any{itemView(cur)}, path...)
		if cur.ParentID == nil {
			break
		}
		if s.DB.Where("id=? AND tenant_id=? AND dictionary_id=?", *cur.ParentID, tid, cur.DictionaryID).First(&cur).Error != nil {
			break
		}
	}
	return legacyOK(c, map[string]any{"path": path})
}
func (s *Service) legacyDictionaryItemMutation(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		ID                   uint64 `json:"ID"`
		SysDictionaryID      uint64 `json:"sysDictionaryID"`
		Label, Value, Extend string
		Sort                 int
		Status               any
		ParentID             *uint64 `json:"parentID"`
	}
	if e := c.Bind(&in); e != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "字典项参数格式错误")
	}
	in.Label = strings.TrimSpace(in.Label)
	in.Value = strings.TrimSpace(in.Value)
	if in.SysDictionaryID == 0 || in.Label == "" || in.Value == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "字典项所属字典、标签和值不能为空")
	}
	if _, err = s.dictionaryForItem(c, in.SysDictionaryID); err != nil {
		return err
	}
	if in.ParentID != nil && *in.ParentID > 0 {
		var p database.DictionaryItem
		if s.DB.Where("id=? AND tenant_id=? AND dictionary_id=?", *in.ParentID, tid, in.SysDictionaryID).First(&p).Error != nil {
			return httpx.NewError(400, "INVALID_PARENT", "上级字典项不存在")
		}
		if in.ID > 0 && (in.ID == *in.ParentID || itemParentCycle(s.DB.DB, tid, in.SysDictionaryID, *in.ParentID, in.ID)) {
			return httpx.NewError(400, "INVALID_PARENT", "字典项层级不能形成循环")
		}
	}
	db := s.DB.WithContext(c.Request().Context())
	var row database.DictionaryItem
	if in.ID > 0 {
		if db.Where("id=? AND tenant_id=?", in.ID, tid).First(&row).Error != nil {
			return httpx.NewError(404, "NOT_FOUND", "字典项不存在")
		}
		row.DictionaryID = in.SysDictionaryID
		row.Label = in.Label
		row.Value = in.Value
		row.Extend = in.Extend
		row.Sort = in.Sort
		row.Status = boolStatus(in.Status)
		row.ParentID = in.ParentID
		if e := db.Save(&row).Error; e != nil {
			return httpx.NewError(409, "DICTIONARY_ITEM_EXISTS", "字典值已存在")
		}
	} else {
		row = database.DictionaryItem{TenantID: tid, DictionaryID: in.SysDictionaryID, Label: in.Label, Value: in.Value, Extend: in.Extend, Sort: in.Sort, Status: boolStatus(in.Status), ParentID: in.ParentID}
		if e := db.Create(&row).Error; e != nil {
			return httpx.NewError(409, "DICTIONARY_ITEM_EXISTS", "字典值已存在")
		}
	}
	return legacyOK(c, itemView(row))
}
func (s *Service) legacyDictionaryItemDelete(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		ID uint64 `json:"ID"`
	}
	_ = c.Bind(&in)
	if in.ID == 0 {
		in.ID = parseUintValue(c.QueryParam("id"))
	}
	var row database.DictionaryItem
	if s.DB.Where("id=? AND tenant_id=?", in.ID, tid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "字典项不存在")
	}
	var child int64
	s.DB.Model(&database.DictionaryItem{}).Where("tenant_id=? AND parent_id=?", tid, in.ID).Count(&child)
	if child > 0 {
		return httpx.NewError(409, "HAS_CHILDREN", "请先删除下级字典项")
	}
	s.DB.Delete(&row)
	return legacyOK(c, map[string]any{"deleted": true})
}

func (s *Service) legacyParamsList(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	var total int64
	var rows []database.SystemParam
	q := s.DB.WithContext(c.Request().Context()).Model(&database.SystemParam{}).Where("tenant_id = ?", tid)
	if search := strings.TrimSpace(c.QueryParam("name")); search != "" {
		q = q.Where("name LIKE ? OR `key` LIKE ?", "%"+search+"%", "%"+search+"%")
	}
	q.Count(&total)
	if e := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; e != nil {
		return e
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, paramView(r, false))
	}
	return legacyOK(c, map[string]any{"list": out, "page": page, "pageSize": size, "total": total})
}
func (s *Service) legacyParamsMutation(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		ID                                  uint64 `json:"ID"`
		Name, Key, Value, Desc, Description string
		Sensitive                           any
	}
	if e := c.Bind(&in); e != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "参数格式错误")
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Key = strings.TrimSpace(in.Key)
	if in.Name == "" || in.Key == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "参数名称和键名不能为空")
	}
	desc := strings.TrimSpace(in.Desc)
	if desc == "" {
		desc = strings.TrimSpace(in.Description)
	}
	sensitive := false
	if b, ok := in.Sensitive.(bool); ok {
		sensitive = b
	}
	db := s.DB.WithContext(c.Request().Context())
	var row database.SystemParam
	if in.ID > 0 {
		if db.Where("id=? AND tenant_id=?", in.ID, tid).First(&row).Error != nil {
			return httpx.NewError(404, "NOT_FOUND", "系统参数不存在")
		}
		row.Name = in.Name
		row.Key = in.Key
		if !(row.Sensitive && strings.TrimSpace(in.Value) == "******") {
			row.Value = in.Value
		}
		row.Description = desc
		row.Sensitive = sensitive
		if e := db.Save(&row).Error; e != nil {
			return httpx.NewError(409, "PARAM_EXISTS", "参数键名已存在")
		}
	} else {
		row = database.SystemParam{TenantID: tid, Name: in.Name, Key: in.Key, Value: in.Value, Description: desc, Sensitive: sensitive}
		if e := db.Create(&row).Error; e != nil {
			return httpx.NewError(409, "PARAM_EXISTS", "参数键名已存在")
		}
	}
	return legacyOK(c, paramView(row, false))
}
func (s *Service) legacyParamsFind(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("id"))
	var r database.SystemParam
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&r).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "系统参数不存在")
	}
	return legacyOK(c, map[string]any{"resysParams": paramView(r, false)})
}
func (s *Service) legacyParamValue(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	var r database.SystemParam
	if s.DB.Where("tenant_id=? AND `key`=?", tid, strings.TrimSpace(c.QueryParam("key"))).First(&r).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "系统参数不存在")
	}
	if r.Sensitive {
		return legacyOK(c, map[string]any{"value": "******"})
	}
	return legacyOK(c, map[string]any{"value": r.Value})
}
func (s *Service) legacyParamsDelete(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	ids := parseIDs(c, "ID", "ids", "IDs[]")
	if len(ids) == 0 {
		return httpx.NewError(400, "VALIDATION_ERROR", "缺少参数 ID")
	}
	res := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id IN ?", tid, ids).Delete(&database.SystemParam{})
	return legacyOK(c, map[string]any{"deleted": res.RowsAffected})
}
func paramView(r database.SystemParam, reveal bool) map[string]any {
	v := r.Value
	if r.Sensitive && !reveal {
		v = "******"
	}
	return map[string]any{"ID": r.ID, "name": r.Name, "key": r.Key, "value": v, "desc": r.Description, "sensitive": r.Sensitive, "CreatedAt": r.CreatedAt, "UpdatedAt": r.UpdatedAt}
}
func parseIDs(c *echo.Context, bodyKey string, queryKeys ...string) []uint64 {
	var in map[string]any
	_ = c.Bind(&in)
	set := map[uint64]bool{}
	add := func(v any) {
		switch x := v.(type) {
		case []any:
			for _, z := range x {
				if n := parseUintValue(z); n > 0 {
					set[n] = true
				}
			}
		case []uint64:
			for _, n := range x {
				if n > 0 {
					set[n] = true
				}
			}
		default:
			if n := parseUintValue(x); n > 0 {
				set[n] = true
			}
		}
	}
	if in != nil {
		if v, ok := in[bodyKey]; ok {
			add(v)
		}
		for _, k := range []string{"ids", "IDs", "IDs[]"} {
			if v, ok := in[k]; ok {
				add(v)
			}
		}
	}
	for _, k := range queryKeys {
		for _, v := range c.QueryParams()[k] {
			add(v)
		}
	}
	out := make([]uint64, 0, len(set))
	for n := range set {
		out = append(out, n)
	}
	return out
}

func (s *Service) legacyLoginLogList(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	var total int64
	var rows []database.TenantLoginLog
	q := s.DB.WithContext(c.Request().Context()).Model(&database.TenantLoginLog{}).Where("tenant_id = ?", tid)
	if u := strings.TrimSpace(c.QueryParam("username")); u != "" {
		q = q.Where("username LIKE ?", "%"+u+"%")
	}
	if status := strings.TrimSpace(c.QueryParam("status")); status != "" {
		q = q.Where("result = ?", status)
	}
	q.Count(&total)
	if e := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; e != nil {
		return e
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, loginLogView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "page": page, "pageSize": size, "total": total})
}
func loginLogView(r database.TenantLoginLog) map[string]any {
	return map[string]any{"ID": r.ID, "username": r.Username, "userId": r.UserID, "ip": r.IP, "status": r.Result, "errorMessage": r.FailureReason, "agent": r.Device, "requestId": r.RequestID, "traceId": r.TraceID, "CreatedAt": r.CreatedAt}
}
func (s *Service) legacyLoginLogFind(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("id"))
	var r database.TenantLoginLog
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&r).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "登录日志不存在")
	}
	return legacyOK(c, map[string]any{"reloginLog": loginLogView(r)})
}
func (s *Service) legacyLoginLogDelete(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	ids := parseIDs(c, "ID", "ids", "IDs[]")
	if len(ids) == 0 {
		return httpx.NewError(400, "VALIDATION_ERROR", "缺少日志 ID")
	}
	res := s.DB.Where("tenant_id=? AND id IN ?", tid, ids).Delete(&database.TenantLoginLog{})
	return legacyOK(c, map[string]any{"deleted": res.RowsAffected})
}

func (s *Service) legacyAuditLogList(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	var total int64
	var rows []database.AuditLog
	q := s.DB.WithContext(c.Request().Context()).Model(&database.AuditLog{}).Where("tenant_id = ?", tid)
	if path := strings.TrimSpace(c.QueryParam("path")); path != "" {
		q = q.Where("path LIKE ?", "%"+path+"%")
	}
	if method := strings.TrimSpace(c.QueryParam("method")); method != "" {
		q = q.Where("method = ?", method)
	}
	q.Count(&total)
	if e := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; e != nil {
		return e
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, auditLogView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "page": page, "pageSize": size, "total": total})
}
func auditLogView(r database.AuditLog) map[string]any {
	return map[string]any{"ID": r.ID, "requestId": r.RequestID, "traceId": r.TraceID, "ip": r.IP, "method": r.Method, "path": r.Path, "status": r.StatusCode, "latency": r.DurationMS * int64(1e6), "agent": r.Agent, "errorMessage": r.ErrorMessage, "body": r.Changes, "resp": "", "userID": r.UserID, "CreatedAt": r.CreatedAt, "resource": r.Resource, "action": r.Action, "result": r.Result}
}
func (s *Service) legacyAuditLogFind(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	id := parseUintValue(c.QueryParam("id"))
	var r database.AuditLog
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&r).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "操作日志不存在")
	}
	return legacyOK(c, map[string]any{"record": auditLogView(r)})
}
func (s *Service) legacyAuditLogDelete(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	ids := parseIDs(c, "ID", "ids", "IDs[]")
	if len(ids) == 0 {
		return httpx.NewError(400, "VALIDATION_ERROR", "缺少日志 ID")
	}
	res := s.DB.Where("tenant_id=? AND id IN ?", tid, ids).Delete(&database.AuditLog{})
	return legacyOK(c, map[string]any{"deleted": res.RowsAffected})
}
