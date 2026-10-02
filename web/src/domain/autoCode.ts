// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Internal implementation detail.
export interface AutoCodeDataSource {
  dbName: string;
  table: string;
  label: string;
  value: string;
  association: 1 | 2;
  hasDeletedAt: boolean;
}

// Internal implementation detail.
export interface AutoCodeField {
  databaseDefault?: boolean;
  nullable?: boolean;
  notNull?: boolean;
  hasDefault?: boolean;
  autoIncrement?: boolean;
  // Internal implementation detail.
  fieldName: string;
  /** Go type：string / int / time.Time / float64 / bool ... */
  fieldType: string;
  // Internal implementation detail.
  fieldJson: string;
  // Internal implementation detail.
  columnName: string;
  // Internal implementation detail.
  fieldDesc: string;
  // Internal implementation detail.
  fieldSearchType: string;
  // Internal implementation detail.
  digitSearch: boolean;
  // Internal implementation detail.
  digitList: boolean;
  /** sort */
  digitSort: boolean;
  // Internal implementation detail.
  require: boolean;
  // Internal implementation detail.
  clearable: boolean;
  // Internal implementation detail.
  errorText: string;
  dataTypeLong?: string;
  comment?: string;
  fieldSearchHide?: boolean;
  dictType?: string;
  form?: boolean;
  table?: boolean;
  desc?: boolean;
  excel?: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
  dataSource?: AutoCodeDataSource | null;
  fieldIndexType?: string;
}

// Internal implementation detail.
export interface AutoCodeForm {
  abbreviation: string;
  // Internal implementation detail.
  structName: string;
  description: string;
  tableName: string;
  packageName: string;
  // Internal implementation detail.
  package: string;
  businessDB: string;
  geaModel: boolean;
  /** Existing shared tables can explicitly retain API-only authorization. */
  disableDataScope?: boolean;
  autoCreateApiToSql: boolean;
  autoCreateMenuToSql: boolean;
  autoCreateBtnAuth: boolean;
  hasExcel: boolean;
  autoMigrate: boolean;
  onlyTemplate: boolean;
  isTree: boolean;
  treeJson?: string;
  humpPackageName?: string;
  generateWeb?: boolean;
  generateServer?: boolean;
  fields: AutoCodeField[];
}

// Internal implementation detail.
export type AutoCodeSwitchKey =
  | 'geaModel'
  | 'disableDataScope'
  | 'autoCreateApiToSql'
  | 'autoCreateMenuToSql'
  | 'autoCreateBtnAuth'
  | 'hasExcel'
  | 'autoMigrate'
  | 'onlyTemplate';

// Internal implementation detail.
export interface AutoCodeColumn {
  defaultExpression?: boolean;
  columnName: string;
  columnType: string;
  nullable?: boolean;
  autoIncrement?: boolean;
  hasDefault?: boolean;
  columnComment?: string | null;
  primaryKey?: boolean;
  dataTypeLong?: string;
  defaultValue?: string;
}

// Internal implementation detail.
export interface SysPackage {
  ID: number;
  packageName: string;
  packageDesc: string;
}

// Internal implementation detail.
export interface SysHistory {
  ID: number;
  CreatedAt?: string;
  structName: string;
  packageName: string;
  tableName?: string;
  description?: string;
  // Internal implementation detail.
  request?: string;
}

// Internal implementation detail.

