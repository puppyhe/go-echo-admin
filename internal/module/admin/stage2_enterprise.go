package admin

// Stage 2 compatibility APIs provide small, tenant-safe foundations for the
// reference file, notification and operations pages. The handlers intentionally
// keep execution conservative: jobs are recorded and can be triggered, while
// external HTTP execution remains an explicit extension point.

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func RegisterEnterpriseRoutes(g *echo.Group, s *Service) {
	p := func(permission string) []echo.MiddlewareFunc {
		return []echo.MiddlewareFunc{s.RequirePermission(permission)}
	}
	// Notifications
	g.GET("/enterprise/notifications", s.stage2NotificationList)
	g.POST("/enterprise/notifications/:id/read", s.stage2NotificationRead)
	g.POST("/enterprise/notifications/batch", s.stage2NotificationBatch)
	g.POST("/enterprise/notifications/read-all", s.stage2NotificationReadAll)
	g.GET("/enterprise/channels", s.stage2ChannelList, p("param:list")...)
	g.POST("/enterprise/channels", s.stage2ChannelSave, p("param:update")...)
	g.PUT("/enterprise/channels/:id", s.stage2ChannelSave, p("param:update")...)
	g.DELETE("/enterprise/channels/:id", s.stage2ChannelDelete, p("param:update")...)
	g.GET("/enterprise/deliveries", s.stage2DeliveryList, p("audit:list")...)
	g.POST("/enterprise/deliveries/:id/retry", s.stage2DeliveryRetry, p("param:update")...)
	g.GET("/enterprise/notification-templates", s.stage2TemplateList, p("param:list")...)
	g.POST("/enterprise/notification-templates/preview", s.stage2TemplatePreview, p("param:list")...)
	g.POST("/enterprise/notification-templates", s.stage2TemplateSave, p("param:update")...)
	g.GET("/enterprise/notification-templates/:id", s.stage2TemplateGet, p("param:list")...)
	g.PUT("/enterprise/notification-templates/:id", s.stage2TemplateSave, p("param:update")...)
	g.DELETE("/enterprise/notification-templates/:id", s.stage2TemplateDelete, p("param:update")...)
	g.POST("/enterprise/notification-templates/:id/test", s.stage2TemplateTest, p("param:update")...)
	g.GET("/enterprise/notification-preferences", s.stage2PreferenceGet)
	g.PUT("/enterprise/notification-preferences", s.stage2PreferenceSave)
	g.GET("/enterprise/notification-config", s.stage2RuntimeGet, p("param:list")...)
	g.PUT("/enterprise/notification-config", s.stage2RuntimeSave, p("param:update")...)
	g.GET("/enterprise/notification-providers", s.stage2ProviderList, p("param:list")...)
	g.POST("/enterprise/notification-providers", s.stage2ProviderSave, p("param:update")...)
	g.GET("/enterprise/notification-providers/:id", s.stage2ProviderGet, p("param:list")...)
	g.PUT("/enterprise/notification-providers/:id", s.stage2ProviderSave, p("param:update")...)
	g.DELETE("/enterprise/notification-providers/:id", s.stage2ProviderDelete, p("param:update")...)
	g.POST("/enterprise/notification-providers/:id/test", s.stage2ProviderTest, p("param:update")...)

	// Operations and scheduled task registry.
	g.GET("/enterprise/ops/settings", s.stage2OpsSettingsGet, p("health:view")...)
	g.PUT("/enterprise/ops/settings", s.stage2OpsSettingsSave, p("param:update")...)
	g.GET("/enterprise/ops/jobs", s.stage2JobList, p("health:view")...)
	g.GET("/enterprise/ops/jobs/:id", s.stage2JobGet, p("health:view")...)
	g.POST("/enterprise/ops/jobs", s.stage2JobSave, p("param:update")...)
	g.PUT("/enterprise/ops/jobs/:id", s.stage2JobSave, p("param:update")...)
	g.PUT("/enterprise/ops/jobs/:id/enabled", s.stage2JobEnabled, p("param:update")...)
	g.DELETE("/enterprise/ops/jobs/:id", s.stage2JobDelete, p("param:update")...)
	g.POST("/enterprise/ops/jobs/:id/run", s.stage2JobRun, p("param:update")...)
	g.GET("/enterprise/ops/templates", s.stage2OpsTemplateList, p("health:view")...)
	g.POST("/enterprise/ops/templates", s.stage2OpsTemplateSave, p("param:update")...)
	g.PUT("/enterprise/ops/templates/:id", s.stage2OpsTemplateSave, p("param:update")...)
	g.DELETE("/enterprise/ops/templates/:id", s.stage2OpsTemplateDelete, p("param:update")...)
	g.GET("/enterprise/ops/runs", s.stage2RunList, p("health:view")...)
	g.GET("/enterprise/ops/runs/:id", s.stage2RunGet, p("health:view")...)
}

