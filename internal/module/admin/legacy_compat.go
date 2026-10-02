package admin

// Compatibility handlers for the remaining pages carried over from the
// original administration UI.  They deliberately use the same legacy
// envelope as the existing endpoints so old and new pages can coexist.

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
	"gorm.io/gorm"
)

var compatIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,119}$`)

// RegisterLegacyCompatibilityRoutes is intentionally kept separate from the
// resource handlers. It is mounted for both /foo and /api/foo in
// RegisterRoutes, matching the dev proxy and production nginx contracts.
func RegisterLegacyCompatibilityRoutes(g *echo.Group, s *Service) {
	// The system editor is restricted in the handler to a platform operator.
	g.POST("/system/getSystemConfig", s.compatSystemConfigGet)
	g.POST("/system/setSystemConfig", s.compatSystemConfigSave)
	g.POST("/system/reloadSystem", s.compatSystemReload)

	g.POST("/info/createInfo", s.compatInfoCreate)
	g.PUT("/info/updateInfo", s.compatInfoUpdate)
	g.DELETE("/info/deleteInfo", s.compatInfoDelete)
	g.DELETE("/info/deleteInfoByIds", s.compatInfoDelete)
	g.GET("/info/findInfo", s.compatInfoFind)
	g.GET("/info/getInfoList", s.compatInfoList)
	g.GET("/info/getInfoDataSource", s.compatInfoDataSource)

	g.POST("/email/emailTest", s.compatEmailTest)
	g.POST("/email/sendEmail", s.compatEmailSend)

	g.POST("/sysExportTemplate/createSysExportTemplate", s.compatExportTemplateSave)
	g.PUT("/sysExportTemplate/updateSysExportTemplate", s.compatExportTemplateSave)
	g.DELETE("/sysExportTemplate/deleteSysExportTemplate", s.compatExportTemplateDelete)
	g.DELETE("/sysExportTemplate/deleteSysExportTemplateByIds", s.compatExportTemplateDelete)
	g.GET("/sysExportTemplate/findSysExportTemplate", s.compatExportTemplateFind)
	g.GET("/sysExportTemplate/getSysExportTemplateList", s.compatExportTemplateList)
	g.GET("/sysExportTemplate/exportExcel", s.compatExportTemplateDownload)
	g.GET("/sysExportTemplate/exportTemplate", s.compatExportTemplateDownload)
	g.GET("/sysExportTemplate/previewSQL", s.compatExportTemplatePreview)
	g.POST("/sysExportTemplate/importExcel", s.compatExportTemplateImport)
	g.GET("/sysExportTemplate/exportExcelByToken", s.compatExportTemplateDownload)
	g.GET("/sysExportTemplate/exportTemplateByToken", s.compatExportTemplateDownload)
	g.GET("/sysExportTemplate/getBuilderCatalog", s.compatBuilderCatalog)
	g.POST("/sysExportTemplate/previewBuilder", s.compatBuilderPreview)

	g.POST("/sysVersion/exportVersion", s.compatVersionExport)
	g.POST("/sysVersion/importVersion", s.compatVersionImport)
	g.GET("/sysVersion/findSysVersion", s.compatVersionFind)
	g.GET("/sysVersion/getSysVersionList", s.compatVersionList)
	g.GET("/sysVersion/downloadVersionJson", s.compatVersionDownload)
	g.DELETE("/sysVersion/deleteSysVersion", s.compatVersionDelete)
	g.DELETE("/sysVersion/deleteSysVersionByIds", s.compatVersionDelete)

	// Auto-code extensions are optional in the safe generator, but returning a
	// stable result keeps the extension pages usable on installations that do
	// not enable a plugin workspace.
	g.POST("/autoCode/addFunc", s.compatNoop)
	g.GET("/autoCode/getTemplates", s.compatTemplates)
	g.POST("/autoCode/pubPlug", s.compatEmptyZip)
	g.POST("/autoCode/installPlugin", s.compatPluginInstall)
	g.POST("/autoCode/removePlugin", s.compatNoop)
	g.GET("/autoCode/getPluginList", s.compatPlugins)
	g.POST("/autoCode/llmAuto", s.compatNoopData)
	g.POST("/autoCode/llmAutoSSE", s.compatLLMSSE)
	g.POST("/autoCode/saveAIWorkflowSession", s.compatNoopData)
	g.POST("/autoCode/getAIWorkflowSessionList", s.compatEmptyPage)
	g.POST("/autoCode/getAIWorkflowSessionDetail", s.compatNoopData)
	g.POST("/autoCode/deleteAIWorkflowSession", s.compatNoop)
	g.POST("/autoCode/dumpAIWorkflowMarkdown", s.compatEmptyZip)

	// Skills are stored by the optional workspace service. In the base server
	// they use empty drafts and an empty catalog rather than returning 404.
	g.GET("/skills/getTools", s.compatSkillTools)
	g.POST("/skills/getSkillList", s.compatSkillList)
	g.POST("/skills/getSkillDetail", s.compatSkillDetail)
	g.POST("/skills/saveSkill", s.compatNoop)
	g.POST("/skills/deleteSkill", s.compatNoop)
	g.POST("/skills/createScript", s.compatSkillDraft)
	g.POST("/skills/getScript", s.compatSkillContent)
	g.POST("/skills/saveScript", s.compatNoop)
	g.POST("/skills/createResource", s.compatSkillDraft)
	g.POST("/skills/getResource", s.compatSkillContent)
	g.POST("/skills/saveResource", s.compatNoop)
	g.POST("/skills/createReference", s.compatSkillDraft)
	g.POST("/skills/getReference", s.compatSkillContent)
	g.POST("/skills/saveReference", s.compatNoop)
	g.POST("/skills/createTemplate", s.compatSkillDraft)
	g.POST("/skills/getTemplate", s.compatSkillContent)
	g.POST("/skills/saveTemplate", s.compatNoop)
	g.POST("/skills/getGlobalConstraint", s.compatGlobalConstraint)
	g.POST("/skills/saveGlobalConstraint", s.compatNoop)
	g.POST("/skills/packageSkill", s.compatEmptyZip)
	g.GET("/skills/downloadOnlineSkill", s.compatNoop)
}

func compatIdentity(c *echo.Context) (tenant.Identity, error) { return identityFrom(c) }

func compatPlatformIdentity(c *echo.Context) (tenant.Identity, error) {
	id, err := compatIdentity(c)
	if err != nil {
		return tenant.Identity{}, err
	}
	if !id.PlatformAdmin {
		return tenant.Identity{}, httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "仅平台管理员可以执行此操作")
	}
	return id, nil
}

// compatSystemConfigGet/Save intentionally store the editable text in a
// tenant-scoped parameter. The process configuration remains immutable until
// an operator restarts it with the deployment's environment.
func (s *Service) compatSystemConfigGet(c *echo.Context) error {
	if _, err := compatPlatformIdentity(c); err != nil {
		return err
	}
	id, _ := identityFrom(c)
	var row database.SystemParam
	if err := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND `key`=?", id.TenantID, "system.config").First(&row).Error; err != nil && err != gorm.ErrRecordNotFound {
		return err
	}
	return legacyOK(c, map[string]any{"config": row.Value})
}

func (s *Service) compatSystemConfigSave(c *echo.Context) error {
	id, err := compatPlatformIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		Config string `json:"config"`
	}
	if err := c.Bind(&in); err != nil || len(in.Config) > 128*1024 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "配置内容格式或大小无效")
	}
	var row database.SystemParam
	query := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND `key`=?", id.TenantID, "system.config").First(&row)
	if query.Error == gorm.ErrRecordNotFound {
		row = database.SystemParam{TenantID: id.TenantID, Name: "系统配置", Key: "system.config"}
	}
	row.Value = in.Config
	if err := s.DB.WithContext(c.Request().Context()).Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}

func (s *Service) compatSystemReload(c *echo.Context) error {
	if _, err := compatPlatformIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"reloaded": true})
}

func compatInfoView(row database.LegacyInfo) map[string]any {
	var attachments any = []any{}
	if strings.TrimSpace(row.Attachments) != "" {
		if json.Unmarshal([]byte(row.Attachments), &attachments) != nil {
			attachments = row.Attachments
		}
	}
	return map[string]any{"ID": row.ID, "id": row.ID, "CreatedAt": row.CreatedAt, "UpdatedAt": row.UpdatedAt, "title": row.Title, "content": row.Content, "userID": row.UserID, "attachments": attachments}
}

func (s *Service) compatInfoCreate(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in struct {
		Title, Content string
		UserID         uint64 `json:"userID"`
		Attachments    any    `json:"attachments"`
	}
	if err := c.Bind(&in); err != nil || strings.TrimSpace(in.Title) == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "公告标题不能为空")
	}
	if in.UserID == 0 {
		in.UserID = id.UserID
	}
	attachments, _ := json.Marshal(in.Attachments)
	row := database.LegacyInfo{TenantID: id.TenantID, UserID: in.UserID, Title: strings.TrimSpace(in.Title), Content: in.Content, Attachments: string(attachments)}
	if err := s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, compatInfoView(row))
}

func (s *Service) compatInfoUpdate(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "公告参数格式错误")
	}
	rowID := number(first(in, "ID", "id"))
	var row database.LegacyInfo
	if rowID == 0 || s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", id.TenantID, rowID).First(&row).Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "公告不存在")
	}
	if value := strings.TrimSpace(stringValue(in["title"])); value != "" {
		row.Title = value
	}
	if value, ok := in["content"]; ok {
		row.Content = stringValue(value)
	}
	if value, ok := in["userID"]; ok && number(value) > 0 {
		row.UserID = number(value)
	}
	if value, ok := in["attachments"]; ok {
		encoded, _ := json.Marshal(value)
		row.Attachments = string(encoded)
	}
	if err := s.DB.WithContext(c.Request().Context()).Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, compatInfoView(row))
}

func (s *Service) compatInfoDelete(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	ids := parseIDs(c, "ID", "ids", "IDs[]")
	if len(ids) == 0 {
		if value := number(first(in, "ID", "id")); value > 0 {
			ids = []uint64{value}
		}
	}
	if len(ids) == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少公告 ID")
	}
	result := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id IN ?", id.TenantID, ids).Delete(&database.LegacyInfo{})
	if result.Error != nil {
		return result.Error
	}
	return legacyOK(c, map[string]any{"deleted": result.RowsAffected})
}

func (s *Service) compatInfoFind(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	rowID := parseUintValue(c.QueryParam("ID"))
	if rowID == 0 {
		rowID = parseUintValue(c.QueryParam("id"))
	}
	var row database.LegacyInfo
	if rowID == 0 || s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", id.TenantID, rowID).First(&row).Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "公告不存在")
	}
	return legacyOK(c, map[string]any{"reinfo": compatInfoView(row)})
}

func (s *Service) compatInfoList(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	q := s.DB.WithContext(c.Request().Context()).Model(&database.LegacyInfo{}).Where("tenant_id=?", id.TenantID)
	if keyword := strings.TrimSpace(c.QueryParam("keyword")); keyword != "" {
		q = q.Where("title LIKE ? OR content LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.LegacyInfo
	if err := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, compatInfoView(row))
	}
	return legacyOK(c, map[string]any{"list": items, "page": page, "pageSize": size, "total": total})
}

func (s *Service) compatInfoDataSource(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var users []database.User
	s.DB.WithContext(c.Request().Context()).Table("users u").Joins("JOIN tenant_memberships tm ON tm.user_id=u.id AND tm.tenant_id=? AND tm.status=?", id.TenantID, "active").Where("u.status=?", "active").Order("u.id asc").Find(&users)
	var roles []database.Role
	s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND status=?", id.TenantID, "active").Order("id asc").Find(&roles)
	userViews := make([]map[string]any, 0, len(users))
	for _, u := range users {
		userViews = append(userViews, map[string]any{"id": u.ID, "nickName": u.Nickname})
	}
	roleViews := make([]map[string]any, 0, len(roles))
	for _, r := range roles {
		roleViews = append(roleViews, map[string]any{"authorityId": r.ID, "authorityName": r.Name})
	}
	return legacyOK(c, map[string]any{"users": userViews, "authorities": roleViews})
}

func (s *Service) compatEmailTest(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"tested": true})
}

func (s *Service) compatEmailSend(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	var in struct{ To, Subject, Body string }
	if err := c.Bind(&in); err != nil || strings.TrimSpace(in.To) == "" || strings.TrimSpace(in.Subject) == "" || strings.TrimSpace(in.Body) == "" {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "收件人、主题和正文不能为空")
	}
	return legacyOK(c, map[string]any{"queued": true})
}

func compatTemplateView(row database.LegacyExportTemplate) map[string]any {
	var query any
	if strings.TrimSpace(row.Query) != "" {
		_ = json.Unmarshal([]byte(row.Query), &query)
	}
	return map[string]any{"ID": row.ID, "id": row.ID, "CreatedAt": row.CreatedAt, "UpdatedAt": row.UpdatedAt, "name": row.Name, "tableName": row.TableName, "templateID": row.TemplateID, "fieldList": row.FieldList, "whereCond": row.WhereCond, "orderCond": row.OrderCond, "limit": row.Limit, "sql": row.SQL, "info": row.Info, "query": query, "revision": row.Revision}
}

func (s *Service) compatExportTemplateSave(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "导出模板参数格式错误")
	}
	name, templateID := strings.TrimSpace(stringValue(in["name"])), strings.TrimSpace(stringValue(in["templateID"]))
	if name == "" || templateID == "" || !compatIdentifier.MatchString(templateID) {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "模板名称和标识格式不正确")
	}
	rowID := number(first(in, "ID", "id"))
	var row database.LegacyExportTemplate
	if rowID > 0 {
		if s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", id.TenantID, rowID).First(&row).Error != nil {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "导出模板不存在")
		}
	} else {
		row = database.LegacyExportTemplate{TenantID: id.TenantID, Revision: 1}
	}
	row.Name, row.TemplateID = name, templateID
	row.TableName = strings.TrimSpace(stringValue(in["tableName"]))
	row.FieldList = stringValue(in["fieldList"])
	row.WhereCond = stringValue(in["whereCond"])
	row.OrderCond = stringValue(in["orderCond"])
	row.SQL = stringValue(in["sql"])
	row.Info = stringValue(in["info"])
	if limit := int(number(in["limit"])); limit > 0 {
		row.Limit = limit
	}
	if row.Limit <= 0 {
		row.Limit = 1000
	}
	if query, ok := in["query"]; ok {
		encoded, _ := json.Marshal(query)
		row.Query = string(encoded)
	}
	if row.ID > 0 {
		row.Revision++
	}
	if err := s.DB.WithContext(c.Request().Context()).Save(&row).Error; err != nil {
		return httpx.NewError(http.StatusConflict, "TEMPLATE_EXISTS", "模板标识已存在")
	}
	return legacyOK(c, compatTemplateView(row))
}

func (s *Service) compatExportTemplateDelete(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	ids := parseIDs(c, "ID", "ids", "IDs[]")
	if len(ids) == 0 {
		if value := number(first(in, "ID", "id")); value > 0 {
			ids = []uint64{value}
		}
	}
	if len(ids) == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少模板 ID")
	}
	result := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id IN ?", id.TenantID, ids).Delete(&database.LegacyExportTemplate{})
	if result.Error != nil {
		return result.Error
	}
	return legacyOK(c, map[string]any{"deleted": result.RowsAffected})
}

func (s *Service) compatExportTemplateFind(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	rowID := parseUintValue(c.QueryParam("ID"))
	if rowID == 0 {
		rowID = parseUintValue(c.QueryParam("id"))
	}
	var row database.LegacyExportTemplate
	if rowID == 0 || s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", id.TenantID, rowID).First(&row).Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "导出模板不存在")
	}
	return legacyOK(c, map[string]any{"resysExportTemplate": compatTemplateView(row)})
}

func (s *Service) compatExportTemplateList(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	q := s.DB.WithContext(c.Request().Context()).Model(&database.LegacyExportTemplate{}).Where("tenant_id=?", id.TenantID)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.LegacyExportTemplate
	if err := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		items = append(items, compatTemplateView(r))
	}
	return legacyOK(c, map[string]any{"list": items, "page": page, "pageSize": size, "total": total})
}

func (s *Service) compatExportTemplatePreview(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	key := strings.TrimSpace(c.QueryParam("templateID"))
	var row database.LegacyExportTemplate
	if s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND template_id=?", id.TenantID, key).First(&row).Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "导出模板不存在")
	}
	return legacyOK(c, map[string]any{"sql": compatTemplateSQL(row)})
}

func compatTemplateSQL(row database.LegacyExportTemplate) string {
	if strings.TrimSpace(row.SQL) != "" {
		return row.SQL
	}
	table := row.TableName
	if !compatIdentifier.MatchString(table) {
		table = "records"
	}
	fields := "*"
	var list []map[string]any
	if json.Unmarshal([]byte(row.FieldList), &list) == nil && len(list) > 0 {
		names := make([]string, 0, len(list))
		for _, f := range list {
			n := stringValue(f["name"])
			if compatIdentifier.MatchString(n) {
				names = append(names, n)
			}
		}
		if len(names) > 0 {
			fields = strings.Join(names, ", ")
		}
	}
	limit := row.Limit
	if limit < 1 || limit > 10000 {
		limit = 1000
	}
	return fmt.Sprintf("SELECT %s FROM %s LIMIT %d", fields, table, limit)
}

func (s *Service) compatExportTemplateImport(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	if _, err := c.FormFile("file"); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请选择导入文件")
	}
	return legacyOK(c, map[string]any{"imported": true})
}

func (s *Service) compatExportTemplateDownload(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	key := strings.TrimSpace(c.QueryParam("templateID"))
	if key == "" {
		key = strings.TrimSpace(c.QueryParam("token"))
	}
	var row database.LegacyExportTemplate
	query := s.DB.WithContext(c.Request().Context())
	if numericID := parseUintValue(key); numericID > 0 {
		query = query.Where("tenant_id=? AND id=?", id.TenantID, numericID)
	} else {
		query = query.Where("tenant_id=? AND template_id=?", id.TenantID, key)
	}
	if err := query.First(&row).Error; err != nil {
		// The API administration page has always exposed a built-in `api`
		// template, even when no user-created export template records exist.
		// Keep that button useful on a fresh database by materializing the same
		// read-only definition for the download request.
		if !errors.Is(err, gorm.ErrRecordNotFound) || key != "api" {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "导出模板不存在")
		}
		row = database.LegacyExportTemplate{
			TenantID:   id.TenantID,
			Name:       "API",
			TemplateID: "api",
			TableName:  "sys_apis",
			FieldList:  `[{"name":"path"},{"name":"method"},{"name":"permission"},{"name":"group"}]`,
			Limit:      1000,
			Revision:   1,
		}
	}
	// The legacy API first asks for a signed download URL and then performs a
	// second authenticated request. The *ByToken routes below serve the bytes.
	if !strings.Contains(c.Path(), "ByToken") {
		endpoint := "exportTemplateByToken"
		if strings.Contains(c.Path(), "exportExcel") {
			endpoint = "exportExcelByToken"
		}
		token := strconv.FormatUint(row.ID, 10)
		if row.ID == 0 {
			token = row.TemplateID
		}
		return legacyOK(c, map[string]any{"url": "/api/sysExportTemplate/" + endpoint + "?token=" + token})
	}
	body, _ := json.Marshal(compatTemplateView(row))
	c.Response().Header().Set(echo.HeaderContentDisposition, `attachment; filename="`+row.TemplateID+`.json"`)
	return c.Blob(http.StatusOK, "application/json", body)
}

func (s *Service) compatBuilderCatalog(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"tables": []map[string]any{{"key": "sys_apis", "label": "API 资源", "scope": "tenant", "fields": []map[string]any{{"key": "path", "label": "路径", "type": "string"}, {"key": "method", "label": "方法", "type": "string"}, {"key": "permission", "label": "权限", "type": "string"}, {"key": "group", "label": "分组", "type": "string"}}}}, "relations": []any{}, "limit": 10000})
}

func (s *Service) compatBuilderPreview(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	var in struct {
		Query map[string]any `json:"query"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "查询参数格式错误")
	}
	table := stringValue(in.Query["table"])
	if !compatIdentifier.MatchString(table) {
		table = "sys_apis"
	}
	return legacyOK(c, map[string]any{"sql": fmt.Sprintf("SELECT * FROM %s LIMIT 1000", table), "code": "export query", "columns": []any{}, "parameters": []any{}, "query": in.Query, "canImport": table == "sys_apis"})
}

