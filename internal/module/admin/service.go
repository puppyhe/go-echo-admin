package admin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"github.com/puppyhe/go-echo-admin/internal/platform/storage"
	"github.com/puppyhe/go-echo-admin/pkg/tenant"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type RuntimeConfig struct {
	JWTSecret             string
	AccessTTL, RefreshTTL time.Duration
	StorageMaxBytes       int64
}
type Service struct {
	DB     *database.DB
	Config RuntimeConfig
	// Scheduler is optional in unit tests and can be replaced with a durable
	// queue implementation by the application bootstrap.
	Scheduler *Scheduler
	// Storage is injected by the application so file handlers stay independent
	// of local disk versus an object-storage implementation.
	Storage storage.Store
	// RouteProvider is injected by the application after Echo registers its
	// routes. Keeping it optional leaves the service easy to exercise in unit
	// tests while allowing API sync to inspect the live route table.
	RouteProvider func() echo.Routes
}
type Claims struct {
	UserID       uint64 `json:"user_id"`
	TenantID     uint64 `json:"tenant_id"`
	MembershipID uint64 `json:"membership_id"`
	// RoleID is populated for API tokens. Browser sessions intentionally leave
	// it empty and are evaluated against all active memberships in the tenant.
	RoleID    uint64 `json:"role_id,omitempty"`
	TokenType string `json:"token_type"`
	jwt.RegisteredClaims
}
type platformTokenResponse struct {
	AccessToken  string   `json:"access_token"`
	RefreshToken string   `json:"refresh_token"`
	ExpiresIn    int64    `json:"expires_in"`
	User         UserView `json:"user"`
	Scope        string   `json:"scope"`
}
type loginRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	TenantCode string `json:"tenant_code"`
}
type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}
type logoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}
type switchTenantRequest struct {
	TenantCode     string `json:"tenant_code"`
	SelectionToken string `json:"selection_token"`
}
type tokenResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	ExpiresIn    int64        `json:"expires_in"`
	User         UserView     `json:"user"`
	Tenant       *TenantView  `json:"tenant,omitempty"`
	Memberships  []TenantView `json:"memberships,omitempty"`
	Menus        []MenuView   `json:"menus"`
	Permissions  []string     `json:"permissions"`
}
type UserView struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
	Status   string `json:"status"`
}
type TenantView struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Code   string `json:"code"`
	Domain string `json:"domain,omitempty"`
	Status string `json:"status"`
}
type MenuView struct {
	ID         string  `json:"id"`
	ParentID   *string `json:"parent_id,omitempty"`
	Type       string  `json:"type"`
	Name       string  `json:"name"`
	Path       string  `json:"path"`
	RouteName  string  `json:"route_name"`
	Icon       string  `json:"icon"`
	Permission string  `json:"permission"`
	Sort       int     `json:"sort"`
	Hidden     bool    `json:"hidden"`
}

func userView(u database.User) UserView {
	return UserView{ID: fmt.Sprint(u.ID), Username: u.Username, Email: optionalString(u.Email), Phone: u.Phone, Nickname: u.Nickname, Avatar: u.Avatar, Status: u.Status}
}
func tenantView(t database.Tenant) TenantView {
	return TenantView{ID: fmt.Sprint(t.ID), Name: t.Name, Code: t.Code, Domain: optionalString(t.Domain), Status: t.Status}
}
func stringPtr(value string) *string { return &value }
func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func (s *Service) SelectionToken(userID uint64) (string, error) {
	now := time.Now()
	claims := Claims{UserID: userID, TokenType: "selection", RegisteredClaims: jwt.RegisteredClaims{Issuer: "echo-admin", Subject: fmt.Sprint(userID), IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Minute))}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.Config.JWTSecret))
}
func (s *Service) SignTokens(userID, tenantID, membershipID uint64) (string, string, error) {
	now := time.Now()
	makeToken := func(typ string, ttl time.Duration) (string, error) {
		claims := Claims{UserID: userID, TenantID: tenantID, MembershipID: membershipID, TokenType: typ, RegisteredClaims: jwt.RegisteredClaims{Issuer: "echo-admin", Subject: fmt.Sprint(userID), IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(ttl)), ID: fmt.Sprintf("%d-%d", userID, now.UnixNano())}}
		return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.Config.JWTSecret))
	}
	access, e := makeToken("access", s.Config.AccessTTL)
	if e != nil {
		return "", "", e
	}
	refresh, e := makeToken("refresh", s.Config.RefreshTTL)
	if e != nil {
		return "", "", e
	}
	expiresAt := now.Add(s.Config.RefreshTTL)
	if err := s.DB.Create(&database.RefreshSession{UserID: userID, TenantID: &tenantID, TokenHash: hashToken(refresh), ExpiresAt: expiresAt}).Error; err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// SignPlatformTokens creates a tenant-less session for platform operators.