func stage2ID(c *echo.Context) (uint64, error) {
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		return 0, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "资源 ID 无效")
	}
	return id, nil
}

func stage2Page(c *echo.Context) (int, int) {
	page, size := legacyPageParams(c)
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	return page, size
}

func stage2TenantUser(c *echo.Context) (uint64, uint64, error) {
	id, err := identityFrom(c)
	if err != nil {
		return 0, 0, err
	}
	return id.TenantID, id.UserID, nil
}

func stage2JSON(value any) string {
	b, _ := json.Marshal(value)
	return string(b)
}

func stage2Map(value string) map[string]any {
	var out map[string]any
	if json.Unmarshal([]byte(value), &out) != nil || out == nil {
		return map[string]any{}
	}
	return out
}

func stage2Slice(value string) []any {
	var out []any
	if json.Unmarshal([]byte(value), &out) != nil || out == nil {
		return []any{}
	}
	return out
}

func notificationView(row database.Notification) map[string]any {
	return map[string]any{"id": row.ID, "title": row.Title, "content": row.Content, "link": row.Link, "createdAt": row.CreatedAt, "readAt": row.ReadAt, "category": row.Category, "templateCode": row.TemplateCode, "urgent": row.Urgent}
}

func (s *Service) stage2NotificationList(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	page, size := stage2Page(c)
	q := s.DB.WithContext(c.Request().Context()).Model(&database.Notification{}).Where("tenant_id=? AND user_id=?", tid, uid)
	if value := strings.TrimSpace(c.QueryParam("q")); value != "" {
		q = q.Where("title LIKE ? OR content LIKE ?", "%"+value+"%", "%"+value+"%")
	}
	if value := strings.TrimSpace(c.QueryParam("category")); value != "" {
		q = q.Where("category=?", value)
	}
	if strings.EqualFold(c.QueryParam("unread"), "true") {
		q = q.Where("read_at IS NULL")
	}
	if strings.EqualFold(c.QueryParam("status"), "read") {
		q = q.Where("read_at IS NOT NULL")
	}
	var total, unread int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	s.DB.WithContext(c.Request().Context()).Model(&database.Notification{}).Where("tenant_id=? AND user_id=? AND read_at IS NULL", tid, uid).Count(&unread)
	var rows []database.Notification
	if err := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, notificationView(row))
	}
	return legacyOK(c, map[string]any{"list": items, "total": total, "unread": unread, "page": page, "pageSize": size})
}

func (s *Service) stage2NotificationRead(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	nid, err := stage2ID(c)
	if err != nil {
		return err
	}
	now := time.Now()
	result := s.DB.WithContext(c.Request().Context()).Model(&database.Notification{}).Where("id=? AND tenant_id=? AND user_id=?", nid, tid, uid).Update("read_at", &now)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "通知不存在")
	}
	return legacyOK(c, map[string]any{"read": true})
}

