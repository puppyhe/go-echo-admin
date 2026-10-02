// Package testdb provides isolated MySQL databases for integration tests.
//
// The application intentionally supports MySQL only. Keeping test databases
// isolated preserves the self-contained behavior the old in-memory test setup
// provided without adding a second SQL driver to the binary.
package testdb

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
)

var sequence uint64

// Config provisions a temporary schema and returns the application database
// configuration for it. The schema is dropped when the test finishes.
func Config(t testing.TB) database.Config {
	t.Helper()
	values := dotEnvValues()
	get := func(name, fallback string) string {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
		if value := strings.TrimSpace(values[name]); value != "" {
			return value
		}
		return fallback
	}
	host := get("ECHO_ADMIN_TEST_DATABASE_HOST", get("ECHO_ADMIN_DATABASE_HOST", "127.0.0.1"))
	portText := get("ECHO_ADMIN_TEST_DATABASE_PORT", get("ECHO_ADMIN_DATABASE_PORT", "3306"))
	port, err := strconv.Atoi(portText)
	if err != nil || port <= 0 {
		t.Fatalf("invalid MySQL test port %q", portText)
	}
	user := get("ECHO_ADMIN_TEST_DATABASE_USER", get("ECHO_ADMIN_DATABASE_USER", "root"))
	password := get("ECHO_ADMIN_TEST_DATABASE_PASSWORD", get("ECHO_ADMIN_DATABASE_PASSWORD", ""))
	name := fmt.Sprintf("echo_admin_test_%d_%d", os.Getpid(), atomic.AddUint64(&sequence, 1))
	base := mysqlDriver.Config{User: user, Passwd: password, Net: "tcp", Addr: fmt.Sprintf("%s:%d", host, port), Collation: "utf8mb4_unicode_ci", ParseTime: true, Timeout: 3 * time.Second}
	adminDSN := base.FormatDSN()
	admin, err := sql.Open("mysql", adminDSN)
	if err != nil {
		t.Skipf("MySQL integration tests unavailable: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		_ = admin.Close()
		t.Skipf("MySQL integration tests unavailable: %v", err)
	}
	quoted := "`" + strings.ReplaceAll(name, "`", "``") + "`"
	if _, err := admin.ExecContext(ctx, "CREATE DATABASE "+quoted+" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); err != nil {
		_ = admin.Close()
		t.Skipf("cannot create MySQL test database: %v", err)
	}
	_ = admin.Close()
	t.Cleanup(func() {
		cleanup, err := sql.Open("mysql", adminDSN)
		if err != nil {
			return
		}
		defer cleanup.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = cleanup.ExecContext(ctx, "DROP DATABASE IF EXISTS "+quoted)
	})
	return database.Config{Driver: "mysql", Host: host, Port: port, Name: name, User: user, Password: password}
}

// Open provisions and migrates a temporary MySQL schema.
func Open(t testing.TB) *database.DB {
	t.Helper()
	db, err := database.Open(Config(t))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(context.Background()); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func dotEnvValues() map[string]string {
	values := make(map[string]string)
	dir, err := os.Getwd()
	if err != nil {
		return values
	}
	for {
		path := filepath.Join(dir, ".env")
		if content, err := os.ReadFile(path); err == nil {
			for _, line := range strings.Split(string(content), "\n") {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					values[strings.TrimSpace(parts[0])] = strings.Trim(strings.TrimSpace(parts[1]), "\"'")
				}
			}
			return values
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return values
		}
		dir = parent
	}
}