// Platform tokens can only reach the explicit /platform routes.
func (s *Service) SignPlatformTokens(userID uint64) (string, string, error) {
	now := time.Now()
	makeToken := func(typ string, ttl time.Duration) (string, error) {
		claims := Claims{UserID: userID, TokenType: "platform_" + typ, RegisteredClaims: jwt.RegisteredClaims{Issuer: "echo-admin", Subject: fmt.Sprint(userID), IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(ttl)), ID: fmt.Sprintf("platform-%d-%d", userID, now.UnixNano())}}
		return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.Config.JWTSecret))
	}
	access, err := makeToken("access", s.Config.AccessTTL)
	if err != nil {
		return "", "", err
	}
	refresh, err := makeToken("refresh", s.Config.RefreshTTL)
	if err != nil {
		return "", "", err
	}
	if err := s.DB.Create(&database.RefreshSession{UserID: userID, TokenHash: hashToken(refresh), ExpiresAt: now.Add(s.Config.RefreshTTL)}).Error; err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

func (s *Service) PlatformLogin(ctx context.Context, username, password, requestID, ip string) (platformTokenResponse, error) {
	var u database.User
	if s.DB.WithContext(ctx).Where("username = ? OR email = ?", username, username).First(&u).Error != nil || !u.PlatformAdmin || u.Status != "active" || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		s.logPlatform(ctx, "", requestID, ip, "failure", "invalid_credentials")
		return platformTokenResponse{}, httpx.NewError(http.StatusUnauthorized, "PLATFORM_AUTH_INVALID_CREDENTIALS", "平台账号或密码错误")
	}
	a, r, err := s.SignPlatformTokens(u.ID)
	if err != nil {
		return platformTokenResponse{}, err
	}
	now := time.Now()
	_ = s.DB.WithContext(ctx).Model(&u).Update("last_login_at", &now).Error
	s.logPlatform(ctx, "", requestID, ip, "success", "")
	return platformTokenResponse{AccessToken: a, RefreshToken: r, ExpiresIn: int64(s.Config.AccessTTL.Seconds()), User: userView(u), Scope: "platform"}, nil
}
func (s *Service) parseToken(raw string) (Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method == nil || t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.Config.JWTSecret), nil
	})
	if err != nil {
		return Claims{}, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return Claims{}, errors.New("invalid token")
	}
	return *claims, nil
}
func (s *Service) Login(ctx context.Context, req loginRequest, requestID, ip string) (any, error) {
	var u database.User
	q := s.DB.WithContext(ctx).Where("username = ? OR email = ?", req.Username, req.Username).First(&u)
	if q.Error != nil || u.Status != "active" {
		s.logPlatform(ctx, req.TenantCode, requestID, ip, "failure", "invalid_credentials")
		return nil, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_CREDENTIALS", "用户名或密码错误")
	}
	var memberships []database.TenantMembership
	s.DB.WithContext(ctx).Where("user_id = ? AND status = ?", u.ID, "active").Find(&memberships)
	if len(memberships) == 0 {
		return nil, httpx.NewError(http.StatusForbidden, "TENANT_ACCESS_DENIED", "用户没有可用的租户成员关系")
	}
	var selected database.Tenant
	var m database.TenantMembership
	if req.TenantCode != "" {
		for _, candidate := range memberships {
			var t database.Tenant
			if s.DB.First(&t, candidate.TenantID).Error == nil && t.Code == req.TenantCode {
				selected = t
				m = candidate
				break
			}
		}
		if selected.ID == 0 {
			return nil, httpx.NewError(http.StatusForbidden, "TENANT_ACCESS_DENIED", "当前租户不可用")
		}
		credentialHash := u.PasswordHash
		if m.PasswordHash != nil && strings.TrimSpace(*m.PasswordHash) != "" {
			credentialHash = *m.PasswordHash
		}
		if bcrypt.CompareHashAndPassword([]byte(credentialHash), []byte(req.Password)) != nil {
			s.logPlatform(ctx, req.TenantCode, requestID, ip, "failure", "invalid_credentials")
			return nil, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_CREDENTIALS", "Invalid username or password")
		}
		var profileStatus string
		if result := s.DB.WithContext(ctx).Table("iam_user_profiles").Where("tenant_id = ? AND user_id = ?", m.TenantID, u.ID).Pluck("status", &profileStatus); result.Error == nil && profileStatus != "" && profileStatus != "active" {
			return nil, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_CREDENTIALS", "Invalid username or password")
		}
	} else if len(memberships) == 1 {
		credentialHash := u.PasswordHash
		if memberships[0].PasswordHash != nil && strings.TrimSpace(*memberships[0].PasswordHash) != "" {
			credentialHash = *memberships[0].PasswordHash
		}
		if bcrypt.CompareHashAndPassword([]byte(credentialHash), []byte(req.Password)) != nil {
			s.logPlatform(ctx, req.TenantCode, requestID, ip, "failure", "invalid_credentials")
			return nil, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_CREDENTIALS", "Invalid username or password")
		}
		m = memberships[0]
		s.DB.First(&selected, m.TenantID)
	} else {
		if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)) != nil {
			s.logPlatform(ctx, req.TenantCode, requestID, ip, "failure", "invalid_credentials")
			return nil, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_CREDENTIALS", "Invalid username or password")
		}
		views := make([]TenantView, 0, len(memberships))
		for _, candidate := range memberships {
			var t database.Tenant
			if s.DB.First(&t, candidate.TenantID).Error == nil {
				views = append(views, tenantView(t))
			}
		}
		selection, tokenErr := s.SelectionToken(u.ID)
		if tokenErr != nil {
			return nil, tokenErr
		}
		return nil, httpx.NewError(http.StatusBadRequest, "TENANT_SELECTION_REQUIRED", "登录前请选择租户").WithData(map[string]any{"selection_token": selection, "tenants": views})
	}
	var profileStatus string
	if result := s.DB.WithContext(ctx).Table("iam_user_profiles").Where("tenant_id = ? AND user_id = ?", selected.ID, u.ID).Pluck("status", &profileStatus); result.Error == nil && profileStatus != "" && profileStatus != "active" {
		return nil, httpx.NewError(http.StatusUnauthorized, "AUTH_INVALID_CREDENTIALS", "Invalid username or password")
	}
	if selected.Status != "active" {
		return nil, httpx.NewError(http.StatusForbidden, "TENANT_SUSPENDED", "当前租户已停用")
	}
	a, r, e := s.SignTokens(u.ID, selected.ID, m.ID)
	if e != nil {
		return nil, e
	}
	now := time.Now()
	s.DB.Model(&u).Update("last_login_at", &now)
	s.DB.Create(&database.TenantLoginLog{TenantID: selected.ID, UserID: &u.ID, IP: ip, Result: "success", RequestID: requestID})
	return s.tokenResponse(ctx, u, selected, m, a, r), nil
}
func (s *Service) tokenResponse(ctx context.Context, u database.User, t database.Tenant, m database.TenantMembership, a, r string) tokenResponse {
	var menus []database.Menu
	s.DB.WithContext(ctx).Where("tenant_id = ?", t.ID).Order("sort asc,id asc").Find(&menus)
	// Keep the response aligned with server-side authorization. Platform admins
	// may see every menu in the selected tenant; ordinary members only receive
	// menus granted through their active roles.
	var platformCount int64
	s.DB.WithContext(ctx).Table("role_memberships rm").Joins("JOIN roles r ON r.id = rm.role_id AND r.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ? AND r.code = ? AND r.status = ?", u.ID, t.ID, "platform_admin", "active").Count(&platformCount)
	if platformCount == 0 {
		var menuIDs []uint64
		s.DB.WithContext(ctx).Table("role_memberships rm").Joins("JOIN role_menus rmenu ON rmenu.role_id = rm.role_id AND rmenu.tenant_id = rm.tenant_id").Where("rm.user_id = ? AND rm.tenant_id = ?", u.ID, t.ID).Pluck("rmenu.menu_id", &menuIDs)
		if len(menuIDs) == 0 {
			menus = nil
		} else {
			allowed := make(map[uint64]struct{}, len(menuIDs))
			for _, id := range menuIDs {
				allowed[id] = struct{}{}
			}
			filtered := make([]database.Menu, 0, len(menus))
			for _, menu := range menus {
				if _, ok := allowed[menu.ID]; ok {
					filtered = append(filtered, menu)
				}
			}
			menus = filtered
		}
		filtered := make([]database.Menu, 0, len(menus))
		for _, menu := range menus {
			if menu.Path != "/iam/api-tokens" {
				filtered = append(filtered, menu)
			}
		}
		menus = filtered
	}
	mv := make([]MenuView, 0, len(menus))
	for _, x := range menus {
		var pid *string
		if x.ParentID != nil {
			v := fmt.Sprint(*x.ParentID)
			pid = &v
		}
		mv = append(mv, MenuView{ID: fmt.Sprint(x.ID), ParentID: pid, Type: x.Type, Name: x.Name, Path: x.Path, RouteName: x.RouteName, Icon: x.Icon, Permission: x.Permission, Sort: x.Sort, Hidden: x.Hidden})
	}
	var memberships []database.TenantMembership
	s.DB.WithContext(ctx).Where("user_id = ? AND status = ?", u.ID, "active").Find(&memberships)
	views := make([]TenantView, 0, len(memberships))
	for _, membership := range memberships {
		var mt database.Tenant
		if s.DB.WithContext(ctx).First(&mt, membership.TenantID).Error == nil {
			views = append(views, tenantView(mt))
		}
	}
	return tokenResponse{AccessToken: a, RefreshToken: r, ExpiresIn: int64(s.Config.AccessTTL.Seconds()), User: userView(u), Tenant: &TenantView{ID: fmt.Sprint(t.ID), Name: t.Name, Code: t.Code, Domain: optionalString(t.Domain), Status: t.Status}, Memberships: views, Menus: mv, Permissions: permissions(menus)}
}
func (s *Service) Me(ctx context.Context, identity tenant.Identity) (any, error) {
	var u database.User
	if s.DB.First(&u, identity.UserID).Error != nil {
		return nil, httpx.NewError(401, "AUTH_INVALID_TOKEN", "Session user not found")
	}
	var t database.Tenant
	if s.DB.First(&t, identity.TenantID).Error != nil {
		return nil, httpx.NewError(403, "TENANT_ACCESS_DENIED", "Tenant not found")
	}
	return s.tokenResponse(ctx, u, t, database.TenantMembership{ID: identity.MembershipID}, "", ""), nil
}
func permissions(m []database.Menu) []string {
	r := make([]string, 0, len(m))
	for _, x := range m {
		if x.Permission != "" {
			r = append(r, x.Permission)
		}
	}
	return r
}
func (s *Service) Refresh(ctx context.Context, raw string) (any, error) {
	claims, e := s.parseToken(raw)
	if e != nil || (claims.TokenType != "refresh" && claims.TokenType != "platform_refresh") {
		return nil, httpx.NewError(401, "AUTH_INVALID_TOKEN", "刷新令牌无效")
	}
	var session database.RefreshSession
	if result := s.DB.WithContext(ctx).Where("token_hash = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?", hashToken(raw), claims.UserID, time.Now()).First(&session); result.Error != nil {
		return nil, httpx.NewError(401, "AUTH_INVALID_TOKEN", "Refresh token is expired or revoked")
	}
	var u database.User
	if s.DB.First(&u, claims.UserID).Error != nil || u.Status != "active" {
		return nil, httpx.NewError(401, "AUTH_INVALID_TOKEN", "Session user is invalid")
	}
	if claims.TokenType == "platform_refresh" {
		if !u.PlatformAdmin {
			return nil, httpx.NewError(403, "PLATFORM_ACCESS_DENIED", "平台管理员权限不足")
		}
		_ = s.DB.WithContext(ctx).Model(&session).Update("revoked_at", time.Now()).Error
		a, r, err := s.SignPlatformTokens(claims.UserID)
		if err != nil {
			return nil, err
		}
		return platformTokenResponse{AccessToken: a, RefreshToken: r, ExpiresIn: int64(s.Config.AccessTTL.Seconds()), User: userView(u), Scope: "platform"}, nil
	}
	if claims.TokenType != "refresh" {
		return nil, httpx.NewError(401, "AUTH_INVALID_TOKEN", "刷新令牌无效")
	}
	var t database.Tenant
	if s.DB.First(&t, claims.TenantID).Error != nil || t.Status != "active" {
		return nil, httpx.NewError(403, "TENANT_SUSPENDED", "Tenant is unavailable")
	}
	var membership database.TenantMembership
	if s.DB.WithContext(ctx).Where("id = ? AND tenant_id = ? AND user_id = ? AND status = ?", claims.MembershipID, claims.TenantID, claims.UserID, "active").First(&membership).Error != nil {
		return nil, httpx.NewError(403, "TENANT_ACCESS_DENIED", "Tenant membership is unavailable")
	}
	_ = s.DB.WithContext(ctx).Model(&session).Update("revoked_at", time.Now()).Error
	a, r, e := s.SignTokens(claims.UserID, claims.TenantID, claims.MembershipID)
	if e != nil {
		return nil, e
	}
	return s.tokenResponse(ctx, u, t, database.TenantMembership{ID: claims.MembershipID}, a, r), nil
}
func (s *Service) SwitchTenant(ctx context.Context, id tenant.Identity, code string) (any, error) {
	var m database.TenantMembership
	var t database.Tenant
	if s.DB.Where("user_id = ? AND tenant_id IN (SELECT id FROM tenants WHERE code = ?) AND status = ?", id.UserID, code, "active").First(&m).Error != nil {
		return nil, httpx.NewError(403, "TENANT_ACCESS_DENIED", "Tenant membership is unavailable")
	}
	s.DB.First(&t, m.TenantID)
	if t.Status != "active" {
		return nil, httpx.NewError(403, "TENANT_SUSPENDED", "Tenant is suspended")
	}
	var u database.User
	s.DB.First(&u, id.UserID)
	a, r, e := s.SignTokens(id.UserID, t.ID, m.ID)
	if e != nil {
		return nil, e
	}
	return s.tokenResponse(ctx, u, t, m, a, r), nil
}
func (s *Service) RevokeRefresh(ctx context.Context, raw string, userID uint64) error {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	return s.DB.WithContext(ctx).Model(&database.RefreshSession{}).Where("token_hash = ? AND user_id = ? AND revoked_at IS NULL", hashToken(raw), userID).Update("revoked_at", time.Now()).Error
}
func (s *Service) logPlatform(ctx context.Context, code, requestID, ip, result, reason string) {
	s.DB.WithContext(ctx).Create(&database.PlatformLoginLog{TenantCode: code, RequestID: requestID, IP: ip, Result: result, FailureReason: reason})
}

