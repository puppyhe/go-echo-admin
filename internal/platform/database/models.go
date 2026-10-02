package database

import "time"

// Models intentionally keep tenant_id on every tenant-owned row. Repositories should use Scope.
type Tenant struct {
	ID        uint64  `gorm:"primaryKey;autoIncrement"`
	Name      string  `gorm:"size:120;not null"`
	Code      string  `gorm:"size:64;not null;uniqueIndex"`
	Domain    *string `gorm:"size:255"`
	Contact   string  `gorm:"size:120"`
	Status    string  `gorm:"size:20;not null;index"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt *time.Time `gorm:"index"`
}
type User struct {
	ID            uint64  `gorm:"primaryKey;autoIncrement"`
	Username      string  `gorm:"size:80;not null;uniqueIndex"`
	Email         *string `gorm:"size:190;uniqueIndex"`
	Phone         string  `gorm:"size:32"`
	PasswordHash  string  `gorm:"size:255;not null"`
	Nickname      string  `gorm:"size:120"`
	Avatar        string  `gorm:"size:512"`
	Status        string  `gorm:"size:20;not null;index"`
	PlatformAdmin bool    `gorm:"not null;default:false;index"`
	LastLoginAt   *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
	DeletedAt     *time.Time `gorm:"index"`
}
type TenantMembership struct {
	ID       uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID uint64 `gorm:"not null;uniqueIndex:ux_tenant_user"`
	UserID   uint64 `gorm:"not null;uniqueIndex:ux_tenant_user"`
	// PasswordHash allows a tenant-provisioned admin to use credentials scoped
	// to that tenant while retaining a global user identity.
	PasswordHash        *string `gorm:"size:255"`
	Status              string  `gorm:"size:20;not null;index"`
	PrimaryDepartmentID *uint64
	PrimaryPositionID   *uint64
	CreatedAt           time.Time
	UpdatedAt           time.Time
	Tenant              Tenant `gorm:"foreignKey:TenantID"`
	User                User   `gorm:"foreignKey:UserID"`
}
type Role struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;uniqueIndex:ux_tenant_role_name"`
	Name        string `gorm:"size:120;not null;uniqueIndex:ux_tenant_role_name"`
	Code        string `gorm:"size:80;not null"`
	Status      string `gorm:"size:20;not null"`
	Description string `gorm:"size:255"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	DeletedAt   *time.Time `gorm:"index"`
}
type Menu struct {
	ID         uint64  `gorm:"primaryKey;autoIncrement"`
	TenantID   uint64  `gorm:"not null;index"`
	ParentID   *uint64 `gorm:"index"`
	Type       string  `gorm:"size:20;not null"`
	Name       string  `gorm:"size:120;not null"`
	Path       string  `gorm:"size:255"`
	RouteName  string  `gorm:"size:120"`
	Icon       string  `gorm:"size:120"`
	Permission string  `gorm:"size:160;index"`
	Sort       int
	Hidden     bool
	Cache      bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
type Department struct {
	ID        uint64  `gorm:"primaryKey;autoIncrement"`
	TenantID  uint64  `gorm:"not null;uniqueIndex:ux_tenant_department_code"`
	Name      string  `gorm:"size:120;not null"`
	Code      string  `gorm:"size:80;not null;uniqueIndex:ux_tenant_department_code"`
	ParentID  *uint64 `gorm:"index"`
	LeaderID  *uint64
	Sort      int
	Status    string `gorm:"size:20;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}
type APIResource struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement"`
	Method     string `gorm:"size:10;not null;uniqueIndex:ux_api_method_path"`
	Path       string `gorm:"size:255;not null;uniqueIndex:ux_api_method_path"`
	Group      string `gorm:"size:80"`
	Permission string `gorm:"size:160;index"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
type TenantAPIGrant struct {
	ID            uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID      uint64 `gorm:"not null;uniqueIndex:ux_tenant_api"`
	APIResourceID uint64 `gorm:"not null;uniqueIndex:ux_tenant_api"`
	Enabled       bool   `gorm:"not null;default:true"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
type RoleMembership struct {
	RoleID   uint64 `gorm:"primaryKey;uniqueIndex:ux_role_user"`
	UserID   uint64 `gorm:"primaryKey;uniqueIndex:ux_role_user"`
	TenantID uint64 `gorm:"not null;index"`
}
type RoleMenu struct {
	RoleID   uint64 `gorm:"primaryKey;uniqueIndex:ux_role_menu"`
	MenuID   uint64 `gorm:"primaryKey;uniqueIndex:ux_role_menu"`
	TenantID uint64 `gorm:"not null;index"`
}
type Dictionary struct {
	ID          uint64  `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64  `gorm:"not null;uniqueIndex:ux_tenant_dict_type"`
	Type        string  `gorm:"size:80;not null;uniqueIndex:ux_tenant_dict_type"`
	Name        string  `gorm:"size:120;not null"`
	Status      string  `gorm:"size:20;not null"`
	Description string  `gorm:"size:500"`
	ParentID    *uint64 `gorm:"index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
type DictionaryItem struct {
	ID           uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID     uint64 `gorm:"not null;uniqueIndex:ux_tenant_dict_item"`
	DictionaryID uint64 `gorm:"not null;uniqueIndex:ux_tenant_dict_item"`
	Label        string `gorm:"size:120;not null"`
	Value        string `gorm:"size:120;not null;uniqueIndex:ux_tenant_dict_item"`
	Sort         int
	Status       string  `gorm:"size:20;not null"`
	Extend       string  `gorm:"type:text"`
	ParentID     *uint64 `gorm:"index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
type SystemParam struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;uniqueIndex:ux_tenant_param_key"`
	Name        string `gorm:"size:120;not null"`
	Key         string `gorm:"size:120;not null;uniqueIndex:ux_tenant_param_key"`
	Value       string `gorm:"type:text"`
	Sensitive   bool
	Description string `gorm:"size:500"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
type AuditLog struct {
	ID           uint64  `gorm:"primaryKey;autoIncrement"`
	TenantID     *uint64 `gorm:"index"`
	UserID       *uint64 `gorm:"index"`
	Resource     string  `gorm:"size:120;index"`
	Action       string  `gorm:"size:80"`
	Method       string  `gorm:"size:10"`
	Path         string  `gorm:"size:255"`
	Result       string  `gorm:"size:20"`
	RequestID    string  `gorm:"size:80;index"`
	IP           string  `gorm:"size:64"`
	DurationMS   int64
	Changes      string `gorm:"type:text"`
	StatusCode   int
	Agent        string `gorm:"size:512"`
	ErrorMessage string `gorm:"size:500"`
	TraceID      string `gorm:"size:80;index"`
	CreatedAt    time.Time
}
type PlatformLoginLog struct {
	ID            uint64 `gorm:"primaryKey;autoIncrement"`
	UserID        *uint64
	TenantCode    string `gorm:"size:64"`
	Domain        string `gorm:"size:255"`
	IP            string `gorm:"size:64"`
	Device        string `gorm:"size:255"`
	Result        string `gorm:"size:20"`
	FailureReason string `gorm:"size:255"`
	RequestID     string `gorm:"size:80;index"`
	CreatedAt     time.Time
}
type TenantLoginLog struct {
	ID            uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID      uint64 `gorm:"not null;index"`
	UserID        *uint64
	IP            string `gorm:"size:64"`
	Device        string `gorm:"size:255"`
	Result        string `gorm:"size:20"`
	FailureReason string `gorm:"size:255"`
	RequestID     string `gorm:"size:80;index"`
	Username      string `gorm:"size:80;index"`
	TraceID       string `gorm:"size:80;index"`
	CreatedAt     time.Time
}
type RefreshSession struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement"`
	UserID    uint64    `gorm:"not null;index"`
	TenantID  *uint64   `gorm:"index"`
	TokenHash string    `gorm:"size:128;not null;uniqueIndex"`
	ExpiresAt time.Time `gorm:"index"`
	RevokedAt *time.Time
	CreatedAt time.Time
}

// APIToken is a tenant-scoped credential issued to a user for automation and
// integration calls. The clear-text token is never persisted; TokenHash is a
// SHA-256 digest used for lookup and revocation.
type APIToken struct {
	ID          uint64     `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64     `gorm:"not null;index"`
	UserID      uint64     `gorm:"not null;index"`
	AuthorityID uint64     `gorm:"not null;index"`
	TokenHash   string     `gorm:"size:128;not null;uniqueIndex"`
	ExpiresAt   *time.Time `gorm:"index"`
	RevokedAt   *time.Time `gorm:"index"`
	Remark      string     `gorm:"size:255"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// SystemError stores tenant-scoped application errors reported by the UI or
// request middleware. It deliberately keeps the request body/stack as text so
// deployments can trim or redact these fields at ingestion time.
type SystemError struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID   uint64 `gorm:"not null;index"`
	Status     string `gorm:"size:20;not null;index"`
	Revision   int    `gorm:"not null;default:0"`
	ResolvedAt *time.Time
	ResolvedBy *uint64
	RequestID  string `gorm:"size:128;index"`
	TraceID    string `gorm:"size:128;index"`
	Agent      string `gorm:"size:512"`
	App        string `gorm:"size:120;index"`
	Msg        string `gorm:"size:500"`
	Err        string `gorm:"size:1000"`
	Level      string `gorm:"size:20;index"`
	Request    string `gorm:"type:text"`
	UserID     uint64 `gorm:"index"`
	Solution   string `gorm:"type:text"`
	Stack      string `gorm:"type:text"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// FileObject is tenant-owned metadata for an uploaded file. File bytes are
// kept behind the storage adapter; StorageKey is opaque and always contains a
// tenant namespace so it cannot be reused across tenants.
type FileObject struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID   uint64 `gorm:"not null;index"`
	UserID     uint64 `gorm:"not null;index"`
	Name       string `gorm:"size:255;not null"`
	Hash       string `gorm:"size:64;not null;index"`
	Size       int64  `gorm:"not null"`
	MIME       string `gorm:"size:120;not null"`
	StorageKey string `gorm:"size:512;not null;uniqueIndex"`
	Category   string `gorm:"size:80;index"`
	Tag        string `gorm:"size:120"`
	Remark     string `gorm:"size:500"`
	Status     string `gorm:"size:20;not null;index;default:active"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
	DeletedAt  *time.Time `gorm:"index"`
}

// AutoCodeHistory is a tenant-scoped, reviewable record of a code-generation
// request. Generated source is stored as a preview and content hashes; the
// first stage deliberately never overwrites files in the running workspace.
// This makes repeated generation safe and gives later writers a durable input
// and diff baseline.
type AutoCodeHistory struct {
	ID              uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID        uint64 `gorm:"not null;index"`
	UserID          uint64 `gorm:"not null;index"`
	StructName      string `gorm:"size:120;not null"`
	PackageName     string `gorm:"size:120;not null"`
	TableName       string `gorm:"size:120"`
	Description     string `gorm:"size:500"`
	Request         string `gorm:"type:longtext"`
	Files           string `gorm:"type:longtext"`
	FileHashes      string `gorm:"type:longtext"`
	TemplateVersion string `gorm:"size:40;not null;default:'v1'"`
	Flag            int    `gorm:"not null;default:0;index"`
	Error           string `gorm:"size:1000"`
	RolledBackAt    *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// AutoCodePackage stores reusable package names for the generator UI. It is
// intentionally tenant scoped so one tenant cannot discover another tenant's
// naming conventions.
type AutoCodePackage struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;uniqueIndex:ux_tenant_codegen_package"`
	PackageName string `gorm:"size:120;not null;uniqueIndex:ux_tenant_codegen_package"`
	Description string `gorm:"size:500"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

var Models = []any{&Tenant{}, &User{}, &TenantMembership{}, &Role{}, &Menu{}, &Department{}, &APIResource{}, &TenantAPIGrant{}, &RoleMembership{}, &RoleMenu{}, &Dictionary{}, &DictionaryItem{}, &SystemParam{}, &AuditLog{}, &PlatformLoginLog{}, &TenantLoginLog{}, &RefreshSession{}, &APIToken{}, &SystemError{}, &FileObject{}, &AutoCodeHistory{}, &AutoCodePackage{}}
