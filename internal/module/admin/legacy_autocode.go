package admin

// The code generator intentionally starts in review mode. It can inspect the
// current database, produce deterministic CRUD source previews and persist a
// generation record, but it never writes over application files implicitly.
// This is the safe foundation for later template and workspace writers.

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/puppyhe/go-echo-admin/internal/platform/database"
	"github.com/puppyhe/go-echo-admin/internal/platform/httpx"
	"gorm.io/gorm"
)

const autoCodeTemplateVersion = "v1"

// AutoCodePreviewOptions is the small, dependency-free contract used by the
// CLI and HTTP preview endpoint. The HTTP handler accepts the richer legacy
// form; callers outside this package can use this safe subset for repeatable
// local generation.
type AutoCodePreviewOptions struct {
	StructName  string
	PackageName string
	TableName   string
	Description string
	GEAModel    bool
	Fields      []AutoCodePreviewField
}

type AutoCodePreviewField struct {
	FieldName  string
	FieldType  string
	FieldJSON  string
	ColumnName string
}

// RenderAutoCodePreview returns deterministic source files without touching
// the database or filesystem. The CLI uses this function so command-line and
// HTTP previews cannot drift into two different generators.
func RenderAutoCodePreview(options AutoCodePreviewOptions) map[string]string {
	fields := make([]autoCodeFieldInput, 0, len(options.Fields))
	for _, field := range options.Fields {
		fields = append(fields, autoCodeFieldInput{FieldName: field.FieldName, FieldType: field.FieldType, FieldJSON: field.FieldJSON, ColumnName: field.ColumnName})
	}
	return generateAutoCode(autoCodeFormInput{StructName: options.StructName, PackageName: options.PackageName, TableName: options.TableName, Description: options.Description, GEAModel: options.GEAModel, Fields: fields})
}

type autoCodeFieldInput struct {
	FieldName       string `json:"fieldName"`
	FieldType       string `json:"fieldType"`
	FieldJSON       string `json:"fieldJson"`
	ColumnName      string `json:"columnName"`
	FieldDesc       string `json:"fieldDesc"`
	FieldSearchType string `json:"fieldSearchType"`
	Require         bool   `json:"require"`
	DigitList       bool   `json:"digitList"`
	DigitSort       bool   `json:"digitSort"`
	Form            bool   `json:"form"`
	Table           bool   `json:"table"`
	Desc            bool   `json:"desc"`
	Excel           bool   `json:"excel"`
	PrimaryKey      bool   `json:"primaryKey"`
	DefaultValue    string `json:"defaultValue"`
	DataTypeLong    string `json:"dataTypeLong"`
	Nullable        bool   `json:"nullable"`
	AutoIncrement   bool   `json:"autoIncrement"`
	DictType        string `json:"dictType"`
}

type autoCodeFormInput struct {
	Abbreviation     string               `json:"abbreviation"`
	StructName       string               `json:"structName"`
	Description      string               `json:"description"`
	TableName        string               `json:"tableName"`
	PackageName      string               `json:"packageName"`
	Package          string               `json:"package"`
	BusinessDB       string               `json:"businessDB"`
	GEAModel         bool                 `json:"geaModel"`
	DisableDataScope bool                 `json:"disableDataScope"`
	AutoCreateAPI    bool                 `json:"autoCreateApiToSql"`
	AutoCreateMenu   bool                 `json:"autoCreateMenuToSql"`
	AutoCreateBtn    bool                 `json:"autoCreateBtnAuth"`
	HasExcel         bool                 `json:"hasExcel"`
	AutoMigrate      bool                 `json:"autoMigrate"`
	OnlyTemplate     bool                 `json:"onlyTemplate"`
	IsTree           bool                 `json:"isTree"`
	TreeJSON         string               `json:"treeJson"`
	HumpPackageName  string               `json:"humpPackageName"`
	GenerateWeb      bool                 `json:"generateWeb"`
	GenerateServer   bool                 `json:"generateServer"`
	Fields           []autoCodeFieldInput `json:"fields"`
}