// CreateTenant provisions a tenant and its first tenant administrator in one transaction.
// The global user identity is reused when the requested admin username already exists.
func (s *Service) CreateTenant(ctx context.Context, name, code, adminUsername, adminPassword, contact, domain string) (map[string]any, error) {
	name, code, adminUsername = strings.TrimSpace(name), strings.TrimSpace(code), strings.TrimSpace(adminUsername)
	if name == "" || code == "" || adminUsername == "" || len(adminPassword) < 12 {
		return nil, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "租户名称、租户编码、管理员账号不能为空，管理员密码至少 12 位")
	}
	var result map[string]any
	err := s.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing database.Tenant
		if tx.Where("code = ?", code).First(&existing).Error == nil {
			return httpx.NewError(http.StatusConflict, "TENANT_EXISTS", "租户编码已存在")
		}
		t := database.Tenant{Name: name, Code: code, Contact: contact, Status: "active"}
		if strings.TrimSpace(domain) != "" {
			t.Domain = stringPtr(strings.TrimSpace(domain))
		}
		if err := tx.Create(&t).Error; err != nil {
			return err
		}
		adminHash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		adminHashString := string(adminHash)
		var u database.User
		if tx.Where("username = ?", adminUsername).First(&u).Error != nil {
			u = database.User{Username: adminUsername, Nickname: "租户管理员", PasswordHash: adminHashString, Status: "active"}
			if err := tx.Create(&u).Error; err != nil {
				return httpx.NewError(http.StatusConflict, "USER_EXISTS", "管理员账号已存在")
			}
		} else if u.Status != "active" {
			return httpx.NewError(http.StatusConflict, "USER_DISABLED", "管理员账号已被停用")
		}
		membership := database.TenantMembership{TenantID: t.ID, UserID: u.ID, PasswordHash: &adminHashString, Status: "active"}
		if err := tx.Create(&membership).Error; err != nil {
			return httpx.NewError(http.StatusConflict, "TENANT_ADMIN_EXISTS", "租户管理员关系已存在")
		}
		role := database.Role{TenantID: t.ID, Name: "租户管理员", Code: "tenant_admin", Status: "active"}
		if err := tx.Create(&role).Error; err != nil {
			return err
		}
		if err := tx.Create(&database.RoleMembership{TenantID: t.ID, RoleID: role.ID, UserID: u.ID}).Error; err != nil {
			return err
		}
		result = map[string]any{"tenant": tenantView(t), "admin": userView(u)}
		// Menus are seeded after the transaction to keep this transaction small.
		return nil
	})
	if err != nil {
		return nil, err
	}
	if tenant, ok := result["tenant"].(TenantView); ok {
		if err := s.seedMenus(ctx, parseUint(tenant.ID)); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func parseUint(value string) uint64 {
	var n uint64
	for _, r := range value {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + uint64(r-'0')
	}
	return n
}
func (s *Service) Seed(ctx context.Context, username, password, tenantCode, tenantName string, demo bool) error {
	if username == "" {
		username = "admin"
	}
	if password == "" {
		return errors.New("password is required")
	}
	if tenantCode == "" {
		tenantCode = "default"
	}
	if tenantName == "" {
		tenantName = "Default Tenant"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	hashString := string(hash)
	var t database.Tenant
	if s.DB.Where("code = ?", tenantCode).First(&t).Error != nil {
		t = database.Tenant{Name: tenantName, Code: tenantCode, Status: "active"}
		if err := s.DB.WithContext(ctx).Create(&t).Error; err != nil {
			return err
		}
	} else if t.Status != "active" {
		if err := s.DB.WithContext(ctx).Model(&t).Update("status", "active").Error; err != nil {
			return err
		}
		t.Status = "active"
	}
	var u database.User
	if s.DB.Where("username = ?", username).First(&u).Error != nil {
		u = database.User{Username: username, Nickname: "Administrator", PasswordHash: hashString, Status: "active", PlatformAdmin: true}
		if err := s.DB.WithContext(ctx).Create(&u).Error; err != nil {
			return err
		}
	} else {
		// `seed` receives an explicit administrator password.  Make repeated
		// seed runs useful for local recovery and deployment bootstrap by
		// synchronizing the existing administrator credentials as well.
		updates := map[string]any{"password_hash": hashString, "platform_admin": true, "status": "active"}
		if err := s.DB.WithContext(ctx).Model(&u).Updates(updates).Error; err != nil {
			return err
		}
		u.PasswordHash = hashString
		u.PlatformAdmin = true
		u.Status = "active"
	}
	var m database.TenantMembership
	if s.DB.Where("tenant_id = ? AND user_id = ?", t.ID, u.ID).First(&m).Error != nil {
		m = database.TenantMembership{TenantID: t.ID, UserID: u.ID, PasswordHash: stringPtr(hashString), Status: "active"}
		if err := s.DB.WithContext(ctx).Create(&m).Error; err != nil {
			return err
		}
	} else {
		if err := s.DB.WithContext(ctx).Model(&m).Updates(map[string]any{"password_hash": hashString, "status": "active"}).Error; err != nil {
			return err
		}
		m.PasswordHash = stringPtr(hashString)
		m.Status = "active"
	}
	var role database.Role
	if s.DB.Where("tenant_id = ? AND code = ?", t.ID, "platform_admin").First(&role).Error != nil {
		role = database.Role{TenantID: t.ID, Name: "平台管理员", Code: "platform_admin", Status: "active"}
		if err := s.DB.WithContext(ctx).Create(&role).Error; err != nil {
			return err
		}
	}
	grant := database.RoleMembership{TenantID: t.ID, RoleID: role.ID, UserID: u.ID}
	if err := s.DB.WithContext(ctx).Where("role_id = ? AND user_id = ?", role.ID, u.ID).FirstOrCreate(&grant).Error; err != nil {
		return err
	}
	// Baseline menus are required in every environment. The demo flag is kept
	// in the application contract for future sample data and never enables
	// unsafe production fixtures.
	_ = demo
	return s.seedMenus(ctx, t.ID)
}
func (s *Service) seedMenus(ctx context.Context, tenantID uint64) error {
	type menuSeed struct {
		name, path, typ, permission, icon string
		parent                            string
		sort                              int
	}
	seeds := []menuSeed{
		{"仪表盘", "/dashboard", "page", "dashboard:view", "dashboard", "", 1},
		{"个人中心", "/person", "page", "user:self", "user", "", 2},
		{"平台中心", "/platform", "directory", "", "platform", "", 10},
		{"租户管理", "/platform/tenants", "page", "tenant:list", "office-building", "/platform", 11},
		{"权限管理", "/iam", "directory", "", "safety", "", 20},
		{"用户管理", "/iam/users", "page", "user:list", "user", "/iam", 21},
		{"角色管理", "/iam/roles", "page", "role:list", "role", "/iam", 22},
		{"菜单管理", "/iam/menus", "page", "menu:list", "menu-list", "/iam", 23},
		{"部门管理", "/iam/departments", "page", "department:list", "office-building", "/iam", 24},
		{"岗位管理", "/iam/positions", "page", "position:list", "team", "/iam", 25},
		{"API权限", "/iam/apis", "page", "api:list", "api", "/iam", 26},
		{"API令牌", "/iam/api-tokens", "page", "api:list", "key", "/iam", 27},
		{"权限矩阵", "/iam/permissions", "page", "role:list", "safety-certificate", "/iam", 28},
		{"系统设置", "/system", "directory", "", "setting", "", 30},
		{"字典管理", "/system/dictionaries", "page", "dictionary:list", "reading", "/system", 31},
		{"参数配置", "/system/params", "page", "param:list", "sliders", "/system", 32},
		{"安全配置", "/system/security", "page", "param:list", "lock", "/system", 33},
		{"文件中心", "/system/files", "page", "file:list", "files", "/system", 34},
		{"运维审计", "/ops", "directory", "", "monitor", "", 40},
		{"登录日志", "/ops/login-logs", "page", "audit:list", "login", "/ops", 41},
		{"操作审计", "/ops/audit", "page", "audit:list", "audit", "/ops", 42},
		{"错误日志", "/ops/errors", "page", "audit:list", "warn", "/ops", 43},
		{"系统健康", "/ops/health", "page", "health:view", "health", "/ops", 44},
		{"任务管理", "/ops/jobs", "page", "health:view", "schedule", "/ops", 45},
		{"审计报表", "/ops/report", "page", "audit:list", "bar-chart", "/ops", 46},
		{"系统监控", "/ops/monitor", "page", "health:view", "dashboard", "/ops", 47},
		{"通知中心", "/notify", "directory", "", "bell", "", 60},
		{"通知收件箱", "/notify/inbox", "page", "user:list", "bell", "/notify", 61},
		{"通知渠道", "/notify/channels", "page", "param:list", "message", "/notify", 62},
		{"通知模板", "/notify/templates", "page", "param:list", "document", "/notify", 63},
		{"通知偏好", "/notify/preferences", "page", "user:self", "setting", "/notify", 64},
		{"通知投递", "/notify/deliveries", "page", "audit:list", "send", "/notify", 65},
		{"通知运行配置", "/notify/config", "page", "param:list", "setting", "/notify", 66},
		{"开发工具", "/dev", "directory", "codegen:list", "tool", "", 50},
		{"代码生成", "/dev/auto-code", "page", "codegen:list", "cpu", "/dev", 51},
		{"已生成代码", "/dev/auto-code/history", "page", "codegen:list", "folder", "/dev", 52},
		{"包管理", "/dev/auto-package", "page", "codegen:list", "box", "/dev", 53},
	}
	ids := make(map[string]uint64)
	for _, seed := range seeds {
		var existing database.Menu
		if result := s.DB.WithContext(ctx).Where("tenant_id = ? AND path = ?", tenantID, seed.path).First(&existing); result.Error == nil {
			updates := map[string]any{"name": seed.name, "type": seed.typ, "permission": seed.permission, "icon": seed.icon, "sort": seed.sort, "route_name": seed.name}
			s.DB.WithContext(ctx).Model(&existing).Updates(updates)
			ids[seed.path] = existing.ID
		} else {
			var parent *uint64
			if seed.parent != "" {
				if id := ids[seed.parent]; id != 0 {
					parent = &id
				}
			}
			menu := database.Menu{TenantID: tenantID, ParentID: parent, Type: seed.typ, Name: seed.name, Path: seed.path, RouteName: seed.name, Permission: seed.permission, Icon: seed.icon, Sort: seed.sort}
			if err := s.DB.WithContext(ctx).Create(&menu).Error; err != nil {
				return err
			}
			ids[seed.path] = menu.ID
		}
		var roles []database.Role
		s.DB.WithContext(ctx).Where("tenant_id = ? AND code IN ? AND status = ?", tenantID, []string{"platform_admin", "tenant_admin"}, "active").Find(&roles)
		for _, role := range roles {
			if role.Code == "tenant_admin" && (strings.HasPrefix(seed.path, "/platform") || seed.path == "/iam/api-tokens") {
				continue
			}
			grant := database.RoleMenu{TenantID: tenantID, RoleID: role.ID, MenuID: ids[seed.path]}
			s.DB.WithContext(ctx).Where("role_id = ? AND menu_id = ?", grant.RoleID, grant.MenuID).FirstOrCreate(&grant)
		}
	}
	// A tenant administrator must never inherit platform tenant-management
	// pages. Remove grants left by older seed versions when the seed command is
	// rerun against an existing database.
	var tenantRole database.Role
	if s.DB.WithContext(ctx).Where("tenant_id = ? AND code = ?", tenantID, "tenant_admin").First(&tenantRole).Error == nil {
		var platformMenus []database.Menu
		s.DB.WithContext(ctx).Where("tenant_id = ? AND path LIKE ?", tenantID, "/platform%").Find(&platformMenus)
		if len(platformMenus) > 0 {
			menuIDs := make([]uint64, 0, len(platformMenus))
			for _, menu := range platformMenus {
				menuIDs = append(menuIDs, menu.ID)
			}
			s.DB.WithContext(ctx).Where("tenant_id = ? AND role_id = ? AND menu_id IN ?", tenantID, tenantRole.ID, menuIDs).Delete(&database.RoleMenu{})
		}
	}
	return nil
}
func (s *Service) ListTenants(ctx context.Context, page, size int) (map[string]any, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	var total int64
	var items []database.Tenant
	s.DB.WithContext(ctx).Model(&database.Tenant{}).Count(&total).Offset((page - 1) * size).Limit(size).Order("id desc").Find(&items)
	views := make([]TenantView, 0, len(items))
	for _, x := range items {
		views = append(views, tenantView(x))
	}
	return map[string]any{"items": views, "page": page, "page_size": size, "total": total}, nil
}
func (s *Service) ListUsers(ctx context.Context, id tenant.Identity, page, size int) (map[string]any, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	var total int64
	query := s.DB.WithContext(ctx).Model(&database.User{}).Joins("JOIN tenant_memberships tm ON tm.user_id = users.id").Where("tm.tenant_id = ? AND tm.status = ?", id.TenantID, "active")
	if scope, departmentIDs := s.userDataScope(ctx, id); scope != "all" {
		departmentUsers := s.DB.WithContext(ctx).Model(&database.DepartmentMember{}).Select("user_id").Where("tenant_id = ? AND department_id IN ?", id.TenantID, departmentIDs)
		switch {
		case scope == "self":
			query = query.Where("users.id = ?", id.UserID)
		case len(departmentIDs) > 0:
			query = query.Where("users.id IN (?)", departmentUsers)
		default:
			query = query.Where("users.id = ?", id.UserID)
		}
	}
	query.Count(&total)
	var users []database.User
	query.Offset((page - 1) * size).Limit(size).Order("users.id desc").Find(&users)
	items := make([]UserView, 0, len(users))
	for _, u := range users {
		items = append(items, userView(u))
	}
	return map[string]any{"items": items, "page": page, "page_size": size, "total": total}, nil
}

// userDataScope resolves the most permissive active role for the current
// member. Platform and tenant administrators retain full visibility; custom
// roles are narrowed to their stored self/department/custom policy.
func (s *Service) userDataScope(ctx context.Context, id tenant.Identity) (string, []uint64) {
	if id.PlatformAdmin {
		return "all", nil
	}
	var tenantAdmin int64
	s.DB.WithContext(ctx).Table("role_memberships rm").Joins("JOIN roles r ON r.id=rm.role_id AND r.tenant_id=rm.tenant_id").Where("rm.tenant_id=? AND rm.user_id=? AND r.code=? AND r.status=?", id.TenantID, id.UserID, "tenant_admin", "active").Count(&tenantAdmin)
	if tenantAdmin > 0 {
		return "all", nil
	}
	var roleIDs []uint64
	s.DB.WithContext(ctx).Table("role_memberships").Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).Pluck("role_id", &roleIDs)
	if len(roleIDs) == 0 {
		return "self", nil
	}
	var settings []database.IAMRoleSetting
	s.DB.WithContext(ctx).Where("tenant_id=? AND role_id IN ?", id.TenantID, roleIDs).Find(&settings)
	if len(settings) == 0 {
		return "self", nil
	}
	departmentIDs := []uint64{}
	self := false
	for _, setting := range settings {
		switch setting.DataScope {
		case "", "self":
			self = true
		case "all":
			return "all", nil
		case "department":
			var membership database.TenantMembership
			if s.DB.WithContext(ctx).Select("primary_department_id").Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&membership).Error == nil && membership.PrimaryDepartmentID != nil {
				departmentIDs = append(departmentIDs, *membership.PrimaryDepartmentID)
			}
		case "departmentTree":
			var membership database.TenantMembership
			s.DB.WithContext(ctx).Select("primary_department_id").Where("tenant_id=? AND user_id=?", id.TenantID, id.UserID).First(&membership)
			if membership.PrimaryDepartmentID != nil {
				departmentIDs = append(departmentIDs, s.departmentTreeIDs(ctx, id.TenantID, []uint64{*membership.PrimaryDepartmentID})...)
			}
		case "custom":
			var ids []uint64
			_ = json.Unmarshal([]byte(setting.DataAuthorityIDs), &ids)
			departmentIDs = append(departmentIDs, ids...)
		}
	}
	departmentIDs = unique(departmentIDs)
	if len(departmentIDs) == 0 && self {
		return "self", nil
	}
	if len(departmentIDs) == 0 {
		return "self", nil
	}
	return "department", departmentIDs
}

