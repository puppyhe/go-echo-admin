package admin

// P0 compatibility handlers close the small but important gaps between the
// canonical API and the reference administration pages. They intentionally
// remain tenant scoped and use the same legacy envelope as the rest of the
// reference frontend.

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// RegisterLegacyP0Routes registers security, runtime diagnostics, API token
// and error-log endpoints used by the first production-ready milestone.
func RegisterLegacyP0Routes(g *echo.Group, s *Service) {
	// A signed-in user may always change their own password. The handler rejects
	// IDs and credentials that do not belong to the current tenant session.
	g.POST("/user/changePassword", s.legacyChangePassword)
	g.PUT("/user/setSelfSetting", s.legacySetSelfSetting)

	p := func(permission string) []echo.MiddlewareFunc {
		return []echo.MiddlewareFunc{s.RequirePermission(permission)}
	}
	g.POST("/system/getServerInfo", s.legacyServerInfo, p("health:view")...)
	g.GET("/security/password-status", s.legacyPasswordStatus)
	g.GET("/system/security", s.legacySecurityGet, p("param:list")...)
	g.PUT("/system/security", s.legacySecuritySave, p("param:update")...)

	// Error reports may be submitted by the current user, while browsing and
	// changing records requires the audit permission.
	g.POST("/sysError/createSysError", s.legacySystemErrorCreate)
	g.GET("/sysError/getSysErrorList", s.legacySystemErrorList, p("audit:list")...)
	g.GET("/sysError/findSysError", s.legacySystemErrorFind, p("audit:list")...)
	g.PUT("/sysError/updateSysError", s.legacySystemErrorUpdate, p("audit:list")...)
	g.DELETE("/sysError/deleteSysError", s.legacySystemErrorDelete, p("audit:list")...)
	g.DELETE("/sysError/deleteSysErrorByIds", s.legacySystemErrorDelete, p("audit:list")...)
	g.GET("/sysError/getSysErrorSolution", s.legacySystemErrorSolution, p("audit:list")...)

	// API tokens are privileged credentials. Keep the management API available
	// to platform administrators and avoid granting it to arbitrary tenant roles.
	g.POST("/sysApiToken/createApiToken", s.legacyAPITokenCreate)
	g.POST("/sysApiToken/getApiTokenList", s.legacyAPITokenList)
	g.POST("/sysApiToken/deleteApiToken", s.legacyAPITokenDelete)
}

// ErrorCaptureMiddleware records authenticated request failures so the error
// log page reflects real server-side failures as well as client-submitted
// reports. It deliberately skips requests without a tenant identity because
// platform and public endpoints belong to the global audit stream.
func (s *Service) ErrorCaptureMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		err := next(c)
		if err == nil {
			return nil
		}
		id, identityErr := identityFrom(c)
		if identityErr != nil {
			return err
		}
		requestID := c.Response().Header().Get(echo.HeaderXRequestID)
		if requestID == "" {
			requestID = c.Request().Header.Get(echo.HeaderXRequestID)
		}
		row := database.SystemError{
			TenantID:  id.TenantID,
			UserID:    id.UserID,
			Status:    "pending",
			Revision:  1,
			RequestID: requestID,
			App:       "http",
			Msg:       "请求处理失败",
			Err:       fmt.Sprint(err),
			Level:     "error",
			Request:   c.Request().Method + " " + c.Path(),
			Agent:     c.Request().Header.Get("User-Agent"),
		}
		// Error persistence must never replace the original response error.
		_ = s.DB.WithContext(c.Request().Context()).Create(&row).Error
		return err
	}
}