type autoCodeColumnView struct {
	ColumnName    string  `json:"columnName"`
	ColumnType    string  `json:"columnType"`
	Nullable      bool    `json:"nullable"`
	AutoIncrement bool    `json:"autoIncrement"`
	HasDefault    bool    `json:"hasDefault"`
	ColumnComment *string `json:"columnComment,omitempty"`
	PrimaryKey    bool    `json:"primaryKey"`
	DataTypeLong  string  `json:"dataTypeLong,omitempty"`
	DefaultValue  string  `json:"defaultValue,omitempty"`
}

var autoCodeIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
var autoCodeLength = regexp.MustCompile(`^\d+(,\d+)?$`)

func RegisterLegacyAutoCodeRoutes(g *echo.Group, s *Service) {
	read := []echo.MiddlewareFunc{s.RequirePermission("codegen:list")}
	write := []echo.MiddlewareFunc{s.RequirePermission("codegen:create")}
	g.GET("/autoCode/getDB", s.legacyAutoCodeDB, read...)
	g.GET("/autoCode/getTables", s.legacyAutoCodeTables, read...)
	g.GET("/autoCode/getColumn", s.legacyAutoCodeColumns, read...)
	g.POST("/autoCode/preview", s.legacyAutoCodePreview, read...)
	g.POST("/autoCode/getPackage", s.legacyAutoCodePackages, read...)
	g.POST("/autoCode/createPackage", s.legacyAutoCodeCreatePackage, write...)
	g.POST("/autoCode/delPackage", s.legacyAutoCodeDeletePackage, write...)
	g.POST("/autoCode/createTemp", s.legacyAutoCodeCreate, write...)
	g.POST("/autoCode/getSysHistory", s.legacyAutoCodeHistory, read...)
	g.POST("/autoCode/getMeta", s.legacyAutoCodeMeta, read...)
	g.POST("/autoCode/delSysHistory", s.legacyAutoCodeDeleteHistory, write...)
	g.POST("/autoCode/rollback", s.legacyAutoCodeRollback, write...)
}

func (s *Service) legacyAutoCodeDB(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var dbName string
	if err := s.DB.WithContext(c.Request().Context()).Raw("SELECT DATABASE()").Scan(&dbName).Error; err != nil {
		return err
	}
	if dbName == "" {
		return legacyOK(c, map[string]any{"dbs": []map[string]string{}})
	}
	return legacyOK(c, map[string]any{"dbs": []map[string]string{{"database": dbName}}})
}

func (s *Service) legacyAutoCodeTables(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var input struct {
		DBName string `query:"dbName" json:"dbName"`
	}
	_ = c.Bind(&input)
	var names []string
	err := s.DB.WithContext(c.Request().Context()).Raw("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name").Scan(&names).Error
	if err != nil {
		return err
	}
	rows := make([]map[string]string, 0, len(names))
	for _, name := range names {
		rows = append(rows, map[string]string{"tableName": name})
	}
	return legacyOK(c, map[string]any{"tables": rows})
}

func (s *Service) legacyAutoCodeColumns(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	var input struct {
		DBName    string `query:"dbName" json:"dbName"`
		TableName string `query:"tableName" json:"tableName"`
	}
	_ = c.Bind(&input)
	input.TableName = strings.TrimSpace(input.TableName)
	if !autoCodeIdentifier.MatchString(input.TableName) {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "表名格式不正确")
	}
	return s.mysqlAutoCodeColumns(c, input.TableName)
}