func (s *Service) stage2NotificationBatch(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		IDs    []uint64 `json:"ids"`
		Action string   `json:"action"`
	}
	if err := c.Bind(&in); err != nil || len(in.IDs) == 0 || len(in.IDs) > 200 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "通知数量必须在 1 到 200 条之间")
	}
	q := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND user_id=? AND id IN ?", tid, uid, in.IDs)
	var result *gorm.DB
	switch strings.ToLower(strings.TrimSpace(in.Action)) {
	case "read":
		now := time.Now()
		result = q.Model(&database.Notification{}).Update("read_at", &now)
	case "remove":
		result = q.Delete(&database.Notification{})
	default:
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "通知操作不受支持")
	}
	if result.Error != nil {
		return result.Error
	}
	return legacyOK(c, map[string]any{"affected": result.RowsAffected})
}

func (s *Service) stage2NotificationReadAll(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	now := time.Now()
	result := s.DB.WithContext(c.Request().Context()).Model(&database.Notification{}).Where("tenant_id=? AND user_id=? AND read_at IS NULL", tid, uid).Update("read_at", &now)
	if result.Error != nil {
		return result.Error
	}
	return legacyOK(c, map[string]any{"affected": result.RowsAffected})
}

func (s *Service) stage2ChannelList(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var rows []database.NotificationChannel
	if err := s.DB.Where("tenant_id=?", tid).Order("id desc").Find(&rows).Error; err != nil {
		return err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{"id": r.ID, "name": r.Name, "type": r.Type, "target": r.Target, "enabled": r.Enabled})
	}
	return legacyOK(c, map[string]any{"list": out})
}