func (s *Service) legacyChangePassword(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	if err = s.ensureIAMSchema(c.Request().Context()); err != nil {
		return err
	}
	var in struct {
		Password    string `json:"password"`
		NewPassword string `json:"newPassword"`
	}
	if err = c.Bind(&in); err != nil || len(in.Password) == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请输入当前密码和至少 8 位新密码")
	}
	policy, _, policyErr := s.securityPolicy(c)
	if policyErr != nil {
		return policyErr
	}
	if reason := validatePasswordPolicy(in.NewPassword, policy.Password); reason != "" {
		return httpx.NewError(http.StatusBadRequest, "PASSWORD_POLICY", reason)
	}
	var user database.User
	if e := s.DB.WithContext(c.Request().Context()).First(&user, id.UserID).Error; e != nil {
		return httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_TOKEN", "登录状态已失效")
	}
	var membership database.TenantMembership
	if e := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&membership).Error; e != nil {
		return httpx.NewError(http.StatusForbidden, "TENANT_ACCESS_DENIED", "当前账号不属于该租户")
	}
	current := user.PasswordHash
	if membership.PasswordHash != nil && strings.TrimSpace(*membership.PasswordHash) != "" {
		current = *membership.PasswordHash
	}
	if bcrypt.CompareHashAndPassword([]byte(current), []byte(in.Password)) != nil {
		return httpx.NewError(http.StatusBadRequest, "PASSWORD_INVALID", "当前密码错误")
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(in.NewPassword), bcrypt.DefaultCost)
	if e != nil {
		return e
	}
	hs := string(hash)
	profile, e := s.profile(c.Request().Context(), id, id.UserID)
	if e != nil {
		return e
	}
	profile.Password = &hs
	if e = s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if e := tx.Model(&membership).Updates(map[string]any{"password_hash": hs}).Error; e != nil {
			return e
		}
		return iamServiceWithDB(s, tx).saveProfile(c.Request().Context(), profile)
	}); e != nil {
		return e
	}
	// Revoke refresh sessions so an old credential cannot silently mint a new
	// access token. The current access token naturally expires at its TTL.
	now := time.Now()
	s.DB.WithContext(c.Request().Context()).Model(&database.RefreshSession{}).Where("user_id=? AND tenant_id=? AND revoked_at IS NULL", id.UserID, id.TenantID).Update("revoked_at", &now)
	return legacyOK(c, map[string]any{"updated": true})
}

func validatePasswordPolicy(value string, rules struct {
	Enabled   bool `json:"enabled"`
	MinLength int  `json:"minLength"`
	Uppercase bool `json:"uppercase"`
	Lowercase bool `json:"lowercase"`
	Number    bool `json:"number"`
	Special   bool `json:"special"`
}) string {
	if !rules.Enabled {
		return ""
	}
	if utf8.RuneCountInString(value) < rules.MinLength {
		return fmt.Sprintf("新密码至少需要 %d 个字符", rules.MinLength)
	}
	if len([]byte(value)) > 72 {
		return "新密码不能超过 72 个字节"
	}
	var upper, lower, digit, special bool
	for _, r := range value {
		upper = upper || unicode.IsUpper(r)
		lower = lower || unicode.IsLower(r)
		digit = digit || unicode.IsDigit(r)
		special = special || unicode.IsPunct(r) || unicode.IsSymbol(r)
	}
	if rules.Uppercase && !upper {
		return "新密码必须包含大写字母"
	}
	if rules.Lowercase && !lower {
		return "新密码必须包含小写字母"
	}
	if rules.Number && !digit {
		return "新密码必须包含数字"
	}
	if rules.Special && !special {
		return "新密码必须包含特殊字符"
	}
	return ""
}

func (s *Service) legacySetSelfSetting(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	// Settings are currently client-owned (theme, tab and layout preferences).
	// Accepting the payload keeps older clients compatible without persisting
	// untrusted arbitrary keys on the user record.
	return legacyOK(c, map[string]any{"updated": true})
}

func (s *Service) legacyServerInfo(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var stats runtime.MemStats
	runtime.ReadMemStats(&stats)
	return legacyOK(c, map[string]any{
		"server": map[string]any{
			"os": runtime.GOOS, "arch": runtime.GOARCH, "cpus": runtime.NumCPU(),
			"cpuUsed": nil, "memTotal": stats.Sys, "memUsed": stats.Alloc,
			"goVersion": runtime.Version(), "disks": []any{},
		},
	})
}

type securityPolicy struct {
	Version int `json:"version"`
	Captcha struct {
		Threshold    int `json:"threshold"`
		CacheSeconds int `json:"cacheSeconds"`
		Length       int `json:"length"`
		Width        int `json:"width"`
		Height       int `json:"height"`
	} `json:"captcha"`
	Password struct {
		Enabled   bool `json:"enabled"`
		MinLength int  `json:"minLength"`
		Uppercase bool `json:"uppercase"`
		Lowercase bool `json:"lowercase"`
		Number    bool `json:"number"`
		Special   bool `json:"special"`
	} `json:"password"`
	RateLimit struct {
		Enabled       bool `json:"enabled"`
		WindowSeconds int  `json:"windowSeconds"`
		MaxAttempts   int  `json:"maxAttempts"`
	} `json:"rateLimit"`
	Lockout struct {
		Enabled         bool `json:"enabled"`
		Failures        int  `json:"failures"`
		DurationMinutes int  `json:"durationMinutes"`
	} `json:"lockout"`
	Expiry struct {
		Enabled         bool `json:"enabled"`
		ForceFirstLogin bool `json:"forceFirstLogin"`
		Days            int  `json:"days"`
	} `json:"expiry"`
}

