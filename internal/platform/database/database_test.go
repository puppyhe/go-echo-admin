package database

import (
	"errors"
	"strings"
	"testing"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

func TestExplainOpenErrorForMissingNativePasswordPlugin(t *testing.T) {
	cause := &mysqlDriver.MySQLError{Number: 1524, SQLState: [5]byte{'H', 'Y', '0', '0', '0'}, Message: "Plugin 'mysql_native_password' is not loaded"}
	err := explainOpenError("mysql", cause)
	message := err.Error()
	if !strings.Contains(message, "caching_sha2_password") {
		t.Fatalf("expected authentication migration guidance, got %q", message)
	}
	if !strings.Contains(message, "does not change database accounts") {
		t.Fatalf("expected no-side-effect guidance, got %q", message)
	}
	if !errors.Is(err, cause) {
		t.Fatal("wrapped database error should remain discoverable")
	}
}

func TestExplainOpenErrorDoesNotAddMySQLHintForOtherErrors(t *testing.T) {
	cause := errors.New("dial tcp: connection refused")
	err := explainOpenError("mysql", cause)
	if strings.Contains(err.Error(), "caching_sha2_password") {
		t.Fatalf("unexpected authentication guidance for unrelated error: %q", err)
	}
	if !errors.Is(err, cause) {
		t.Fatal("wrapped database error should remain discoverable")
	}
}

func TestOpenRejectsUnsupportedDriver(t *testing.T) {
	if _, err := Open(Config{Driver: "postgres"}); err == nil || !strings.Contains(err.Error(), "only mysql is supported") {
		t.Fatalf("expected unsupported driver error, got %v", err)
	}
}
