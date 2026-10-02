package database

// IAMRoleAction is the fine-grained permission layer used by the stage three
// permission matrix. Menu and API grants remain compatible with the reference
// frontend; action grants add an explicit resource/action/effect tuple for
// backend handlers and integrations.
type IAMRoleAction struct {
	TenantID uint64 `gorm:"primaryKey"`
	RoleID   uint64 `gorm:"primaryKey"`
	Resource string `gorm:"primaryKey;size:160"`
	Action   string `gorm:"primaryKey;size:80"`
	// Explicit false is a deny grant. The database default is false so GORM
	// cannot turn a zero value into an accidental allow.
	Effect bool `gorm:"not null;default:false"`
}

func init() {
	Models = append(Models, &IAMRoleAction{})
}