func compatVersionView(row database.LegacyVersion) map[string]any {
	var data map[string]any
	_ = json.Unmarshal([]byte(row.VersionData), &data)
	return map[string]any{"ID": row.ID, "id": row.ID, "CreatedAt": row.CreatedAt, "UpdatedAt": row.UpdatedAt, "versionName": row.VersionName, "versionCode": row.VersionCode, "description": row.Description, "importMode": row.ImportMode, "versionData": row.VersionData, "menus": data["menus"], "apis": data["apis"], "dictionaries": data["dictionaries"]}
}

func (s *Service) compatVersionExport(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "版本参数格式错误")
	}
	name, code := strings.TrimSpace(stringValue(in["versionName"])), strings.TrimSpace(stringValue(in["versionCode"]))
	if name == "" || code == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "版本名称和编号不能为空")
	}
	data, _ := json.Marshal(in)
	row := database.LegacyVersion{TenantID: id.TenantID, VersionName: name, VersionCode: code, Description: stringValue(in["description"]), ImportMode: "export", VersionData: string(data)}
	if err := s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		return httpx.NewError(409, "VERSION_EXISTS", "版本编号已存在")
	}
	return legacyOK(c, compatVersionView(row))
}

func (s *Service) compatVersionImport(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "版本内容格式错误")
	}
	mode := strings.TrimSpace(stringValue(in["mode"]))
	if mode == "" {
		mode = "record"
	}
	items := []map[string]any{}
	if value, ok := in["dryRun"].(bool); ok && value {
		return legacyOK(c, map[string]any{"mode": mode, "dryRun": true, "items": items})
	}
	row := database.LegacyVersion{TenantID: id.TenantID, VersionName: stringValue(in["versionName"]), VersionCode: stringValue(in["versionCode"]), Description: stringValue(in["description"]), ImportMode: mode}
	if row.VersionName == "" {
		row.VersionName = "导入版本"
	}
	if row.VersionCode == "" {
		row.VersionCode = "import-" + strconv.FormatInt(time.Now().Unix(), 10)
	}
	data, _ := json.Marshal(in)
	row.VersionData = string(data)
	if err := s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"mode": mode, "dryRun": false, "items": items, "version": compatVersionView(row)})
}

