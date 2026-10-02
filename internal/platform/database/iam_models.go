package database

// IAM compatibility data is tenant scoped. These tables back the reference
// frontend without changing the global user identity shared by memberships.
type IAMUserProfile struct {
	TenantID     uint64  `gorm:"primaryKey"`
	UserID       uint64  `gorm:"primaryKey"`
	Nickname     string  `gorm:"size:120;not null;default:''"`
	Phone        string  `gorm:"size:32;not null;default:''"`
	Email        *string `gorm:"size:190"`
	Avatar       string  `gorm:"size:512;not null;default:''"`
	Status       string  `gorm:"size:20;not null;default:active"`
	PasswordHash *string `gorm:"size:255"`
}

type IAMMenuSetting struct {
	TenantID    uint64 `gorm:"primaryKey"`
	MenuID      uint64 `gorm:"primaryKey"`
	Title       string `gorm:"size:120;not null;default:''"`
	Icon        string `gorm:"size:120;not null;default:''"`
	KeepAlive   bool   `gorm:"not null;default:true"`
	DefaultMenu bool   `gorm:"not null;default:false"`
	CloseTab    bool   `gorm:"not null;default:false"`
	Component   string `gorm:"size:255"`
	Parameters  string `gorm:"type:text"`
}

type IAMMenuButton struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;uniqueIndex:ux_iam_menu_button"`
	MenuID      uint64 `gorm:"not null;uniqueIndex:ux_iam_menu_button"`
	Name        string `gorm:"size:80;not null;uniqueIndex:ux_iam_menu_button"`
	Description string `gorm:"size:255"`
}

type IAMRoleButton struct {
	TenantID uint64 `gorm:"primaryKey"`
	RoleID   uint64 `gorm:"primaryKey"`
	ButtonID uint64 `gorm:"primaryKey"`
}

type IAMRoleAPI struct {
	TenantID      uint64 `gorm:"primaryKey"`
	RoleID        uint64 `gorm:"primaryKey"`
	APIResourceID uint64 `gorm:"primaryKey"`
}

func init() {
	Models = append(Models, &IAMUserProfile{}, &IAMMenuSetting{}, &IAMMenuButton{}, &IAMRoleButton{}, &IAMRoleAPI{})
}
