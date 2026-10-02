package admin

import (
	"net/http"
	"strings"
	"testing"

	"github.com/puppyhe/go-echo-admin/internal/platform/database"
)

func TestAutoCodePreviewAndHistoryAreTenantScoped(t *testing.T) {
	s := testService(t)
	if err := s.Seed(t.Context(), "admin", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "acme", "admin")
	form := map[string]any{
		"structName": "Customer", "packageName": "customer", "tableName": "customers", "geaModel": true,
		"description": "客户", "fields": []map[string]any{{"fieldName": "Name", "fieldJson": "name", "columnName": "name", "fieldType": "string", "table": true}},
	}
	preview := orgContext(s, http.MethodPost, "/autoCode/preview", form, id)
	if err := s.legacyAutoCodePreview(preview); err != nil {
		t.Fatal(err)
	}
	// Preview is deterministic and always contains the model and migration
	// entries, even when the UI has not selected a database table.
	files := generateAutoCode(autoCodeFormInput{StructName: "Customer", PackageName: "customer", TableName: "customers", GEAModel: true, Fields: []autoCodeFieldInput{{FieldName: "Name", FieldJSON: "name", ColumnName: "name", FieldType: "string"}, {FieldName: "CreatedAt", FieldJSON: "createdAt", ColumnName: "created_at", FieldType: "time.Time"}}})
	if len(files) == 0 || !strings.Contains(files["server/model/customers.go"], "\"time\"") || strings.Contains(files["server/model/customers.go"], `\\n`) {
		t.Fatal("preview returned an empty response")
	}

	create := orgContext(s, http.MethodPost, "/autoCode/createTemp", form, id)
	if err := s.legacyAutoCodeCreate(create); err != nil {
		t.Fatal(err)
	}
	var history database.AutoCodeHistory
	if err := s.DB.Where("tenant_id = ?", id.TenantID).First(&history).Error; err != nil {
		t.Fatal(err)
	}
	if history.StructName != "Customer" || history.Flag != 0 || history.FileHashes == "" {
		t.Fatalf("unexpected generation history: %#v", history)
	}
}

func TestAutoCodeReadsMySQLMetadata(t *testing.T) {
	s := testService(t)
	if err := s.Seed(t.Context(), "admin", "correct horse battery", "acme", "Acme", false); err != nil {
		t.Fatal(err)
	}
	id := orgIdentity(t, s, "acme", "admin")
	if err := s.DB.Exec("CREATE TABLE codegen_items (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created_at DATETIME)").Error; err != nil {
		t.Fatal(err)
	}
	if err := s.legacyAutoCodeTables(orgContext(s, http.MethodGet, "/autoCode/getTables?dbName=main", nil, id)); err != nil {
		t.Fatal(err)
	}
	if err := s.legacyAutoCodeColumns(orgContext(s, http.MethodGet, "/autoCode/getColumn?dbName=main&tableName=codegen_items", nil, id)); err != nil {
		t.Fatal(err)
	}
}