func (s *Service) mysqlAutoCodeColumns(c *echo.Context, table string) error {
	var rows []autoCodeColumnView
	query := `SELECT column_name, data_type, is_nullable, column_default, column_key, extra, column_comment FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`
	result, err := s.DB.WithContext(c.Request().Context()).Raw(query, table).Rows()
	if err != nil {
		return err
	}
	defer result.Close()
	for result.Next() {
		var name, typ, nullable, key, extra, comment string
		var defaultValue *string
		if err := result.Scan(&name, &typ, &nullable, &defaultValue, &key, &extra, &comment); err != nil {
			return err
		}
		rows = append(rows, autoCodeColumnView{ColumnName: name, ColumnType: typ, Nullable: strings.EqualFold(nullable, "YES"), AutoIncrement: strings.Contains(strings.ToLower(extra), "auto_increment"), HasDefault: defaultValue != nil, PrimaryKey: strings.EqualFold(key, "PRI"), ColumnComment: stringPtr(comment), DefaultValue: valueOrEmpty(defaultValue)})
	}
	if err := result.Err(); err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"columns": rows})
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (s *Service) bindAutoCodeForm(c *echo.Context) (autoCodeFormInput, error) {
	var in autoCodeFormInput
	if err := c.Bind(&in); err != nil {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "代码生成配置格式错误")
	}
	in.StructName = strings.TrimSpace(in.StructName)
	in.TableName = strings.TrimSpace(in.TableName)
	in.PackageName = strings.TrimSpace(in.PackageName)
	in.Package = strings.TrimSpace(in.Package)
	if in.StructName == "" || !autoCodeIdentifier.MatchString(in.StructName) {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "结构名称必须是合法的 Go 标识符")
	}
	if in.TableName != "" && !autoCodeIdentifier.MatchString(in.TableName) {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "表名格式不正确")
	}
	if in.PackageName == "" {
		in.PackageName = strings.ToLower(in.StructName)
	}
	if !autoCodeIdentifier.MatchString(in.PackageName) {
		return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "包名格式不正确")
	}
	for index := range in.Fields {
		field := &in.Fields[index]
		field.FieldName = strings.TrimSpace(field.FieldName)
		field.FieldJSON = strings.TrimSpace(field.FieldJSON)
		field.ColumnName = strings.TrimSpace(field.ColumnName)
		if field.FieldName == "" || !autoCodeIdentifier.MatchString(field.FieldName) {
			return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", fmt.Sprintf("第 %d 个字段名称不正确", index+1))
		}
		if field.FieldJSON == "" {
			field.FieldJSON = lowerFirst(field.FieldName)
		}
		if field.ColumnName == "" {
			field.ColumnName = toSnake(field.FieldName)
		}
		if !autoCodeIdentifier.MatchString(strings.ReplaceAll(field.ColumnName, "-", "_")) {
			return in, httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", fmt.Sprintf("第 %d 个数据库字段名称不正确", index+1))
		}
		if field.FieldType == "" {
			field.FieldType = "string"
		}
	}
	return in, nil
}

func (s *Service) legacyAutoCodePreview(c *echo.Context) error {
	if _, err := identityFrom(c); err != nil {
		return err
	}
	in, err := s.bindAutoCodeForm(c)
	if err != nil {
		return err
	}
	files := generateAutoCode(in)
	return legacyOK(c, map[string]any{"autoCode": files, "impact": autoCodeImpact(in, files), "templateVersion": autoCodeTemplateVersion, "safeMode": true, "message": "预览模式不会覆盖工作区文件"})
}

func autoCodeImpact(in autoCodeFormInput, files map[string]string) map[string]any {
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	base := strings.ToLower(in.StructName)
	if in.TableName != "" {
		base = strings.ToLower(in.TableName)
	}
	impact := map[string]any{
		"files":        paths,
		"overwrite":    []string{},
		"apis":         []map[string]string{},
		"menus":        []map[string]string{},
		"buttons":      []map[string]string{},
		"dictionaries": []map[string]string{},
		"permissions":  []string{},
	}
	if in.AutoCreateAPI {
		impact["apis"] = []map[string]string{{"method": "GET", "path": "/api/v1/" + base, "permission": base + ":list"}, {"method": "POST", "path": "/api/v1/" + base, "permission": base + ":create"}}
		impact["permissions"] = []string{base + ":list", base + ":create", base + ":update", base + ":delete"}
	}
	if in.AutoCreateMenu {
		impact["menus"] = []map[string]string{{"name": in.Description, "path": "/" + base, "component": "generated/" + base}}
	}
	if in.AutoCreateBtn {
		impact["buttons"] = []map[string]string{{"name": base + ":create", "description": "新增"}, {"name": base + ":update", "description": "编辑"}, {"name": base + ":delete", "description": "删除"}}
	}
	return impact
}

