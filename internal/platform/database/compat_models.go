package database

import "time"

// LegacyInfo, LegacyExportTemplate and LegacyVersion keep the compatibility
// endpoints used by the original administration pages tenant scoped.  The
// canonical APIs can migrate away from these records without changing the
// browser contract.
type LegacyInfo struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;index"`
	UserID      uint64 `gorm:"index"`
	Title       string `gorm:"size:200;not null"`
	Content     string `gorm:"type:text"`
	Attachments string `gorm:"type:text"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type LegacyExportTemplate struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID   uint64 `gorm:"not null;uniqueIndex:ux_tenant_export_name;uniqueIndex:ux_tenant_export_id"`
	Name       string `gorm:"size:120;not null;uniqueIndex:ux_tenant_export_name"`
	TemplateID string `gorm:"size:100;not null;uniqueIndex:ux_tenant_export_id"`
	TableName  string `gorm:"size:120"`
	FieldList  string `gorm:"type:text"`
	WhereCond  string `gorm:"size:1000"`
	OrderCond  string `gorm:"size:1000"`
	Limit      int
	SQL        string `gorm:"type:text"`
	Info       string `gorm:"size:600"`
	Query      string `gorm:"type:text"`
	Revision   int    `gorm:"not null;default:1"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type LegacyVersion struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement"`
	TenantID    uint64 `gorm:"not null;index"`
	VersionName string `gorm:"size:160;not null"`
	VersionCode string `gorm:"size:100;not null"`
	Description string `gorm:"size:600"`
	ImportMode  string `gorm:"size:20;not null;default:'export'"`
	VersionData string `gorm:"type:longtext"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func init() {
	Models = append(Models, &LegacyInfo{}, &LegacyExportTemplate{}, &LegacyVersion{})
}
