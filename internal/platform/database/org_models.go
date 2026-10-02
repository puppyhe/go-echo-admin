package database

import "time"

// Position and membership rows are tenant scoped. Keeping the tenant key on
// the join tables prevents an id from one tenant being assigned in another.
type Position struct {
	ID        uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID  uint64 `gorm:"not null;uniqueIndex:ux_tenant_position_code"`
	Name      string `gorm:"size:120;not null"`
	Code      string `gorm:"size:80;not null;uniqueIndex:ux_tenant_position_code"`
	Sort      int
	Status    string `gorm:"size:20;not null;index"`
	Remark    string `gorm:"size:255"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type DepartmentMember struct {
	TenantID     uint64 `gorm:"primaryKey"`
	DepartmentID uint64 `gorm:"primaryKey"`
	UserID       uint64 `gorm:"primaryKey"`
}

type PositionMember struct {
	TenantID   uint64 `gorm:"primaryKey"`
	PositionID uint64 `gorm:"primaryKey"`
	UserID     uint64 `gorm:"primaryKey"`
}

func init() {
	Models = append(Models, &Position{}, &DepartmentMember{}, &PositionMember{})
}