func (s *Service) compatVersionFind(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	rid := parseUintValue(c.QueryParam("ID"))
	if rid == 0 {
		rid = parseUintValue(c.QueryParam("id"))
	}
	var row database.LegacyVersion
	if rid == 0 || s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", id.TenantID, rid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "版本不存在")
	}
	return legacyOK(c, map[string]any{"resysVersion": compatVersionView(row)})
}
func (s *Service) compatVersionList(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	q := s.DB.WithContext(c.Request().Context()).Model(&database.LegacyVersion{}).Where("tenant_id=?", id.TenantID)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.LegacyVersion
	if err := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		items = append(items, compatVersionView(r))
	}
	return legacyOK(c, map[string]any{"list": items, "page": page, "pageSize": size, "total": total})
}
func (s *Service) compatVersionDownload(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	rid := parseUintValue(c.QueryParam("ID"))
	if rid == 0 {
		rid = parseUintValue(c.QueryParam("id"))
	}
	var row database.LegacyVersion
	if rid == 0 || s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", id.TenantID, rid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "版本不存在")
	}
	body, _ := json.Marshal(compatVersionView(row))
	c.Response().Header().Set(echo.HeaderContentDisposition, `attachment; filename="`+row.VersionCode+`.json"`)
	return c.Blob(http.StatusOK, "application/json", body)
}
func (s *Service) compatVersionDelete(c *echo.Context) error {
	id, err := compatIdentity(c)
	if err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	ids := parseIDs(c, "ID", "ids", "IDs[]")
	if len(ids) == 0 {
		if v := number(first(in, "ID", "id")); v > 0 {
			ids = []uint64{v}
		}
	}
	if len(ids) == 0 {
		return httpx.NewError(400, "VALIDATION_ERROR", "缺少版本 ID")
	}
	result := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id IN ?", id.TenantID, ids).Delete(&database.LegacyVersion{})
	if result.Error != nil {
		return result.Error
	}
	return legacyOK(c, map[string]any{"deleted": result.RowsAffected})
}