func defaultSecurityPolicy() securityPolicy {
	var p securityPolicy
	p.Version = 1
	p.Captcha.Threshold, p.Captcha.CacheSeconds, p.Captcha.Length, p.Captcha.Width, p.Captcha.Height = 0, 300, 6, 240, 80
	p.Password.Enabled, p.Password.MinLength = true, 8
	p.RateLimit.Enabled, p.RateLimit.WindowSeconds, p.RateLimit.MaxAttempts = true, 60, 10
	p.Lockout.Enabled, p.Lockout.Failures, p.Lockout.DurationMinutes = true, 5, 15
	p.Expiry.Days = 90
	return p
}

func (s *Service) securityPolicy(c *echo.Context) (securityPolicy, database.SystemParam, error) {
	tid, err := systemIdentity(c)
	if err != nil {
		return securityPolicy{}, database.SystemParam{}, err
	}
	var row database.SystemParam
	if e := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND `key`=?", tid, "security.policy").First(&row).Error; e != nil {
		if e == gorm.ErrRecordNotFound {
			return defaultSecurityPolicy(), database.SystemParam{TenantID: tid, Key: "security.policy", Name: "安全策略"}, nil
		}
		return securityPolicy{}, row, e
	}
	p := defaultSecurityPolicy()
	if strings.TrimSpace(row.Value) != "" {
		if e := json.Unmarshal([]byte(row.Value), &p); e != nil {
			return securityPolicy{}, row, httpx.NewError(http.StatusInternalServerError, "SECURITY_POLICY_INVALID", "安全策略数据无效")
		}
	}
	return p, row, nil
}

func (s *Service) legacySecurityGet(c *echo.Context) error {
	p, _, err := s.securityPolicy(c)
	if err != nil {
		return err
	}
	return legacyOK(c, p)
}

func (s *Service) legacySecuritySave(c *echo.Context) error {
	if _, err := systemIdentity(c); err != nil {
		return err
	}
	var p securityPolicy
	if err := c.Bind(&p); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "安全策略格式错误")
	}
	if p.Version < 1 {
		p.Version = 1
	}
	if p.Password.MinLength < 6 || p.Password.MinLength > 64 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "密码最小长度必须在 6 到 64 之间")
	}
	tid, _ := systemIdentity(c)
	encoded, err := json.Marshal(p)
	if err != nil {
		return err
	}
	row := database.SystemParam{}
	db := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND `key`=?", tid, "security.policy").First(&row)
	if db.Error == gorm.ErrRecordNotFound {
		row = database.SystemParam{TenantID: tid, Name: "安全策略", Key: "security.policy"}
	}
	row.Value = string(encoded)
	row.Sensitive = false
	if err := s.DB.WithContext(c.Request().Context()).Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, p)
}

func (s *Service) legacyPasswordStatus(c *echo.Context) error {
	p, _, err := s.securityPolicy(c)
	if err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"required": false, "reason": "", "rules": p.Password})
}

func systemErrorView(row database.SystemError) map[string]any {
	return map[string]any{
		"ID": row.ID, "status": row.Status, "revision": row.Revision, "resolvedAt": row.ResolvedAt, "resolvedBy": row.ResolvedBy,
		"requestId": row.RequestID, "traceId": row.TraceID, "agent": row.Agent, "app": row.App, "msg": row.Msg,
		"err": row.Err, "level": row.Level, "request": row.Request, "userID": row.UserID, "solution": row.Solution,
		"stack": row.Stack, "CreatedAt": row.CreatedAt, "UpdatedAt": row.UpdatedAt,
	}
}

func (s *Service) legacySystemErrorCreate(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in struct {
		App, Msg, Err, Stack, Level, Request string
		RequestID                            string `json:"requestId"`
		TraceID                              string `json:"traceId"`
		Agent                                string `json:"agent"`
	}
	if err := c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "错误日志格式无效")
	}
	level := strings.ToLower(strings.TrimSpace(in.Level))
	if level == "" {
		level = "error"
	}
	row := database.SystemError{TenantID: id.TenantID, UserID: id.UserID, Status: "open", Revision: 1, App: strings.TrimSpace(in.App), Msg: strings.TrimSpace(in.Msg), Err: strings.TrimSpace(in.Err), Stack: in.Stack, Level: level, Request: in.Request, RequestID: strings.TrimSpace(in.RequestID), TraceID: strings.TrimSpace(in.TraceID), Agent: strings.TrimSpace(in.Agent)}
	if err := s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, systemErrorView(row))
}

