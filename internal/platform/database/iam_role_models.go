package database

// IAMRoleSetting stores the role editor's tenant-local hierarchy and landing
// page, without adding these frontend details to the canonical role contract.
type IAMRoleSetting struct {
	TenantID         uint64 `gorm:"primaryKey"`
	RoleID           uint64 `gorm:"primaryKey"`
	ParentID         *uint64
	DefaultRouter    string `gorm:"size:255;not null;default:''"`
	DataAuthorityIDs string `gorm:"type:text;column:data_authority_ids"`
	DataScope        string `gorm:"size:40;not null;default:all;column:data_scope"`
}

func init() {
	Models = append(Models, &IAMRoleSetting{})
}