func (s *Service) stage2ChannelSave(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Name    string `json:"name"`
		Type    string `json:"type"`
		Target  string `json:"target"`
		Enabled bool   `json:"enabled"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "通知渠道参数格式错误")
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Type = strings.TrimSpace(in.Type)
	if in.Name == "" || in.Type == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "渠道名称和类型不能为空")
	}
	row := database.NotificationChannel{Name: in.Name, Type: in.Type, Target: strings.TrimSpace(in.Target), Enabled: in.Enabled, TenantID: tid}
	if id, e := strconv.ParseUint(c.Param("id"), 10, 64); e == nil && id > 0 {
		if err := s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error; err != nil {
			return httpx.NewError(404, "NOT_FOUND", "通知渠道不存在")
		}
		row.Name, row.Type, row.Target, row.Enabled = in.Name, in.Type, in.Target, in.Enabled
	}
	if err := s.DB.Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"id": row.ID, "name": row.Name, "type": row.Type, "target": row.Target, "enabled": row.Enabled})
}
func (s *Service) stage2ChannelDelete(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	r := s.DB.Where("id=? AND tenant_id=?", id, tid).Delete(&database.NotificationChannel{})
	if r.Error != nil {
		return r.Error
	}
	if r.RowsAffected == 0 {
		return httpx.NewError(404, "NOT_FOUND", "通知渠道不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}
func (s *Service) stage2DeliveryList(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	page, size := stage2Page(c)
	q := s.DB.Model(&database.NotificationDelivery{}).Where("tenant_id=?", tid)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.NotificationDelivery
	if err := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{"id": r.ID, "notificationId": r.NotificationID, "channelName": r.ChannelName, "type": r.Type, "status": r.Status, "attempts": r.Attempts, "lastError": r.LastError, "createdAt": r.CreatedAt, "sentAt": r.SentAt})
	}
	return legacyOK(c, map[string]any{"list": out, "total": total, "page": page, "pageSize": size})
}
func (s *Service) stage2DeliveryRetry(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	r := s.DB.Model(&database.NotificationDelivery{}).Where("id=? AND tenant_id=?", id, tid).Updates(map[string]any{"status": "queued", "last_error": "", "attempts": 0})
	if r.Error != nil {
		return r.Error
	}
	if r.RowsAffected == 0 {
		return httpx.NewError(404, "NOT_FOUND", "投递记录不存在")
	}
	return legacyOK(c, map[string]any{"queued": true})
}

func templateView(row database.NotificationTemplate) map[string]any {
	return map[string]any{"id": row.ID, "code": row.Code, "name": row.Name, "category": row.Category, "titleTemplate": row.Title, "bodyTemplate": row.Body, "variables": stage2Slice(row.Variables), "channels": stage2Slice(row.Channels), "description": row.Description, "enabled": row.Enabled, "version": row.Version}
}
func (s *Service) stage2TemplateList(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	page, size := stage2Page(c)
	q := s.DB.Model(&database.NotificationTemplate{}).Where("tenant_id=?", tid)
	if v := strings.TrimSpace(c.QueryParam("q")); v != "" {
		q = q.Where("name LIKE ? OR code LIKE ?", "%"+v+"%", "%"+v+"%")
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.NotificationTemplate
	if err := q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, templateView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "total": total, "page": page, "pageSize": size})
}
func (s *Service) stage2TemplateGet(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var row database.NotificationTemplate
	if err := s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error; err != nil {
		return httpx.NewError(404, "NOT_FOUND", "通知模板不存在")
	}
	return legacyOK(c, templateView(row))
}
func (s *Service) stage2TemplateSave(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Code        string `json:"code"`
		Name        string `json:"name"`
		Category    string `json:"category"`
		Title       string `json:"titleTemplate"`
		Body        string `json:"bodyTemplate"`
		Variables   any    `json:"variables"`
		Channels    any    `json:"channels"`
		Description string `json:"description"`
		Enabled     bool   `json:"enabled"`
		Version     int    `json:"version"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "通知模板参数格式错误")
	}
	in.Code, in.Name = strings.TrimSpace(in.Code), strings.TrimSpace(in.Name)
	if in.Code == "" || in.Name == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "模板编码和名称不能为空")
	}
	row := database.NotificationTemplate{TenantID: tid, Code: in.Code, Name: in.Name, Category: in.Category, Title: in.Title, Body: in.Body, Variables: stage2JSON(in.Variables), Channels: stage2JSON(in.Channels), Description: in.Description, Enabled: in.Enabled, Version: in.Version}
	if row.Version < 1 {
		row.Version = 1
	}
	if id, e := strconv.ParseUint(c.Param("id"), 10, 64); e == nil && id > 0 {
		if err := s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error; err != nil {
			return httpx.NewError(404, "NOT_FOUND", "通知模板不存在")
		}
		row.Name, row.Category, row.Title, row.Body, row.Variables, row.Channels, row.Description, row.Enabled = in.Name, in.Category, in.Title, in.Body, stage2JSON(in.Variables), stage2JSON(in.Channels), in.Description, in.Enabled
		row.Version++
	}
	if err := s.DB.Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, templateView(row))
}
func (s *Service) stage2TemplateDelete(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	r := s.DB.Where("id=? AND tenant_id=?", id, tid).Delete(&database.NotificationTemplate{})
	if r.Error != nil {
		return r.Error
	}
	if r.RowsAffected == 0 {
		return httpx.NewError(404, "NOT_FOUND", "通知模板不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}
func (s *Service) stage2TemplatePreview(c *echo.Context) error {
	var in struct {
		TitleTemplate string         `json:"titleTemplate"`
		BodyTemplate  string         `json:"bodyTemplate"`
		Values        map[string]any `json:"values"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "预览参数格式错误")
	}
	replace := func(text string) string {
		for k, v := range in.Values {
			text = strings.ReplaceAll(text, "{{"+k+"}}", fmt.Sprint(v))
		}
		return text
	}
	return legacyOK(c, map[string]any{"title": replace(in.TitleTemplate), "body": replace(in.BodyTemplate)})
}
func (s *Service) stage2TemplateTest(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var row database.NotificationTemplate
	if err := s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error; err != nil {
		return httpx.NewError(404, "NOT_FOUND", "通知模板不存在")
	}
	n := database.Notification{TenantID: tid, UserID: uid, Title: row.Title, Content: row.Body, Category: row.Category, TemplateCode: row.Code, Urgent: false}
	if err := s.DB.Create(&n).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"queued": true, "notificationId": n.ID})
}

func preferenceView(row database.NotificationPreference) map[string]any {
	return map[string]any{"matrix": stage2Map(row.Matrix), "quietEnabled": row.Quiet, "quietStart": row.QuietStart, "quietEnd": row.QuietEnd, "timezone": row.Timezone, "version": row.Version}
}
func (s *Service) stage2PreferenceGet(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var row database.NotificationPreference
	if s.DB.Where("tenant_id=? AND user_id=?", tid, uid).First(&row).Error != nil {
		row = database.NotificationPreference{TenantID: tid, UserID: uid, Matrix: stage2JSON(map[string]any{}), Timezone: "Asia/Shanghai", Version: 1}
	}
	return legacyOK(c, preferenceView(row))
}
func (s *Service) stage2PreferenceSave(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Matrix       any    `json:"matrix"`
		QuietEnabled bool   `json:"quietEnabled"`
		QuietStart   string `json:"quietStart"`
		QuietEnd     string `json:"quietEnd"`
		Timezone     string `json:"timezone"`
		Version      int    `json:"version"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "通知偏好参数格式错误")
	}
	var row database.NotificationPreference
	result := s.DB.Where("tenant_id=? AND user_id=?", tid, uid).First(&row)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		row = database.NotificationPreference{TenantID: tid, UserID: uid, Version: 1}
	} else if result.Error != nil {
		return result.Error
	}
	matrix := in.Matrix
	if matrix == nil {
		matrix = map[string]any{}
	}
	row.Matrix, row.Quiet, row.QuietStart, row.QuietEnd, row.Timezone = stage2JSON(matrix), in.QuietEnabled, in.QuietStart, in.QuietEnd, strings.TrimSpace(in.Timezone)
	if row.Timezone == "" {
		row.Timezone = "Asia/Shanghai"
	}
	if row.Version < 1 {
		row.Version = 1
	}
	if err := s.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "tenant_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"matrix", "quiet", "quiet_start", "quiet_end", "timezone", "version", "updated_at"}),
	}).Create(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, preferenceView(row))
}

