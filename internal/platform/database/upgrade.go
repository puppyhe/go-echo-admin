package database

import (
	"context"
	"time"

	"gorm.io/gorm"
)

// CurrentSchemaVersion is the application schema contract used by the
// upgrade CLI. AutoMigrate remains the safe baseline for additive changes;
// destructive or data-moving changes must be added as an explicit migration
// before this value is advanced.
const CurrentSchemaVersion = "2026.10.stage3"

// SchemaMigration records an applied application schema contract. It is
// append-only so operators can audit which release initialized a database.
type SchemaMigration struct {
	Version     string    `gorm:"primaryKey;size:80"`
	Checksum    string    `gorm:"size:128"`
	Description string    `gorm:"size:500"`
	AppliedAt   time.Time `gorm:"not null"`
}

func init() {
	Models = append(Models, &SchemaMigration{})
}

type UpgradeResult struct {
	Version     string `json:"version"`
	Applied     bool   `json:"applied"`
	DryRun      bool   `json:"dry_run"`
	Description string `json:"description"`
}

// Upgrade applies the current additive schema and records the release. The
// dry-run path never opens a write transaction, which makes it suitable for a
// deployment gate before backup and migration.
func (d *DB) Upgrade(ctx context.Context, dryRun bool) (UpgradeResult, error) {
	result := UpgradeResult{
		Version:     CurrentSchemaVersion,
		DryRun:      dryRun,
		Description: "stage 3 production baseline",
	}
	if dryRun {
		// A plan must remain read-only, but it should still tell an operator
		// whether this version is already recorded. Fresh databases do not have
		// the status table yet, so HasTable keeps the dry-run path non-invasive.
		if d.Migrator().HasTable(&SchemaMigration{}) {
			var applied SchemaMigration
			if err := d.WithContext(ctx).Where("version = ?", CurrentSchemaVersion).First(&applied).Error; err == nil {
				result.Applied = true
			} else if err != gorm.ErrRecordNotFound {
				return result, err
			}
		}
		return result, nil
	}
	if err := d.WithContext(ctx).AutoMigrate(Models...); err != nil {
		return result, err
	}
	row := SchemaMigration{Version: CurrentSchemaVersion}
	err := d.WithContext(ctx).Where("version = ?", CurrentSchemaVersion).First(&row).Error
	if err == nil {
		return result, nil
	}
	if err != gorm.ErrRecordNotFound {
		return result, err
	}
	row = SchemaMigration{Version: CurrentSchemaVersion, Description: result.Description, AppliedAt: time.Now().UTC()}
	if err := d.WithContext(ctx).Create(&row).Error; err != nil {
		return result, err
	}
	result.Applied = true
	return result, nil
}

func (d *DB) MigrationStatus(ctx context.Context) ([]SchemaMigration, error) {
	var rows []SchemaMigration
	if err := d.WithContext(ctx).Order("applied_at desc").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