func (s *Service) legacySystemErrorList(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	pageNo, pageSize := legacyPageParams(c)
	var in map[string]any
	_ = c.Bind(&in)
	q := s.DB.WithContext(c.Request().Context()).Model(&database.SystemError{}).Where("tenant_id=?", tid)
	if value := strings.TrimSpace(stringValue(in["status"])); value != "" {
		q = q.Where("status=?", value)
	}
	if value := strings.TrimSpace(stringValue(in["app"])); value != "" {
		q = q.Where("app LIKE ?", "%"+value+"%")
	}
	if value := strings.TrimSpace(stringValue(in["level"])); value != "" {
		q = q.Where("level=?", value)
	}
	if value := strings.TrimSpace(stringValue(in["keyword"])); value != "" {
		q = q.Where("msg LIKE ? OR err LIKE ? OR request_id LIKE ?", "%"+value+"%", "%"+value+"%", "%"+value+"%")
	}
	if value := strings.TrimSpace(stringValue(in["startCreatedAt"])); value != "" {
		if parsed, e := time.Parse(time.RFC3339, value); e == nil {
			q = q.Where("created_at >= ?", parsed)
		}
	}
	if value := strings.TrimSpace(stringValue(in["endCreatedAt"])); value != "" {
		if parsed, e := time.Parse(time.RFC3339, value); e == nil {
			q = q.Where("created_at <= ?", parsed)
		}
	}
	var total int64
	if e := q.Count(&total).Error; e != nil {
		return e
	}
	var rows []database.SystemError
	if e := q.Order("id desc").Offset((pageNo - 1) * pageSize).Limit(pageSize).Find(&rows).Error; e != nil {
		return e
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, systemErrorView(row))
	}
	return legacyOK(c, map[string]any{"list": out, "page": pageNo, "pageSize": pageSize, "total": total})
}

func (s *Service) legacySystemErrorFind(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	idValue := parseUintValue(c.QueryParam("ID"))
	if idValue == 0 {
		idValue = parseUintValue(c.QueryParam("id"))
	}
	var row database.SystemError
	if idValue == 0 || s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", tid, idValue).First(&row).Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "错误日志不存在")
	}
	return legacyOK(c, map[string]any{"resysError": systemErrorView(row)})
}

func (s *Service) legacySystemErrorUpdate(c *echo.Context) error {
	tenantID, err := systemIdentity(c)
	if err != nil {
		return err
	}
	identity, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "错误日志格式无效")
	}
	idValue := number(first(in, "ID", "id"))
	if idValue == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少错误日志 ID")
	}
	var row database.SystemError
	if err = s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", tenantID, idValue).First(&row).Error; err != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "错误日志不存在")
	}
	if revision, ok := in["revision"]; ok && number(revision) > 0 && int(number(revision)) != row.Revision {
		return httpx.NewError(http.StatusConflict, "REVISION_CONFLICT", "错误日志已被其他人更新")
	}
	if value := strings.TrimSpace(stringValue(in["status"])); value != "" {
		row.Status = value
		if value == "resolved" {
			now := time.Now()
			row.ResolvedAt, row.ResolvedBy = &now, &identity.UserID
		} else {
			row.ResolvedAt, row.ResolvedBy = nil, nil
		}
	}
	if value, ok := in["solution"]; ok {
		row.Solution = stringValue(value)
	}
	row.Revision++
	if err = s.DB.WithContext(c.Request().Context()).Save(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, systemErrorView(row))
}

func (s *Service) legacySystemErrorDelete(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	idsValue := parseIDs(c, "ID", "ids", "IDs[]")
	if len(idsValue) == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少错误日志 ID")
	}
	result := s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id IN ?", tid, idsValue).Delete(&database.SystemError{})
	return legacyOK(c, map[string]any{"deleted": result.RowsAffected})
}

func (s *Service) legacySystemErrorSolution(c *echo.Context) error {
	tid, err := systemIdentity(c)
	if err != nil {
		return err
	}
	idValue := parseUintValue(c.QueryParam("ID"))
	if idValue == 0 {
		idValue = parseUintValue(c.QueryParam("id"))
	}
	var row database.SystemError
	if idValue == 0 || s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=?", tid, idValue).First(&row).Error != nil {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "错误日志不存在")
	}
	return legacyOK(c, map[string]any{"solution": row.Solution})
}