func generateAutoCode(in autoCodeFormInput) map[string]string {
	base := strings.ToLower(in.StructName)
	if in.Abbreviation != "" {
		base = strings.ToLower(in.Abbreviation)
	}
	if in.TableName != "" {
		base = strings.ToLower(in.TableName)
	}
	var model strings.Builder
	fmt.Fprintf(&model, "// Code generated by go-echo-admin %s. DO NOT EDIT.\npackage %s\n\n", autoCodeTemplateVersion, in.PackageName)
	needsTime, needsJSON := false, false
	for _, field := range in.Fields {
		switch goType(field.FieldType) {
		case "time.Time":
			needsTime = true
		case "json.RawMessage":
			needsJSON = true
		}
	}
	if needsTime || needsJSON {
		model.WriteString("import (\n")
		if needsJSON {
			model.WriteString("\t\"encoding/json\"\n")
		}
		if needsTime {
			model.WriteString("\t\"time\"\n")
		}
		model.WriteString(")\n\n")
	}
	fmt.Fprintf(&model, "// %s %s\ntype %s struct {\n", in.StructName, in.Description, in.StructName)
	if in.GEAModel {
		model.WriteString("\tTenantID uint64 `json:\"tenant_id\" gorm:\"index;not null\"`\n")
	}
	for _, field := range in.Fields {
		goType := goType(field.FieldType)
		jsonName := field.FieldJSON
		if jsonName == "" {
			jsonName = lowerFirst(field.FieldName)
		}
		fmt.Fprintf(&model, "\t%s %s `json:\"%s\" db:\"%s\"`\n", field.FieldName, goType, jsonName, field.ColumnName)
	}
	model.WriteString("}\n")

	var repo strings.Builder
	fmt.Fprintf(&repo, "package %s\n\n// Repository boundary for %s. Keep tenant filters in every query.\ntype %sRepository interface {\n\tList(tenantID uint64) ([]%s, error)\n}\n", in.PackageName, in.StructName, in.StructName, in.StructName)
	var service strings.Builder
	fmt.Fprintf(&service, "package %s\n\n// Service boundary for %s. Validate input before persistence.\ntype %sService struct {\n\tRepo %sRepository\n}\n", in.PackageName, in.StructName, in.StructName, in.StructName)
	var handler strings.Builder
	fmt.Fprintf(&handler, "package %s\n\n// HTTP handlers for %s are intentionally thin adapters.\nfunc Register%sRoutes() {\n\t// TODO: bind, validate and delegate to the service.\n}\n", in.PackageName, in.StructName, in.StructName)
	var route strings.Builder
	fmt.Fprintf(&route, "# Generated API manifest\nresource: %s\npath: /api/v1/%s\npermission: %s:list\n", in.StructName, base, base)
	var migration strings.Builder
	fmt.Fprintf(&migration, "-- Generated migration preview for %s\nCREATE TABLE %s (\n", in.StructName, base)
	if in.GEAModel {
		migration.WriteString("  tenant_id BIGINT NOT NULL,\n")
	}
	for index, field := range in.Fields {
		comma := ","
		if index == len(in.Fields)-1 {
			comma = ""
		}
		fmt.Fprintf(&migration, "  %s %s%s\n", field.ColumnName, sqlType(field.FieldType, field.DataTypeLong), comma)
	}
	migration.WriteString(");\n")
	test := fmt.Sprintf("package %s\n\nimport \"testing\"\n\nfunc Test%sTenantScope(t *testing.T) {\n\t// Verify tenant_id is present in every repository query.\n}\n", in.PackageName, in.StructName)
	web := fmt.Sprintf("import { Table } from 'antd';\n\nexport default function %sPage() {\n  return <Table rowKey=\"id\" dataSource={[]} columns={[]} />;\n}\n", in.StructName)
	return map[string]string{
		"server/model/" + base + ".go":      model.String(),
		"server/repository/" + base + ".go": repo.String(),
		"server/service/" + base + ".go":    service.String(),
		"server/handler/" + base + ".go":    handler.String(),
		"server/routes/" + base + ".yaml":   route.String(),
		"server/migration/" + base + ".sql": migration.String(),
		"server/" + base + "_test.go":       test,
		"web/" + base + "Page.tsx":          web,
	}
}