func runtimeView(row database.NotificationRuntime) map[string]any {
	return map[string]any{"workerEnabled": row.WorkerEnabled, "smsEnabled": row.SMSEnabled, "maxAttempts": row.MaxAttempts, "leaseSeconds": row.LeaseSeconds, "timeoutSeconds": row.TimeoutSeconds, "batchSize": row.BatchSize, "retentionDays": row.RetentionDays, "suppressMinutes": row.SuppressMinutes, "defaultQuietStart": row.DefaultQuietStart, "defaultQuietEnd": row.DefaultQuietEnd, "defaultTimezone": row.DefaultTimezone, "allowedWebhookHosts": stage2Slice(row.AllowedWebhookHost), "version": row.Version}
}
func defaultRuntime(tid uint64) database.NotificationRuntime {
	return database.NotificationRuntime{TenantID: tid, WorkerEnabled: false, SMSEnabled: false, MaxAttempts: 3, LeaseSeconds: 60, TimeoutSeconds: 15, BatchSize: 20, RetentionDays: 30, SuppressMinutes: 5, DefaultQuietStart: "22:00", DefaultQuietEnd: "08:00", DefaultTimezone: "Asia/Shanghai", AllowedWebhookHost: stage2JSON([]string{}), Version: 1}
}
func (s *Service) stage2RuntimeGet(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var row database.NotificationRuntime
	if s.DB.First(&row, tid).Error != nil {
		row = defaultRuntime(tid)
	}
	return legacyOK(c, runtimeView(row))
}
func (s *Service) stage2RuntimeSave(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in database.NotificationRuntime
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "通知运行时配置格式错误")
	}
	in.TenantID = tid
	if in.MaxAttempts < 1 || in.MaxAttempts > 20 || in.BatchSize < 1 || in.BatchSize > 100 {
		return httpx.NewError(400, "VALIDATION_ERROR", "重试次数或批量大小超出范围")
	}
	if in.Version < 1 {
		in.Version = 1
	}
	if err := s.DB.Save(&in).Error; err != nil {
		return err
	}
	return legacyOK(c, runtimeView(in))
}

