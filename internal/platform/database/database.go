package database

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Config struct {
	Driver, DSN, Host, Name, User, Password string
	Port                                    int
}
type DB struct {
	*gorm.DB
	driver string
}

func Open(cfg Config) (*DB, error) {
	driver := strings.ToLower(strings.TrimSpace(cfg.Driver))
	if driver == "" {
		driver = "mysql"
	}
	if driver != "mysql" {
		return nil, fmt.Errorf("unsupported database driver %q; only mysql is supported", cfg.Driver)
	}
	dsn := cfg.DSN
	if dsn == "" {
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local", cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Name)
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.New(log.New(os.Stderr, "", log.LstdFlags), logger.Config{
		SlowThreshold:             200 * time.Millisecond,
		LogLevel:                  logger.Warn,
		IgnoreRecordNotFoundError: true,
		Colorful:                  false,
	})})
	if err != nil {
		return nil, explainOpenError("mysql", err)
	}
	return &DB{DB: db, driver: "mysql"}, nil
}
func (d *DB) Migrate(ctx context.Context) error { return d.WithContext(ctx).AutoMigrate(Models...) }
func (d *DB) Close() error {
	sql, err := d.DB.DB()
	if err != nil {
		return err
	}
	return sql.Close()
}
func (d *DB) Ping(ctx context.Context) error {
	sql, err := d.DB.DB()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return sql.PingContext(ctx)
}
func Scope(db *gorm.DB, tenantID uint64) *gorm.DB { return db.Where("tenant_id = ?", tenantID) }

// explainOpenError keeps connection failures actionable without exposing DSNs,
// passwords, or other configuration values in CLI output.
func explainOpenError(driver string, err error) error {
	if driver == "mysql" {
		var mysqlErr *mysqlDriver.MySQLError
		if errors.As(err, &mysqlErr) && mysqlErr.Number == 1524 && strings.Contains(strings.ToLower(mysqlErr.Message), "mysql_native_password") {
			return fmt.Errorf("open mysql database: authentication plugin mysql_native_password is unavailable; ask the database administrator to migrate this account to caching_sha2_password, then retry (the application does not change database accounts): %w", err)
		}
	}
	return fmt.Errorf("open %s database: %w", driver, err)
}