func goType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "int", "integer":
		return "int"
	case "uint":
		return "uint"
	case "int64", "bigint":
		return "int64"
	case "uint64":
		return "uint64"
	case "float64", "decimal", "double":
		return "float64"
	case "bool", "boolean":
		return "bool"
	case "time.time", "datetime", "timestamp", "date":
		return "time.Time"
	case "json", "jsonb":
		return "json.RawMessage"
	default:
		return "string"
	}
}

func sqlType(value, size string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "int", "integer":
		return "INT"
	case "uint", "uint64", "bigint", "int64":
		return "BIGINT"
	case "float64", "decimal", "double":
		return "DECIMAL(20,6)"
	case "bool", "boolean":
		return "BOOLEAN"
	case "time.time", "datetime", "timestamp":
		return "DATETIME"
	case "json", "jsonb":
		return "JSON"
	default:
		if size != "" && autoCodeLength.MatchString(size) {
			return "VARCHAR(" + size + ")"
		}
		return "VARCHAR(255)"
	}
}

func lowerFirst(value string) string {
	if value == "" {
		return value
	}
	return strings.ToLower(value[:1]) + value[1:]
}

func toSnake(value string) string {
	var out []rune
	for index, r := range value {
		if index > 0 && r >= 'A' && r <= 'Z' {
			out = append(out, '_')
		}
		out = append(out, []rune(strings.ToLower(string(r)))...)
	}
	return string(out)
}

func (s *Service) legacyAutoCodeCreate(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	in, err := s.bindAutoCodeForm(c)
	if err != nil {
		return err
	}
	files := generateAutoCode(in)
	if in.OnlyTemplate {
		return writeAutoCodeZip(c, files, in.StructName)
	}
	requestJSON, _ := json.Marshal(in)
	filesJSON, _ := json.Marshal(files)
	hashes := make(map[string]string, len(files))
	for path, content := range files {
		digest := sha256.Sum256([]byte(content))
		hashes[path] = hex.EncodeToString(digest[:])
	}
	hashJSON, _ := json.Marshal(hashes)
	row := database.AutoCodeHistory{TenantID: id.TenantID, UserID: id.UserID, StructName: in.StructName, PackageName: in.PackageName, TableName: in.TableName, Description: in.Description, Request: string(requestJSON), Files: string(filesJSON), FileHashes: string(hashJSON), TemplateVersion: autoCodeTemplateVersion, Flag: 0}
	if err := s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"history": autoCodeHistoryView(row), "impact": autoCodeImpact(in, files), "generated": false, "message": "已保存生成记录和预览文件；安全模式不会覆盖工作区"})
}

func writeAutoCodeZip(c *echo.Context, files map[string]string, name string) error {
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		writer, err := archive.Create(path)
		if err != nil {
			return err
		}
		if _, err := writer.Write([]byte(files[path])); err != nil {
			return err
		}
	}
	if err := archive.Close(); err != nil {
		return err
	}
	c.Response().Header().Set(echo.HeaderContentType, "application/zip")
	c.Response().Header().Set(echo.HeaderContentDisposition, `attachment; filename="`+strings.ToLower(name)+`.zip"`)
	return c.Blob(http.StatusOK, "application/zip", buffer.Bytes())
}

func autoCodeHistoryView(row database.AutoCodeHistory) map[string]any {
	return map[string]any{"ID": row.ID, "id": row.ID, "structName": row.StructName, "packageName": row.PackageName, "tableName": row.TableName, "description": row.Description, "request": row.Request, "flag": row.Flag, "templateVersion": row.TemplateVersion, "CreatedAt": row.CreatedAt, "createdAt": row.CreatedAt}
}