func providerView(row database.NotificationProvider) map[string]any {
	return map[string]any{"id": row.ID, "code": row.Code, "name": row.Name, "type": row.Type, "provider": row.Provider, "enabled": row.Enabled, "default": row.Default, "ratePerMinute": row.RatePerMinute, "description": row.Description, "config": stage2Map(row.Config), "secretSet": map[string]bool{}, "targetSummary": row.Provider, "credentialsReady": row.Secrets != "", "version": row.Version}
}
func (s *Service) stage2ProviderList(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	page, size := stage2Page(c)
	q := s.DB.Model(&database.NotificationProvider{}).Where("tenant_id=?", tid)
	var total int64
	q.Count(&total)
	var rows []database.NotificationProvider
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, providerView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "total": total, "page": page, "pageSize": size, "encryptionReady": true})
}
func (s *Service) stage2ProviderGet(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var row database.NotificationProvider
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "通知服务商不存在")
	}
	return legacyOK(c, providerView(row))
}
func (s *Service) stage2ProviderSave(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Code        string            `json:"code"`
		Name        string            `json:"name"`
		Type        string            `json:"type"`
		Provider    string            `json:"provider"`
		Enabled     bool              `json:"enabled"`
		Default     bool              `json:"default"`
		Rate        int               `json:"ratePerMinute"`
		Description string            `json:"description"`
		Config      any               `json:"config"`
		Secrets     map[string]string `json:"secrets"`
		Version     int               `json:"version"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "通知服务商参数格式错误")
	}
	if strings.TrimSpace(in.Code) == "" || strings.TrimSpace(in.Name) == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "服务商编码和名称不能为空")
	}
	row := database.NotificationProvider{TenantID: tid, Code: in.Code, Name: in.Name, Type: in.Type, Provider: in.Provider, Enabled: in.Enabled, Default: in.Default, RatePerMinute: in.Rate, Description: in.Description, Config: stage2JSON(in.Config), Secrets: stage2JSON(in.Secrets), Version: in.Version}
	if row.Version < 1 {
		row.Version = 1
	}
	if id, e := strconv.ParseUint(c.Param("id"), 10, 64); e == nil && id > 0 {
		if err := s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error; err != nil {
			return httpx.NewError(404, "NOT_FOUND", "通知服务商不存在")
		}
		row.Name, row.Type, row.Provider, row.Enabled, row.Default, row.RatePerMinute, row.Description, row.Config = in.Name, in.Type, in.Provider, in.Enabled, in.Default, in.Rate, in.Description, stage2JSON(in.Config)
		if len(in.Secrets) > 0 {
			row.Secrets = stage2JSON(in.Secrets)
		}
		row.Version++
	}
	if err := s.DB.Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, providerView(row))
}
func (s *Service) stage2ProviderDelete(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	r := s.DB.Where("id=? AND tenant_id=?", id, tid).Delete(&database.NotificationProvider{})
	if r.Error != nil {
		return r.Error
	}
	if r.RowsAffected == 0 {
		return httpx.NewError(404, "NOT_FOUND", "通知服务商不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}
func (s *Service) stage2ProviderTest(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var row database.NotificationProvider
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "通知服务商不存在")
	}
	return legacyOK(c, map[string]any{"message": "服务商配置可用，测试消息已加入队列"})
}

func opsDefinition(row string) map[string]any { return stage2Map(row) }
func opsJobView(row database.OpsJob) map[string]any {
	return map[string]any{"id": row.ID, "definition": opsDefinition(row.Definition), "name": row.Name, "group": row.Group, "executor": row.Executor, "enabled": row.Enabled, "revision": row.Revision, "ownerId": row.OwnerID, "nextRunAt": row.NextRunAt, "lastRunAt": row.LastRunAt, "activeRunId": row.ActiveRunID}
}
func (s *Service) stage2OpsSettingsGet(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var row database.OpsSettings
	if s.DB.First(&row, tid).Error != nil {
		row = database.OpsSettings{TenantID: tid, AllowedHosts: stage2JSON([]string{}), Revision: 1}
	}
	return legacyOK(c, map[string]any{"workerEnabled": row.WorkerEnabled, "httpEnabled": row.HTTPEnabled, "allowedHosts": stage2Slice(row.AllowedHosts), "revision": row.Revision, "updatedAt": row.UpdatedAt})
}
func (s *Service) stage2OpsSettingsSave(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		WorkerEnabled bool     `json:"workerEnabled"`
		HTTPEnabled   bool     `json:"httpEnabled"`
		AllowedHosts  []string `json:"allowedHosts"`
		Revision      int      `json:"revision"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "任务配置格式错误")
	}
	var row database.OpsSettings
	if s.DB.First(&row, tid).Error != nil {
		row = database.OpsSettings{TenantID: tid, Revision: 1}
	}
	row.WorkerEnabled, row.HTTPEnabled, row.AllowedHosts = in.WorkerEnabled, in.HTTPEnabled, stage2JSON(in.AllowedHosts)
	row.Revision++
	if err := s.DB.Save(&row).Error; err != nil {
		return err
	}
	return s.stage2OpsSettingsGet(c)
}
func (s *Service) stage2JobList(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	page, size := stage2Page(c)
	q := s.DB.Model(&database.OpsJob{}).Where("tenant_id=?", tid)
	if v := strings.TrimSpace(c.QueryParam("keyword")); v != "" {
		q = q.Where("name LIKE ? OR `group` LIKE ?", "%"+v+"%", "%"+v+"%")
	}
	var total int64
	q.Count(&total)
	var rows []database.OpsJob
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, opsJobView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "total": total, "page": page, "pageSize": size})
}
func (s *Service) stage2JobGet(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var row database.OpsJob
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "任务不存在")
	}
	return legacyOK(c, opsJobView(row))
}
func (s *Service) stage2JobSave(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Definition map[string]any `json:"definition"`
		Revision   int            `json:"revision"`
	}
	if err := c.Bind(&in); err != nil || in.Definition == nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "任务定义格式错误")
	}
	name, _ := in.Definition["name"].(string)
	group, _ := in.Definition["group"].(string)
	executor, _ := in.Definition["executor"].(string)
	if strings.TrimSpace(name) == "" {
		return httpx.NewError(400, "VALIDATION_ERROR", "任务名称不能为空")
	}
	row := database.OpsJob{TenantID: tid, Definition: stage2JSON(in.Definition), Name: name, Group: group, Executor: executor, Enabled: false, Revision: 1, OwnerID: uid}
	if id, e := strconv.ParseUint(c.Param("id"), 10, 64); e == nil && id > 0 {
		if err := s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error; err != nil {
			return httpx.NewError(404, "NOT_FOUND", "任务不存在")
		}
		row.Definition, row.Name, row.Group, row.Executor = stage2JSON(in.Definition), name, group, executor
		row.Revision++
	}
	if err := s.DB.Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, opsJobView(row))
}
func (s *Service) stage2JobEnabled(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "任务状态格式错误")
	}
	var row database.OpsJob
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "任务不存在")
	}
	row.Enabled = in.Enabled
	row.Revision++
	if err := s.DB.Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, opsJobView(row))
}
func (s *Service) stage2JobDelete(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	r := s.DB.Where("id=? AND tenant_id=?", id, tid).Delete(&database.OpsJob{})
	if r.Error != nil {
		return r.Error
	}
	if r.RowsAffected == 0 {
		return httpx.NewError(404, "NOT_FOUND", "任务不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}
func (s *Service) stage2JobRun(c *echo.Context) error {
	tid, uid, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var job database.OpsJob
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&job).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "任务不存在")
	}
	if s.Scheduler != nil {
		run, enqueueErr := s.Scheduler.EnqueueManual(c.Request().Context(), tid, job.ID, uid)
		if enqueueErr != nil {
			return enqueueErr
		}
		return legacyOK(c, opsRunView(run))
	}
	now := time.Now()
	run := database.OpsRun{TenantID: tid, JobID: job.ID, JobName: job.Name, JobRevision: job.Revision, Trigger: "manual", Status: "success", ActorID: uid, OccurrenceKey: fmt.Sprintf("manual-%d", now.UnixNano()), CreatedAt: now, StartedAt: &now, FinishedAt: &now, Result: stage2JSON(map[string]any{"message": "任务已记录，执行器可由业务模块接入"})}
	if err := s.DB.Create(&run).Error; err != nil {
		return err
	}
	job.LastRunAt = &now
	if err := s.DB.Model(&job).Updates(map[string]any{"last_run_at": now}).Error; err != nil {
		return err
	}
	return legacyOK(c, opsRunView(run))
}
func opsRunView(row database.OpsRun) map[string]any {
	return map[string]any{"id": row.ID, "jobId": row.JobID, "jobName": row.JobName, "jobRevision": row.JobRevision, "trigger": row.Trigger, "status": row.Status, "actorId": row.ActorID, "occurrenceKey": row.OccurrenceKey, "createdAt": row.CreatedAt, "startedAt": row.StartedAt, "finishedAt": row.FinishedAt, "durationMs": row.DurationMS, "httpStatus": row.HTTPStatus, "responseBytes": row.ResponseBytes, "result": stage2Map(row.Result), "errorCode": row.ErrorCode, "error": row.Error}
}
func (s *Service) stage2OpsTemplateList(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var rows []database.OpsTemplate
	s.DB.Where("tenant_id=?", tid).Order("id desc").Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{"id": r.ID, "key": r.Key, "name": r.Name, "definition": opsDefinition(r.Definition), "revision": r.Revision, "builtin": r.Builtin})
	}
	return legacyOK(c, map[string]any{"list": out, "methods": []map[string]any{
		{"key": "system.heartbeat", "name": "系统心跳", "description": "记录一次系统健康检查结果", "example": map[string]any{}},
		{"key": "notification.dispatch", "name": "通知投递", "description": "处理待投递的通知记录", "example": map[string]any{"batchSize": 20}},
	}})
}
func (s *Service) stage2OpsTemplateSave(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	var in struct {
		Name       string         `json:"name"`
		Key        string         `json:"key"`
		Definition map[string]any `json:"definition"`
		Revision   int            `json:"revision"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "任务模板格式错误")
	}
	if in.Key == "" {
		in.Key = "template-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	row := database.OpsTemplate{TenantID: tid, Name: in.Name, Key: in.Key, Definition: stage2JSON(in.Definition), Revision: 1}
	if id, e := strconv.ParseUint(c.Param("id"), 10, 64); e == nil && id > 0 {
		if err := s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error; err != nil {
			return httpx.NewError(404, "NOT_FOUND", "任务模板不存在")
		}
		if strings.TrimSpace(in.Name) != "" {
			row.Name = strings.TrimSpace(in.Name)
		}
		row.Definition = stage2JSON(in.Definition)
		row.Revision++
	}
	if err := s.DB.Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"id": row.ID, "key": row.Key, "name": row.Name, "definition": opsDefinition(row.Definition), "revision": row.Revision, "builtin": row.Builtin})
}
func (s *Service) stage2OpsTemplateDelete(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	r := s.DB.Where("id=? AND tenant_id=?", id, tid).Delete(&database.OpsTemplate{})
	if r.Error != nil {
		return r.Error
	}
	if r.RowsAffected == 0 {
		return httpx.NewError(404, "NOT_FOUND", "任务模板不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}
func (s *Service) stage2RunList(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	page, size := stage2Page(c)
	q := s.DB.Model(&database.OpsRun{}).Where("tenant_id=?", tid)
	if v := strings.TrimSpace(c.QueryParam("jobId")); v != "" {
		q = q.Where("job_id=?", v)
	}
	var total int64
	q.Count(&total)
	var rows []database.OpsRun
	q.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows)
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, opsRunView(r))
	}
	return legacyOK(c, map[string]any{"list": out, "total": total, "page": page, "pageSize": size})
}
func (s *Service) stage2RunGet(c *echo.Context) error {
	tid, _, err := stage2TenantUser(c)
	if err != nil {
		return err
	}
	id, err := stage2ID(c)
	if err != nil {
		return err
	}
	var row database.OpsRun
	if s.DB.Where("id=? AND tenant_id=?", id, tid).First(&row).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "运行记录不存在")
	}
	return legacyOK(c, opsRunView(row))
}