func (s *Service) apiTokenAdmin(c *echo.Context) (tenantID uint64, err error) {
	id, err := identityFrom(c)
	if err != nil {
		return 0, err
	}
	if claims, ok := c.Get("claims").(Claims); ok && isScopedAPIToken(ok, claims) {
		return 0, httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "API 令牌不能管理 API 令牌")
	}
	if !id.PlatformAdmin {
		return 0, httpx.NewError(http.StatusForbidden, "AUTH_FORBIDDEN", "仅平台管理员可以管理 API 令牌")
	}
	return id.TenantID, nil
}

func (s *Service) legacyAPITokenCreate(c *echo.Context) error {
	tid, err := s.apiTokenAdmin(c)
	if err != nil {
		return err
	}
	var in struct {
		UserID      uint64 `json:"userId"`
		AuthorityID uint64 `json:"authorityId"`
		Days        int    `json:"days"`
		Remark      string `json:"remark"`
	}
	if err = c.Bind(&in); err != nil || in.UserID == 0 || in.AuthorityID == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "请选择用户和角色")
	}
	var membership database.TenantMembership
	if s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND user_id=? AND status=?", tid, in.UserID, "active").First(&membership).Error != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "用户不属于当前租户")
	}
	var role database.Role
	if s.DB.WithContext(c.Request().Context()).Where("tenant_id=? AND id=? AND status=?", tid, in.AuthorityID, "active").First(&role).Error != nil {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "角色不存在")
	}
	var assigned int64
	if err = s.DB.WithContext(c.Request().Context()).Table("role_memberships").Where("tenant_id=? AND role_id=? AND user_id=?", tid, role.ID, in.UserID).Count(&assigned).Error; err != nil {
		return err
	}
	if assigned == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "该用户尚未拥有所选角色")
	}
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return err
	}
	clear := "gea_" + hex.EncodeToString(raw)
	var expires *time.Time
	if in.Days >= 0 {
		now := time.Now().Add(time.Duration(in.Days) * 24 * time.Hour)
		expires = &now
	}
	row := database.APIToken{TenantID: tid, UserID: in.UserID, AuthorityID: in.AuthorityID, TokenHash: hashToken(clear), ExpiresAt: expires, Remark: strings.TrimSpace(in.Remark)}
	if err = s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"token": clear, "ID": row.ID, "expiresAt": row.ExpiresAt})
}

func (s *Service) legacyAPITokenList(c *echo.Context) error {
	tid, err := s.apiTokenAdmin(c)
	if err != nil {
		return err
	}
	pageNo, pageSize := legacyPageParams(c)
	var total int64
	q := s.DB.WithContext(c.Request().Context()).Model(&database.APIToken{}).Where("tenant_id=?", tid)
	if err = q.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.APIToken
	if err = q.Order("id desc").Offset((pageNo - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		var user database.User
		_ = s.DB.WithContext(c.Request().Context()).Select("username").First(&user, row.UserID).Error
		active := row.RevokedAt == nil && (row.ExpiresAt == nil || row.ExpiresAt.After(time.Now()))
		items = append(items, map[string]any{"ID": row.ID, "userId": row.UserID, "userName": user.Username, "authorityId": row.AuthorityID, "expiresAt": row.ExpiresAt, "status": active, "remark": row.Remark, "CreatedAt": row.CreatedAt, "UpdatedAt": row.UpdatedAt})
	}
	return legacyOK(c, map[string]any{"list": items, "page": pageNo, "pageSize": pageSize, "total": total})
}

func (s *Service) legacyAPITokenDelete(c *echo.Context) error {
	tid, err := s.apiTokenAdmin(c)
	if err != nil {
		return err
	}
	var in map[string]any
	_ = c.Bind(&in)
	idValue := number(first(in, "ID", "id"))
	if idValue == 0 {
		idValue = parseUintValue(c.QueryParam("ID"))
	}
	if idValue == 0 {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "缺少令牌 ID")
	}
	now := time.Now()
	result := s.DB.WithContext(c.Request().Context()).Model(&database.APIToken{}).Where("tenant_id=? AND id=? AND revoked_at IS NULL", tid, idValue).Update("revoked_at", &now)
	if result.RowsAffected == 0 {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "令牌不存在或已作废")
	}
	return legacyOK(c, map[string]any{"revoked": true})
}