func (s *Service) compatNoop(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}
func (s *Service) compatNoopData(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	return legacyOK(c, in)
}
func (s *Service) compatEmptyPage(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"list": []any{}, "page": 1, "pageSize": 20, "total": 0})
}
func (s *Service) compatTemplates(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, []string{})
}
func (s *Service) compatPlugins(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"plugins": []any{}})
}
func (s *Service) compatPluginInstall(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, []any{})
}
func (s *Service) compatSkillTools(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"tools": []any{}})
}
func (s *Service) compatSkillList(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"skills": []any{}})
}
func (s *Service) compatSkillDetail(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	var in struct {
		Name string `json:"name"`
	}
	_ = c.Bind(&in)
	return legacyOK(c, map[string]any{"detail": map[string]any{"name": in.Name, "description": "", "version": "", "category": "", "status": 1, "markdown": "", "scripts": map[string]string{}, "resources": map[string]string{}, "references": map[string]string{}, "templates": map[string]string{}}})
}
func (s *Service) compatSkillDraft(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	var in struct {
		FileName string `json:"fileName"`
	}
	_ = c.Bind(&in)
	return legacyOK(c, map[string]any{"fileName": in.FileName, "content": ""})
}
func (s *Service) compatSkillContent(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"content": ""})
}
func (s *Service) compatGlobalConstraint(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"content": "", "exists": false})
}
func (s *Service) compatLLMSSE(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	c.Response().Header().Set(echo.HeaderContentType, "text/event-stream")
	return c.String(http.StatusOK, "event: complete\ndata: {\"content\":\"\"}\n\n")
}
func (s *Service) compatEmptyZip(c *echo.Context) error {
	if _, err := compatIdentity(c); err != nil {
		return err
	}
	var buf bytes.Buffer
	archive := zip.NewWriter(&buf)
	_ = archive.Close()
	c.Response().Header().Set(echo.HeaderContentType, "application/zip")
	c.Response().Header().Set(echo.HeaderContentDisposition, `attachment; filename="export.zip"`)
	return c.Blob(http.StatusOK, "application/zip", buf.Bytes())
}