// Internal implementation detail.
export function upperFirst(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// Internal implementation detail.
export function lowerFirst(str: string): string {
  return str ? str.charAt(0).toLowerCase() + str.slice(1) : '';
}

// Internal implementation detail.
export function toHump(name: string): string {
  return name.replace(/_(\w)/g, (_all: string, letter: string) => letter.toUpperCase());
}

// Internal implementation detail.
export function toSQLLine(str: string): string {
  if (str === 'ID') return 'ID';
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/** Preserve the SQL type's width and boolean/JSON semantics for both MySQL and PostgreSQL. */
export function goTypeFromColumn(columnType: string): string {
  const t = columnType.trim().toLowerCase();
  if (/^tinyint\s*\(\s*1\s*\)/.test(t) || /^bool(ean)?$/.test(t) || /^bit\s*\(\s*1\s*\)/.test(t))
    return 'bool';
  if (/^(bigint|int8|bigserial)/.test(t)) return t.includes('unsigned') ? 'uint64' : 'int64';
  if (/^(tinyint|smallint|mediumint|int|integer|serial)/.test(t))
    return t.includes('unsigned') ? 'uint' : 'int';
  if (/^(date|datetime|timestamp)/.test(t)) return 'time.Time';
  if (/^(decimal|numeric|float|double|real)/.test(t)) return 'float64';
  if (/^jsonb?$/.test(t)) return 'json';
  return 'string';
}

/** SQL catalog defaults may be quoted/cast in PostgreSQL and unquoted in MySQL. */
function columnDefault(column: AutoCodeColumn, type: string): string {
  let value = column.defaultValue ?? '';
  if (column.autoIncrement) return '';
  const literal = value.match(/^'(.*)'(?:::[A-Za-z0-9_ .\[\]()]*)?$/s);
  if (literal) value = literal[1].replace(/''/g, "'");
  if (type === 'bool') {
    if (['1', 'true', "b'1'"].includes(value.toLowerCase())) return 'true';
    if (['0', 'false', "b'0'"].includes(value.toLowerCase())) return 'false';
  }
  if (type === 'time.Time') {
    if (/^(current_timestamp(?:\(\d*\))?|now\(\))$/i.test(value)) return 'CURRENT_TIMESTAMP';
    if (value && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  }
  return value;
}

/** One import path shared by the UI and catalog contract tests. */
export function fieldFromColumn(column: AutoCodeColumn): AutoCodeField {
  const name = toHump(column.columnName.trim());
  const type = goTypeFromColumn(column.columnType ?? '');
  const autoIncrement = column.autoIncrement;
  const hasDefault = !autoIncrement && (column.hasDefault ?? Boolean(column.defaultValue));
  const nullable = column.primaryKey ? false : (column.nullable ?? false);
  const length = column.dataTypeLong ?? '';
  const defaultValue = columnDefault(column, type);
  const databaseDefault =
    !autoIncrement && column.defaultExpression === true && defaultValue !== 'CURRENT_TIMESTAMP';
  return normalizeField({
    fieldName: upperFirst(name),
    fieldJson: lowerFirst(name),
    columnName: column.columnName.trim(),
    fieldDesc: column.columnComment?.trim() || `${name || 'message'}field`,
    fieldType: type,
    primaryKey: column.primaryKey ?? false,
    nullable,
    autoIncrement,
    hasDefault,
    notNull: column.nullable === false || column.primaryKey === true,
    require: column.nullable === false && !hasDefault && !autoIncrement,
    defaultValue,
    databaseDefault,
    clearable: nullable,
    dataTypeLong:
      (type === 'string' && /^\d+$/.test(length) && Number(length) <= 65535) ||
      (type === 'float64' && /^\d+,\d+$/.test(length))
        ? length
        : '',
    form: !autoIncrement,
  });
}

// Internal implementation detail.
export function defaultAutoCodeForm(): AutoCodeForm {
  return {
    abbreviation: '',
    structName: '',
    description: '',
    tableName: '',
    packageName: '',
    package: '',
    businessDB: '',
    geaModel: true,
    disableDataScope: false,
    autoCreateApiToSql: true,
    autoCreateMenuToSql: false,
    autoCreateBtnAuth: false,
    hasExcel: false,
    autoMigrate: true,
    onlyTemplate: false,
    isTree: false,
    treeJson: '',
    humpPackageName: '',
    generateWeb: true,
    generateServer: true,
    fields: [],
  };
}

// Internal implementation detail.
function asStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

// Internal implementation detail.
function asBool(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : value === true;
}

// Internal implementation detail.
function normalizeField(raw: Record<string, unknown>): AutoCodeField {
  return {
    databaseDefault: asBool(raw.databaseDefault, false),
    nullable: asBool(raw.nullable, false),
    notNull: asBool(raw.notNull, false),
    hasDefault: asBool(raw.hasDefault, Boolean(raw.defaultValue)),
    ...(typeof raw.autoIncrement === 'boolean' ? { autoIncrement: raw.autoIncrement } : {}),
    fieldName: asStr(raw.fieldName),
    fieldType: asStr(raw.fieldType) || 'string',
    fieldJson: asStr(raw.fieldJson),
    columnName: asStr(raw.columnName),
    fieldDesc: asStr(raw.fieldDesc),
    fieldSearchType: asStr(raw.fieldSearchType),
    digitSearch: asBool(raw.digitSearch, !!raw.fieldSearchType),
    digitList: asBool(raw.table, asBool(raw.digitList, true)),
    digitSort: asBool(raw.digitSort, asBool(raw.sort, false)),
    require: asBool(raw.require, false),
    clearable: asBool(raw.clearable, true),
    errorText: asStr(raw.errorText ?? raw.error),
    dataTypeLong: asStr(raw.dataTypeLong),
    comment: asStr(raw.comment),
    fieldSearchHide: asBool(raw.fieldSearchHide, false),
    dictType: asStr(raw.dictType),
    form: asBool(raw.form, true),
    table: asBool(raw.table, asBool(raw.digitList, true)),
    desc: asBool(raw.desc, true),
    excel: asBool(raw.excel, false),
    defaultValue: asStr(raw.defaultValue),
    primaryKey: asBool(raw.primaryKey, false),
    dataSource:
      raw.dataSource && typeof raw.dataSource === 'object'
        ? (raw.dataSource as AutoCodeDataSource)
        : null,
    fieldIndexType: asStr(raw.fieldIndexType),
  };
}

// Internal implementation detail.
export function parseHistoryForm(raw: unknown): AutoCodeForm | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  for (const key of ['meta', 'request']) {
    const value = rec[key];
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      try {
        const parsed = parseHistoryForm(JSON.parse(value) as unknown);
        if (parsed) return parsed;
      } catch {
        // Internal implementation detail.
      }
    }
  }
  if (Array.isArray(rec.fields)) {
    const base = defaultAutoCodeForm();
    return {
      ...base,
      abbreviation: asStr(rec.abbreviation),
      structName: asStr(rec.structName),
      description: asStr(rec.description),
      tableName: asStr(rec.tableName),
      packageName: asStr(rec.packageName),
      package: asStr(rec.package) || asStr(rec.packageName),
      businessDB: asStr(rec.businessDB),
      // Internal implementation detail.
      geaModel: asBool(rec.geaModel === undefined ? rec.gvaModel : rec.geaModel, base.geaModel),
      // Older generated modules used API-only access; reloading history preserves that explicit mode.
      disableDataScope: asBool(rec.disableDataScope, true),
      autoCreateApiToSql: asBool(rec.autoCreateApiToSql, base.autoCreateApiToSql),
      autoCreateMenuToSql: asBool(rec.autoCreateMenuToSql, base.autoCreateMenuToSql),
      autoCreateBtnAuth: asBool(rec.autoCreateBtnAuth, false),
      hasExcel: asBool(rec.hasExcel, false),
      autoMigrate: asBool(rec.autoMigrate, base.autoMigrate),
      onlyTemplate: asBool(rec.onlyTemplate, false),
      isTree: asBool(rec.isTree, false),
      treeJson: asStr(rec.treeJson),
      humpPackageName: asStr(rec.humpPackageName),
      generateWeb: asBool(rec.generateWeb, true),
      generateServer: asBool(rec.generateServer, true),
      fields: (rec.fields as unknown[]).map((item) =>
        normalizeField(item as Record<string, unknown>),
      ),
    };
  }
  return null;
}