func (s *Service) departmentTreeIDs(ctx context.Context, tenantID uint64, roots []uint64) []uint64 {
	ids := unique(roots)
	for i := 0; i < len(ids); i++ {
		var children []uint64
		s.DB.WithContext(ctx).Model(&database.Department{}).Where("tenant_id=? AND parent_id=?", tenantID, ids[i]).Pluck("id", &children)
		for _, child := range children {
			found := false
			for _, existing := range ids {
				if existing == child {
					found = true
					break
				}
			}
			if !found {
				ids = append(ids, child)
			}
		}
	}
	return ids
}
func (s *Service) CreateUser(ctx context.Context, id tenant.Identity, in struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Email    string `json:"email"`
	Nickname string `json:"nickname"`
}) (UserView, error) {
	if strings.TrimSpace(in.Username) == "" || len(in.Password) < 8 {
		return UserView{}, httpx.NewError(400, "VALIDATION_ERROR", "username and a password of at least 8 characters are required")
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if e != nil {
		return UserView{}, e
	}
	var email *string
	if strings.TrimSpace(in.Email) != "" {
		email = &in.Email
	}
	u := database.User{Username: in.Username, PasswordHash: string(hash), Email: email, Nickname: in.Nickname, Status: "active"}
	if e = s.DB.WithContext(ctx).Create(&u).Error; e != nil {
		return UserView{}, httpx.NewError(409, "USER_EXISTS", "Username or email already exists")
	}
	m := database.TenantMembership{TenantID: id.TenantID, UserID: u.ID, Status: "active"}
	if e = s.DB.WithContext(ctx).Create(&m).Error; e != nil {
		return UserView{}, e
	}
	return userView(u), nil
}
func (s *Service) GetUser(ctx context.Context, id tenant.Identity, userID uint64) (UserView, error) {
	var u database.User
	if s.DB.WithContext(ctx).Joins("JOIN tenant_memberships tm ON tm.user_id = users.id").Where("users.id = ? AND tm.tenant_id = ?", userID, id.TenantID).First(&u).Error != nil {
		return UserView{}, httpx.NewError(404, "NOT_FOUND", "User not found")
	}
	return userView(u), nil
}
func (s *Service) UpdateUser(ctx context.Context, id tenant.Identity, userID uint64, in map[string]any) (UserView, error) {
	var u database.User
	if s.DB.WithContext(ctx).Joins("JOIN tenant_memberships tm ON tm.user_id = users.id").Where("users.id = ? AND tm.tenant_id = ?", userID, id.TenantID).First(&u).Error != nil {
		return UserView{}, httpx.NewError(404, "NOT_FOUND", "User not found")
	}
	for _, key := range []string{"email", "phone", "nickname", "avatar", "status"} {
		if v, ok := in[key].(string); ok {
			switch key {
			case "email":
				if strings.TrimSpace(v) == "" {
					u.Email = nil
				} else {
					u.Email = stringPtr(v)
				}
			case "phone":
				u.Phone = v
			case "nickname":
				u.Nickname = v
			case "avatar":
				u.Avatar = v
			case "status":
				u.Status = v
			}
		}
	}
	if e := s.DB.WithContext(ctx).Save(&u).Error; e != nil {
		return UserView{}, e
	}
	return userView(u), nil
}
func (s *Service) DeleteUser(ctx context.Context, id tenant.Identity, userID uint64) error {
	var m database.TenantMembership
	if s.DB.WithContext(ctx).Where("tenant_id = ? AND user_id = ?", id.TenantID, userID).First(&m).Error != nil {
		return httpx.NewError(404, "NOT_FOUND", "User not found")
	}
	return s.DB.WithContext(ctx).Delete(&m).Error
}
func (s *Service) GetDashboard(ctx context.Context, id tenant.Identity) (map[string]any, error) {
	var users int64
	s.DB.WithContext(ctx).Model(&database.TenantMembership{}).Where("tenant_id = ? AND status = ?", id.TenantID, "active").Count(&users)
	var roles int64
	s.DB.WithContext(ctx).Model(&database.Role{}).Where("tenant_id = ? AND status = ?", id.TenantID, "active").Count(&roles)
	var menus int64
	s.DB.WithContext(ctx).Model(&database.Menu{}).Where("tenant_id = ?", id.TenantID).Count(&menus)
	var auditLogs int64
	s.DB.WithContext(ctx).Model(&database.AuditLog{}).Where("tenant_id = ?", id.TenantID).Count(&auditLogs)
	return map[string]any{"users": users, "roles": roles, "menus": menus, "audit_logs": auditLogs, "tenant_id": fmt.Sprint(id.TenantID)}, nil
}
func (s *Service) Audit(ctx context.Context, id tenant.Identity, c *echo.Context, action, result string) {
	s.DB.WithContext(ctx).Create(&database.AuditLog{TenantID: &id.TenantID, UserID: &id.UserID, Action: action, Method: c.Request().Method, Path: c.Path(), Result: result, RequestID: c.Response().Header().Get("X-Request-ID"), IP: c.RealIP()})
}
func hashToken(s string) string { x := sha256.Sum256([]byte(s)); return hex.EncodeToString(x[:]) }
