package admin

// This file contains the write side of the legacy API used by the reference
// frontend.  It deliberately keeps tenant-scoped profile data separate from
// database.User: a username may be shared by memberships, while a nickname,
// status, and password must never leak across tenants.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ensureIAMSchema is intentionally idempotent. These compatibility columns
// are additive, so old installations can upgrade without a destructive
// migration and the canonical tables remain unchanged.
func (s *Service) ensureIAMSchema(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS iam_user_profiles (tenant_id BIGINT NOT NULL, user_id BIGINT NOT NULL, nickname VARCHAR(120) NOT NULL DEFAULT '', phone VARCHAR(32) NOT NULL DEFAULT '', email VARCHAR(190), avatar VARCHAR(512) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'active', password_hash VARCHAR(255), PRIMARY KEY (tenant_id,user_id))`,
		`CREATE TABLE IF NOT EXISTS iam_menu_settings (tenant_id BIGINT NOT NULL, menu_id BIGINT NOT NULL, title VARCHAR(120) NOT NULL DEFAULT '', icon VARCHAR(120) NOT NULL DEFAULT '', keep_alive BOOLEAN NOT NULL DEFAULT TRUE, default_menu BOOLEAN NOT NULL DEFAULT FALSE, close_tab BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (tenant_id,menu_id))`,
		`CREATE TABLE IF NOT EXISTS iam_role_settings (tenant_id BIGINT NOT NULL, role_id BIGINT NOT NULL, parent_id BIGINT NULL, default_router VARCHAR(255) NOT NULL DEFAULT '', data_authority_ids TEXT, data_scope VARCHAR(40) NOT NULL DEFAULT 'all', PRIMARY KEY (tenant_id,role_id))`,
	}
	for _, statement := range stmts {
		if err := s.DB.WithContext(ctx).Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}

type iamProfile struct {
	TenantID uint64
	UserID   uint64
	Nickname string
	Phone    string
	Email    *string
	Avatar   string
	Status   string
	Password *string `gorm:"column:password_hash"`
}

func (s *Service) profile(ctx context.Context, id tenant.Identity, userID uint64) (iamProfile, error) {
	var p iamProfile
	err := s.DB.WithContext(ctx).Table("iam_user_profiles").Where("tenant_id = ? AND user_id = ?", id.TenantID, userID).First(&p).Error
	if err == gorm.ErrRecordNotFound {
		return iamProfile{TenantID: id.TenantID, UserID: userID, Status: "active"}, nil
	}
	return p, err
}

func (s *Service) saveProfile(ctx context.Context, p iamProfile) error {
	var existing iamProfile
	db := s.DB.WithContext(ctx).Table("iam_user_profiles").Where("tenant_id=? AND user_id=?", p.TenantID, p.UserID).First(&existing)
	if db.Error == nil {
		values := map[string]any{"nickname": p.Nickname, "phone": p.Phone, "email": p.Email, "avatar": p.Avatar, "status": p.Status}
		if p.Password != nil {
			values["password_hash"] = p.Password
		}
		return s.DB.WithContext(ctx).Table("iam_user_profiles").Where("tenant_id=? AND user_id=?", p.TenantID, p.UserID).Updates(values).Error
	}
	if db.Error != gorm.ErrRecordNotFound {
		return db.Error
	}
	return s.DB.WithContext(ctx).Exec(`INSERT INTO iam_user_profiles (tenant_id,user_id,nickname,phone,email,avatar,status,password_hash) VALUES (?,?,?,?,?,?,?,?)`, p.TenantID, p.UserID, p.Nickname, p.Phone, p.Email, p.Avatar, p.Status, p.Password).Error
}

func iamServiceWithDB(s *Service, db *gorm.DB) *Service {
	copy := *s
	copy.DB = &database.DB{DB: db}
	return &copy
}

func number(v any) uint64 {
	switch x := v.(type) {
	case float64:
		return uint64(x)
	case int:
		return uint64(x)
	case int64:
		return uint64(x)
	case uint64:
		return x
	case string:
		n, _ := strconv.ParseUint(x, 10, 64)
		return n
	}
	return 0
}
func stringValue(v any) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(v))
}

// roleDisplayName keeps the built-in roles readable for the Chinese-only
// administration UI, including installations created before the role names
// were localized. Custom role names are always preserved.
func roleDisplayName(code, name string) string {
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "platform_admin":
		return "平台管理员"
	case "tenant_admin":
		return "租户管理员"
	default:
		return name
	}
}
func ids(v any) []uint64 {
	var out []uint64
	if a, ok := v.([]any); ok {
		for _, x := range a {
			if n := number(x); n > 0 {
				out = append(out, n)
			}
		}
	}
	if a, ok := v.([]uint64); ok {
		out = append(out, a...)
	}
	if a, ok := v.([]int); ok {
		for _, x := range a {
			if x > 0 {
				out = append(out, uint64(x))
			}
		}
	}
	return out
}

func roleInput(in map[string]any) ([]uint64, bool) {
	for _, key := range []string{"authorityIds", "authorityIDs"} {
		if value, ok := in[key]; ok {
			return ids(value), true
		}
	}
	if value, ok := in["authorityId"]; ok {
		if roleID := number(value); roleID > 0 {
			return []uint64{roleID}, true
		}
		return []uint64{}, true
	}
	return nil, false
}

// legacyUser is consumed by the reference frontend's UserPage and user info
// endpoint. It merges the global identity with tenant-local profile and roles.
func (s *Service) legacyUser(ctx context.Context, user UserView, tenantView *TenantView) map[string]any {
	uid, _ := strconv.ParseUint(user.ID, 10, 64)
	tid, _ := strconv.ParseUint(tenantView.ID, 10, 64)
	var p iamProfile
	hasProfile := s.DB.WithContext(ctx).Table("iam_user_profiles").Where("tenant_id = ? AND user_id = ?", tid, uid).First(&p).Error == nil
	if p.Status == "" {
		p.Status = user.Status
		if p.Status == "" {
			p.Status = "active"
		}
	}
	var roles []database.Role
	s.DB.WithContext(ctx).Table("roles r").Joins("JOIN role_memberships rm ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id").Where("rm.user_id=? AND rm.tenant_id=? AND r.status='active'", uid, tid).Order("r.id asc").Find(&roles)
	authorities := make([]map[string]any, 0, len(roles))
	for _, r := range roles {
		authorities = append(authorities, map[string]any{"authorityId": r.ID, "authorityName": roleDisplayName(r.Code, r.Name), "code": r.Code, "parentId": nil, "defaultRouter": "仪表盘"})
	}
	var primary map[string]any
	if len(authorities) > 0 {
		primary = authorities[0]
	}
	enable := 1
	if p.Status != "active" {
		enable = 2
	}
	email := user.Email
	if hasProfile {
		email = optionalString(p.Email)
	}
	nickname := user.Nickname
	if hasProfile {
		nickname = p.Nickname
	}
	phone := user.Phone
	if hasProfile {
		phone = p.Phone
	}
	avatar := user.Avatar
	if hasProfile {
		avatar = p.Avatar
	}
	return map[string]any{"ID": uid, "uuid": user.ID, "userName": user.Username, "nickName": nickname, "headerImg": avatar, "phone": phone, "email": email, "enable": enable, "authorityId": numberMap(primary, "authorityId"), "authority": primary, "authorities": authorities}
}
func numberMap(m map[string]any, key string) uint64 {
	if m == nil {
		return 0
	}
	return number(m[key])
}

func (s *Service) legacyRegister(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	ctx := c.Request().Context()
	if err = s.ensureIAMSchema(ctx); err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return httpx.NewError(400, "VALIDATION_ERROR", "请求参数无效")
	}
	username := stringValue(first(in, "userName", "username"))
	password := stringValue(first(in, "passWord", "password"))
	if username == "" || len(password) < 8 {
		return httpx.NewError(400, "VALIDATION_ERROR", "用户名不能为空，密码长度至少为 8 位")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	hs := string(hash)
	var u database.User
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		ts := iamServiceWithDB(s, tx)
		e := tx.Where("username = ?", username).First(&u).Error
		if e != nil && e != gorm.ErrRecordNotFound {
			return e
		}
		if e == gorm.ErrRecordNotFound {
			// Contact and display fields belong to this tenant's profile.
			u = database.User{Username: username, PasswordHash: hs, Status: "active"}
			if e = tx.Create(&u).Error; e != nil {
				return httpx.NewError(409, "USER_EXISTS", "用户名已存在")
			}
		}
		var count int64
		if e = tx.Model(&database.TenantMembership{}).Where("tenant_id=? AND user_id=?", id.TenantID, u.ID).Count(&count).Error; e != nil {
			return e
		}
		if count > 0 {
			return httpx.NewError(409, "USER_EXISTS", "该租户中用户名已存在")
		}
		m := database.TenantMembership{TenantID: id.TenantID, UserID: u.ID, Status: "active", PasswordHash: &hs}
		if e = tx.Create(&m).Error; e != nil {
			return e
		}
		email := stringValue(in["email"])
		var ep *string
		if email != "" {
			ep = &email
		}
		if e = ts.saveProfile(ctx, iamProfile{TenantID: id.TenantID, UserID: u.ID, Nickname: stringValue(first(in, "nickName", "nickname")), Phone: stringValue(in["phone"]), Email: ep, Avatar: stringValue(first(in, "headerImg", "avatar")), Status: "active", Password: &hs}); e != nil {
			return e
		}
		roles := ids(in["authorityIds"])
		if len(roles) == 0 {
			if rid := number(in["authorityId"]); rid > 0 {
				roles = []uint64{rid}
			}
		}
		return ts.replaceUserRoles(ctx, id, u.ID, roles)
	})
	if err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"user": s.legacyUser(ctx, userView(u), &TenantView{ID: fmt.Sprint(id.TenantID)})})
}

func first(m map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			return v
		}
	}
	return nil
}

func (s *Service) tenantUser(c *echo.Context, uid uint64) (database.User, database.TenantMembership, iamProfile, error) {
	id, err := identityFrom(c)
	if err != nil {
		return database.User{}, database.TenantMembership{}, iamProfile{}, err
	}
	var u database.User
	if e := s.DB.WithContext(c.Request().Context()).First(&u, uid).Error; e != nil {
		return u, database.TenantMembership{}, iamProfile{}, httpx.NewError(404, "NOT_FOUND", "用户不存在")
	}
	var m database.TenantMembership
	if e := s.DB.Where("tenant_id=? AND user_id=?", id.TenantID, uid).First(&m).Error; e != nil {
		return u, m, iamProfile{}, httpx.NewError(404, "NOT_FOUND", "用户不属于当前租户")
	}
	p, e := s.profile(c.Request().Context(), id, uid)
	return u, m, p, e
}

func (s *Service) legacySetUserInfo(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	if err = s.ensureIAMSchema(c.Request().Context()); err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	uid := number(first(in, "ID", "id"))
	if uid == 0 {
		return httpx.NewError(400, "VALIDATION_ERROR", "用户 ID 无效")
	}
	u, m, p, err := s.tenantUser(c, uid)
	if err != nil {
		return err
	}
	_ = m
	if _, ok := in["nickName"]; ok {
		p.Nickname = stringValue(in["nickName"])
	} else if _, ok := in["nickname"]; ok {
		p.Nickname = stringValue(in["nickname"])
	}
	if v, ok := in["phone"]; ok {
		p.Phone = stringValue(v)
	}
	if v, ok := in["email"]; ok {
		e := stringValue(v)
		if e == "" {
			p.Email = nil
		} else {
			p.Email = &e
		}
	}
	if _, ok := in["headerImg"]; ok {
		p.Avatar = stringValue(in["headerImg"])
	} else if _, ok := in["avatar"]; ok {
		p.Avatar = stringValue(in["avatar"])
	}
	if v, ok := in["enable"]; ok {
		if number(v) == 1 {
			p.Status = "active"
		} else if number(v) == 2 {
			p.Status = "disabled"
		}
	}
	if p.Status == "disabled" && s.isLastTenantAdmin(c.Request().Context(), id, uid) {
		return httpx.NewError(409, "LAST_ADMIN", "不能停用当前租户最后一个管理员")
	}
	ctx := c.Request().Context()
	err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		ts := iamServiceWithDB(s, tx)
		m.Status = p.Status
		if err := tx.Save(&m).Error; err != nil {
			return err
		}
		if err := ts.saveProfile(ctx, p); err != nil {
			return err
		}
		if roles, provided := roleInput(in); provided {
			if err := ts.replaceUserRoles(ctx, id, uid, roles); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return legacyOK(c, s.legacyUser(c.Request().Context(), userView(u), &TenantView{ID: fmt.Sprint(id.TenantID)}))
}

// legacySetSelfInfo is deliberately separate from the administrative update.
// The authenticated tenant identity selects the record, and the field allowlist
// prevents this route from changing membership status or role assignments.
func (s *Service) legacySetSelfInfo(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err := c.Bind(&in); err != nil {
		return err
	}
	for key := range in {
		switch key {
		case "nickName", "nickname", "phone", "email", "headerImg", "avatar":
		default:
			return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "个人资料只能修改昵称、电话、邮箱和头像")
		}
	}
	if err := s.ensureIAMSchema(c.Request().Context()); err != nil {
		return err
	}
	u, _, p, err := s.tenantUser(c, id.UserID)
	if err != nil {
		return err
	}
	if value, ok := in["nickName"]; ok {
		p.Nickname = stringValue(value)
	} else if value, ok := in["nickname"]; ok {
		p.Nickname = stringValue(value)
	}
	if value, ok := in["phone"]; ok {
		p.Phone = stringValue(value)
	}
	if value, ok := in["email"]; ok {
		email := stringValue(value)
		p.Email = nil
		if email != "" {
			p.Email = &email
		}
	}
	if value, ok := in["headerImg"]; ok {
		p.Avatar = stringValue(value)
	} else if value, ok := in["avatar"]; ok {
		p.Avatar = stringValue(value)
	}
	if err := s.saveProfile(c.Request().Context(), p); err != nil {
		return err
	}
	return legacyOK(c, s.legacyUser(c.Request().Context(), userView(u), &TenantView{ID: fmt.Sprint(id.TenantID)}))
}

func (s *Service) legacyDeleteUser(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	uid := number(first(in, "ID", "id"))
	u, _, _, err := s.tenantUser(c, uid)
	if err != nil {
		return err
	}
	if s.isLastTenantAdmin(c.Request().Context(), id, uid) {
		return httpx.NewError(409, "LAST_ADMIN", "不能删除当前租户最后一个管理员")
	}
	ctx := c.Request().Context()
	if err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id=? AND user_id=?", id.TenantID, uid).Delete(&database.RoleMembership{}).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM iam_user_profiles WHERE tenant_id=? AND user_id=?", id.TenantID, uid).Error; err != nil {
			return err
		}
		return tx.Where("tenant_id=? AND user_id=?", id.TenantID, uid).Delete(&database.TenantMembership{}).Error
	}); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"deleted": true, "user": u.Username})
}

func (s *Service) legacyResetPassword(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var err error
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	uid := number(first(in, "ID", "id"))
	password := stringValue(in["password"])
	if uid == 0 || len(password) < 8 {
		return httpx.NewError(400, "VALIDATION_ERROR", "密码长度至少为 8 位")
	}
	_, m, p, err := s.tenantUser(c, uid)
	if err != nil {
		return err
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	hs := string(hash)
	p.Password = &hs
	m.PasswordHash = &hs
	ctx := c.Request().Context()
	if err = s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&m).Error; err != nil {
			return err
		}
		return iamServiceWithDB(s, tx).saveProfile(ctx, p)
	}); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}

func (s *Service) replaceUserRoles(ctx context.Context, id tenant.Identity, userID uint64, roleIDs []uint64) error {
	roleIDs = unique(roleIDs)
	var roles []database.Role
	if len(roleIDs) > 0 {
		if e := s.DB.WithContext(ctx).Where("tenant_id=? AND id IN ?", id.TenantID, roleIDs).Find(&roles).Error; e != nil {
			return e
		}
		if len(roles) != len(roleIDs) {
			return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "角色不属于当前租户")
		}
	}
	hasTenantAdmin := false
	for _, r := range roles {
		if r.Code == "platform_admin" {
			// The user editor submits the complete role selection, including the
			// platform role already held by a platform operator. Preserve that
			// existing assignment while still rejecting attempts to grant the
			// protected role to another user.
			var existing int64
			s.DB.WithContext(ctx).Model(&database.RoleMembership{}).
				Where("tenant_id=? AND role_id=? AND user_id=?", id.TenantID, r.ID, userID).
				Count(&existing)
			if existing == 0 {
				return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "不能分配平台管理员角色")
			}
		}
		if r.Code == "tenant_admin" {
			hasTenantAdmin = true
		}
	}
	if !hasTenantAdmin && s.isLastTenantAdmin(ctx, id, userID) {
		return httpx.NewError(409, "LAST_ADMIN", "至少保留一个管理员")
	}
	return s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id=? AND user_id=?", id.TenantID, userID).Delete(&database.RoleMembership{}).Error; err != nil {
			return err
		}
		for _, r := range roles {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&database.RoleMembership{TenantID: id.TenantID, RoleID: r.ID, UserID: userID}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
func unique(in []uint64) []uint64 {
	m := map[uint64]bool{}
	out := []uint64{}
	for _, x := range in {
		if x > 0 && !m[x] {
			m[x] = true
			out = append(out, x)
		}
	}
	return out
}
func (s *Service) isLastTenantAdmin(ctx context.Context, id tenant.Identity, userID uint64) bool {
	var admin database.Role
	if s.DB.WithContext(ctx).Where("tenant_id=? AND code='tenant_admin'", id.TenantID).First(&admin).Error != nil {
		return false
	}
	var n int64
	s.DB.WithContext(ctx).Table("role_memberships rm").Joins("JOIN tenant_memberships tm ON tm.user_id=rm.user_id AND tm.tenant_id=rm.tenant_id").Joins("JOIN users u ON u.id=rm.user_id").Joins("LEFT JOIN iam_user_profiles p ON p.user_id=rm.user_id AND p.tenant_id=rm.tenant_id").Where("rm.tenant_id=? AND rm.role_id=? AND tm.status='active' AND u.status='active' AND COALESCE(p.status,'active')='active' AND rm.user_id<>?", id.TenantID, admin.ID, userID).Count(&n)
	var own int64
	s.DB.WithContext(ctx).Table("role_memberships rm").Where("rm.tenant_id=? AND rm.role_id=? AND rm.user_id=?", id.TenantID, admin.ID, userID).Count(&own)
	return own > 0 && n == 0
}

func (s *Service) legacySetUserAuthorities(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	uid := number(first(in, "ID", "id"))
	roles := ids(first(in, "authorityIds", "authorityIDs"))
	if _, _, _, err = s.tenantUser(c, uid); err != nil {
		return err
	}
	if err = s.replaceUserRoles(c.Request().Context(), id, uid, roles); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}

func (s *Service) legacyRoleMutation(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	rid := number(first(in, "authorityId", "ID", "id"))
	if c.Request().Method != http.MethodPut {
		// The reference create form calls this field authorityId, but it is a
		// client supplied display/code seed rather than an existing DB primary key.
		rid = 0
	}
	name := stringValue(first(in, "authorityName", "name"))
	code := stringValue(first(in, "authorityCode", "code"))
	parentID := number(first(in, "parentId", "parent_id"))
	defaultRouter := stringValue(in["defaultRouter"])
	var r database.Role
	existingErr := s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&r).Error
	if c.Request().Method == "PUT" {
		if rid == 0 || existingErr != nil {
			return httpx.NewError(404, "NOT_FOUND", "角色不存在")
		}
		if r.Code == "platform_admin" || r.Code == "tenant_admin" {
			return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "内置角色不能修改")
		}
		if name != "" {
			r.Name = name
		}
		if code != "" {
			r.Code = code
		}
		if v, ok := in["description"]; ok {
			r.Description = stringValue(v)
		}
	} else {
		if existingErr == nil {
			return httpx.NewError(409, "ROLE_EXISTS", "角色 ID 已存在")
		}
		if name == "" {
			return httpx.NewError(400, "VALIDATION_ERROR", "角色名称必填")
		}
		if code == "" && rid > 0 {
			code = fmt.Sprintf("role_%d", rid)
		}
		if code == "" {
			code = roleCode(name)
		}
		if code == "platform_admin" || code == "tenant_admin" {
			return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "不能新建内置特权角色")
		}
		r = database.Role{ID: rid, TenantID: id.TenantID, Name: name, Code: code, Description: stringValue(in["description"]), Status: "active"}
	}
	if r.Code == "platform_admin" || r.Code == "tenant_admin" {
		return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "内置角色不能修改")
	}
	if err = s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if e := tx.Save(&r).Error; e != nil {
			return httpx.NewError(409, "ROLE_EXISTS", "角色编码或名称已存在")
		}
		var parent *uint64
		if parentID > 0 {
			var p database.Role
			if e := tx.Where("tenant_id=? AND id=?", id.TenantID, parentID).First(&p).Error; e != nil {
				return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "父角色不属于当前租户")
			}
			parent = &parentID
		}
		var setting database.IAMRoleSetting
		if tx.Where("tenant_id=? AND role_id=?", id.TenantID, r.ID).First(&setting).Error != nil {
			setting = database.IAMRoleSetting{TenantID: id.TenantID, RoleID: r.ID}
		}
		setting.ParentID, setting.DefaultRouter = parent, defaultRouter
		return tx.Save(&setting).Error
	}); err != nil {
		return err
	}
	return legacyOK(c, s.iamRoleView(c.Request().Context(), id, r))
}

func roleCode(name string) string {
	value := strings.ToLower(strings.TrimSpace(name))
	value = strings.NewReplacer(" ", "_", "/", "_", "-", "_").Replace(value)
	if value == "" {
		return "role"
	}
	return "role_" + value
}
func (s *Service) legacyRoleDelete(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	rid := number(first(in, "authorityId", "ID", "id"))
	var r database.Role
	if e := s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&r).Error; e != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	if r.Code == "tenant_admin" || r.Code == "platform_admin" {
		return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "内置角色不能删除")
	}
	var n int64
	s.DB.Model(&database.RoleMembership{}).Where("tenant_id=? AND role_id=?", id.TenantID, rid).Count(&n)
	if n > 0 {
		return httpx.NewError(409, "ROLE_IN_USE", "角色仍被用户使用")
	}
	if err := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id=? AND role_id=?", id.TenantID, rid).Delete(&database.RoleMenu{}).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM iam_role_settings WHERE tenant_id=? AND role_id=?", id.TenantID, rid).Error; err != nil {
			return err
		}
		return tx.Delete(&r).Error
	}); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"deleted": true})
}

func (s *Service) legacyRoleCopy(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	authority, _ := in["authority"].(map[string]any)
	oldID := number(first(in, "oldAuthorityId", "authorityId"))
	if oldID == 0 {
		oldID = number(first(authority, "authorityId", "ID", "id"))
	}
	var old database.Role
	if err = s.DB.Where("tenant_id=? AND id=?", id.TenantID, oldID).First(&old).Error; err != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	if old.Code == "platform_admin" || old.Code == "tenant_admin" {
		return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "内置角色不能复制")
	}
	name := stringValue(first(in, "authorityName", "name"))
	if name == "" {
		name = stringValue(first(authority, "authorityName", "name"))
	}
	if name == "" {
		name = old.Name + "副本"
	}
	code := stringValue(first(in, "authorityCode", "code"))
	if code == "" {
		code = stringValue(first(authority, "authorityCode", "code"))
	}
	if code == "" {
		code = old.Code + "_copy"
	}
	if code == "platform_admin" || code == "tenant_admin" {
		return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "不能复制为内置特权角色")
	}
	copyRole := database.Role{ID: number(first(authority, "authorityId", "ID", "id")), TenantID: id.TenantID, Name: name, Code: code, Description: old.Description, Status: "active"}
	if err = s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if e := tx.Create(&copyRole).Error; e != nil {
			return httpx.NewError(409, "ROLE_EXISTS", "角色编码或名称已存在")
		}
		var menus []database.RoleMenu
		if e := tx.Where("tenant_id=? AND role_id=?", id.TenantID, old.ID).Find(&menus).Error; e != nil {
			return e
		}
		for _, rm := range menus {
			if e := tx.Create(&database.RoleMenu{TenantID: id.TenantID, RoleID: copyRole.ID, MenuID: rm.MenuID}).Error; e != nil {
				return e
			}
		}
		var setting database.IAMRoleSetting
		if tx.Where("tenant_id=? AND role_id=?", id.TenantID, old.ID).First(&setting).Error == nil {
			setting.RoleID = copyRole.ID
			setting.ParentID = nil
			if e := tx.Create(&setting).Error; e != nil {
				return e
			}
		}
		return nil
	}); err != nil {
		return err
	}
	return legacyOK(c, s.iamRoleView(c.Request().Context(), id, copyRole))
}
func (s *Service) iamRoleView(ctx context.Context, id tenant.Identity, r database.Role) map[string]any {
	var users int64
	s.DB.WithContext(ctx).Model(&database.RoleMembership{}).Where("tenant_id=? AND role_id=?", id.TenantID, r.ID).Count(&users)
	var setting database.IAMRoleSetting
	_ = s.DB.WithContext(ctx).Where("tenant_id=? AND role_id=?", id.TenantID, r.ID).First(&setting).Error
	parentID := any(nil)
	if setting.ParentID != nil {
		parentID = *setting.ParentID
	}
	defaultRouter := setting.DefaultRouter
	if defaultRouter == "" {
		defaultRouter = "仪表盘"
	}
	dataIDs := []uint64{}
	if setting.DataAuthorityIDs != "" {
		_ = json.Unmarshal([]byte(setting.DataAuthorityIDs), &dataIDs)
	}
	dataAuthority := make([]map[string]any, 0, len(dataIDs))
	if len(dataIDs) > 0 {
		var roles []database.Role
		s.DB.WithContext(ctx).Where("tenant_id=? AND id IN ?", id.TenantID, dataIDs).Find(&roles)
		byID := map[uint64]database.Role{}
		for _, role := range roles {
			byID[role.ID] = role
		}
		for _, roleID := range dataIDs {
			if role, ok := byID[roleID]; ok {
				dataAuthority = append(dataAuthority, map[string]any{"ID": role.ID, "authorityId": role.ID, "authorityName": roleDisplayName(role.Code, role.Name), "code": role.Code, "parentId": nil, "defaultRouter": "仪表盘", "children": []any{}})
			}
		}
	}
	return map[string]any{"ID": r.ID, "authorityId": r.ID, "authorityName": roleDisplayName(r.Code, r.Name), "code": r.Code, "status": r.Status, "description": r.Description, "parentId": parentID, "defaultRouter": defaultRouter, "dataAuthorityId": dataAuthority, "children": []any{}, "userCount": users}
}
func (s *Service) legacyRoleUsers(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	rid := number(c.QueryParam("authorityId"))
	if rid == 0 {
		var in map[string]any
		_ = c.Bind(&in)
		rid = number(in["authorityId"])
	}
	var r database.Role
	if s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&r).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	var users []uint64
	s.DB.WithContext(c.Request().Context()).Table("role_memberships rm").Joins("JOIN tenant_memberships tm ON tm.user_id=rm.user_id AND tm.tenant_id=rm.tenant_id").Joins("JOIN users u ON u.id=rm.user_id").Joins("LEFT JOIN iam_user_profiles p ON p.user_id=rm.user_id AND p.tenant_id=rm.tenant_id").Where("rm.tenant_id=? AND rm.role_id=? AND tm.status='active' AND u.status='active' AND COALESCE(p.status,'active')='active'", id.TenantID, rid).Order("rm.user_id asc").Pluck("rm.user_id", &users)
	if users == nil {
		users = []uint64{}
	}
	return legacyOK(c, users)
}
func (s *Service) legacySetRoleUsers(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var in map[string]any
	if err = c.Bind(&in); err != nil {
		return err
	}
	rid := number(in["authorityId"])
	roleIDs := ids(first(in, "userIds", "userIDs"))
	var r database.Role
	if s.DB.Where("tenant_id=? AND id=?", id.TenantID, rid).First(&r).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "角色不存在")
	}
	if r.Code == "platform_admin" {
		// The role-user editor submits the current selection even when the
		// operator made no changes. Allow that exact no-op while keeping the
		// protected platform assignment immutable.
		requested := map[uint64]struct{}{}
		for _, uid := range unique(roleIDs) {
			requested[uid] = struct{}{}
		}
		var currentIDs []uint64
		s.DB.WithContext(c.Request().Context()).Model(&database.RoleMembership{}).
			Where("tenant_id=? AND role_id=?", id.TenantID, rid).Pluck("user_id", &currentIDs)
		current := map[uint64]struct{}{}
		for _, uid := range currentIDs {
			current[uid] = struct{}{}
		}
		if len(requested) == len(current) {
			same := true
			for uid := range requested {
				if _, ok := current[uid]; !ok {
					same = false
					break
				}
			}
			if same {
				return legacyOK(c, map[string]any{"updated": true})
			}
		}
		return httpx.NewError(403, "BUILTIN_ROLE_PROTECTED", "不能分配平台角色")
	}
	roleIDs = unique(roleIDs)
	var valid int64
	s.DB.WithContext(c.Request().Context()).Table("tenant_memberships tm").Joins("JOIN users u ON u.id=tm.user_id").Joins("LEFT JOIN iam_user_profiles p ON p.user_id=tm.user_id AND p.tenant_id=tm.tenant_id").Where("tm.tenant_id=? AND tm.user_id IN ? AND tm.status='active' AND u.status='active' AND COALESCE(p.status,'active')='active'", id.TenantID, roleIDs).Count(&valid)
	if valid != int64(len(unique(roleIDs))) {
		return httpx.NewError(400, "CROSS_TENANT_REFERENCE", "用户不属于当前租户")
	}
	if r.Code == "tenant_admin" && valid == 0 {
		return httpx.NewError(409, "LAST_ADMIN", "至少保留一个管理员")
	}
	if err := s.DB.WithContext(c.Request().Context()).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id=? AND role_id=?", id.TenantID, rid).Delete(&database.RoleMembership{}).Error; err != nil {
			return err
		}
		for _, uid := range roleIDs {
			if err := tx.Create(&database.RoleMembership{TenantID: id.TenantID, RoleID: rid, UserID: uid}).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"updated": true})
}

// RegisterLegacyIAMRoutes adds the write endpoints used by the reference UI.
// The caller supplies the already-authenticated legacy group.
func RegisterLegacyIAMRoutes(g *echo.Group, s *Service) {
	g.POST("/user/admin_register", s.legacyRegister, s.RequirePermission("user:create"))
	g.PUT("/user/setUserInfo", s.legacySetUserInfo, s.RequirePermission("user:update"))
	g.PUT("/user/setSelfInfo", s.legacySetSelfInfo)
	g.DELETE("/user/deleteUser", s.legacyDeleteUser, s.RequirePermission("user:delete"))
	g.POST("/user/resetPassword", s.legacyResetPassword, s.RequirePermission("user:update"))
	g.POST("/user/setUserAuthority", s.legacySetUserAuthorities, s.RequirePermission("user:update"))
	g.POST("/user/setUserAuthorities", s.legacySetUserAuthorities, s.RequirePermission("user:update"))
	g.POST("/authority/createAuthority", s.legacyRoleMutation, s.RequirePermission("role:create"))
	g.PUT("/authority/updateAuthority", s.legacyRoleMutation, s.RequirePermission("role:update"))
	g.POST("/authority/deleteAuthority", s.legacyRoleDelete, s.RequirePermission("role:delete"))
	g.POST("/authority/copyAuthority", s.legacyRoleCopy, s.RequirePermission("role:create"))
	g.GET("/authority/getUsersByAuthority", s.legacyRoleUsers, s.RequirePermission("role:list"))
	g.POST("/authority/setRoleUsers", s.legacySetRoleUsers, s.RequirePermission("role:update"))
	g.POST("/menu/addBaseMenu", s.legacyMenuMutation, s.RequirePermission("menu:create"))
	g.POST("/menu/updateBaseMenu", s.legacyMenuMutation, s.RequirePermission("menu:update"))
	g.POST("/menu/deleteBaseMenu", s.legacyMenuDelete, s.RequirePermission("menu:delete"))
	g.POST("/menu/getBaseMenuById", s.legacyMenuDetail, s.RequirePermission("menu:list"))
	g.GET("/menu/getMenuRoles", s.legacyMenuRoles, s.RequirePermission("menu:list"))
	g.POST("/menu/setMenuRoles", s.legacySetMenuRoles, s.RequirePermission("menu:update"))
	g.POST("/menu/getMenuAuthority", s.legacyMenuAuthority, s.RequirePermission("menu:list"))
	g.POST("/menu/addMenuAuthority", s.legacyMenuAuthority, s.RequirePermission("menu:update"))
	g.POST("/authority/setDataAuthority", s.legacyAuthorityData, s.RequirePermission("role:update"))
	g.GET("/authority/dataScope", s.legacyDataScope, s.RequirePermission("role:list"))
	g.PUT("/authority/dataScope", s.legacyDataScope, s.RequirePermission("role:update"))
	g.POST("/casbin/getPolicyPathByAuthorityId", s.legacyCasbinGet, s.RequirePermission("role:list"))
	g.POST("/casbin/updateCasbin", s.legacyCasbinUpdate, s.RequirePermission("role:update"))
	g.POST("/authorityBtn/getAuthorityBtn", s.legacyAuthorityButtons, s.RequirePermission("role:list"))
	g.POST("/authorityBtn/setAuthorityBtn", s.legacyAuthorityButtons, s.RequirePermission("role:update"))
	g.POST("/authorityBtn/canRemoveAuthorityBtn", s.legacyAuthorityButtons, s.RequirePermission("role:update"))
}
