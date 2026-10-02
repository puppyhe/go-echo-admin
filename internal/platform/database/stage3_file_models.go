package database

import "time"

// FileUploadSession tracks a resumable upload without putting temporary bytes
// in the database. Parts live in the configured Store under a tenant-scoped
// opaque key and are removed after completion or cancellation.
type FileUploadSession struct {
	ID           string    `gorm:"primaryKey;size:64"`
	TenantID     uint64    `gorm:"not null;index"`
	UserID       uint64    `gorm:"not null;index"`
	Name         string    `gorm:"size:255;not null"`
	MIME         string    `gorm:"size:120"`
	ExpectedSize int64     `gorm:"not null"`
	ChunkSize    int64     `gorm:"not null"`
	TotalParts   int       `gorm:"not null"`
	ExpectedHash string    `gorm:"size:64"`
	Status       string    `gorm:"size:20;not null;index"`
	Received     int64     `gorm:"not null;default:0"`
	FileID       uint64    `gorm:"index"`
	ExpiresAt    time.Time `gorm:"index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type FileUploadPart struct {
	ID        uint64 `gorm:"primaryKey;autoIncrement"`
	SessionID string `gorm:"size:64;not null;uniqueIndex:ux_upload_part"`
	TenantID  uint64 `gorm:"not null;index"`
	PartNo    int    `gorm:"not null;uniqueIndex:ux_upload_part"`
	Size      int64  `gorm:"not null"`
	Hash      string `gorm:"size:64;not null"`
	StoreKey  string `gorm:"size:512;not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func init() {
	Models = append(Models, &FileUploadSession{}, &FileUploadPart{})
}