func (s *Service) legacyAutoCodeHistory(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	page, size := legacyPageParams(c)
	var total int64
	query := s.DB.WithContext(c.Request().Context()).Model(&database.AutoCodeHistory{}).Where("tenant_id = ?", id.TenantID)
	if err := query.Count(&total).Error; err != nil {
		return err
	}
	var rows []database.AutoCodeHistory
	if err := query.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, autoCodeHistoryView(row))
	}
	return legacyOK(c, map[string]any{"list": items, "page": page, "pageSize": size, "total": total})
}

func (s *Service) legacyAutoCodeMeta(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var input map[string]any
	if err := c.Bind(&input); err != nil {
		return err
	}
	rowID := number(first(input, "ID", "id"))
	var row database.AutoCodeHistory
	if err := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ? AND id = ?", id.TenantID, rowID).First(&row).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "生成记录不存在")
		}
		return err
	}
	var form autoCodeFormInput
	if err := json.Unmarshal([]byte(row.Request), &form); err != nil {
		return err
	}
	return legacyOK(c, form)
}

func (s *Service) legacyAutoCodeDeleteHistory(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var input map[string]any
	_ = c.Bind(&input)
	rowID := number(first(input, "ID", "id"))
	result := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ? AND id = ?", id.TenantID, rowID).Delete(&database.AutoCodeHistory{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "生成记录不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}

func (s *Service) legacyAutoCodeRollback(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var input map[string]any
	_ = c.Bind(&input)
	rowID := number(first(input, "ID", "id"))
	var row database.AutoCodeHistory
	if err := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ? AND id = ?", id.TenantID, rowID).First(&row).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "生成记录不存在")
		}
		return err
	}
	now := time.Now()
	if err := s.DB.WithContext(c.Request().Context()).Model(&row).Updates(map[string]any{"flag": 2, "rolled_back_at": now}).Error; err != nil {
		return err
	}
	return legacyOK(c, map[string]any{"rolledBack": true, "filesChanged": false, "message": "已回滚生成记录状态；安全模式未写入工作区文件"})
}

func (s *Service) legacyAutoCodePackages(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var rows []database.AutoCodePackage
	if err := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ?", id.TenantID).Order("package_name asc").Find(&rows).Error; err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, map[string]any{"ID": row.ID, "id": row.ID, "packageName": row.PackageName, "packageDesc": row.Description, "desc": row.Description})
	}
	return legacyOK(c, map[string]any{"pkgs": items, "packages": items})
}

func (s *Service) legacyAutoCodeCreatePackage(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var input struct {
		PackageName string `json:"packageName"`
		Description string `json:"packageDesc"`
		Desc        string `json:"desc"`
	}
	if err := c.Bind(&input); err != nil {
		return err
	}
	input.PackageName = strings.TrimSpace(input.PackageName)
	if input.Description == "" {
		input.Description = input.Desc
	}
	if input.PackageName == "" || !autoCodeIdentifier.MatchString(input.PackageName) {
		return httpx.NewError(http.StatusBadRequest, "VALIDATION_ERROR", "包名必须是合法标识符")
	}
	row := database.AutoCodePackage{TenantID: id.TenantID, PackageName: input.PackageName, Description: strings.TrimSpace(input.Description)}
	if err := s.DB.WithContext(c.Request().Context()).Create(&row).Error; err != nil {
		return httpx.NewError(http.StatusConflict, "PACKAGE_EXISTS", "包名已存在")
	}
	return legacyOK(c, map[string]any{"package": map[string]any{"ID": row.ID, "packageName": row.PackageName, "packageDesc": row.Description}})
}

func (s *Service) legacyAutoCodeDeletePackage(c *echo.Context) error {
	id, err := identityFrom(c)
	if err != nil {
		return err
	}
	var input map[string]any
	_ = c.Bind(&input)
	rowID := number(first(input, "ID", "id"))
	result := s.DB.WithContext(c.Request().Context()).Where("tenant_id = ? AND id = ?", id.TenantID, rowID).Delete(&database.AutoCodePackage{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return httpx.NewError(http.StatusNotFound, "NOT_FOUND", "包记录不存在")
	}
	return legacyOK(c, map[string]any{"deleted": true})
}
