import type { PageInfo, PageResult } from '../../types';
export type GeneratedRow = Record<string, unknown>;
export interface GeneratedField {
  key: string;
  title: string;
  type: string;
  form: boolean;
  table: boolean;
  detail: boolean;
  excel: boolean;
  required: boolean;
  nullable?: boolean;
  databaseDefault?: boolean;
  autoIncrement?: boolean | null;
  clearable: boolean;
  errorText?: string;
  error?: string;
  search: string;
  searchHidden: boolean;
  sort: boolean;
  primaryKey: boolean;
  dictType: string;
  length: string;
  defaultValue?: unknown;
  dataSource?: {
    association: number;
    dbName?: string;
    table?: string;
    label?: string;
    value?: string;
    hasDeletedAt?: boolean;
  } | null;
}
export interface GeneratedConfig {
  title: string;
  primaryKey: string;
  primaryType: string;
  tree: boolean;
  treeLabel: string;
  fields: GeneratedField[];
  hasExcel: boolean;
  defaultModel: boolean;
  buttonAuth?: boolean;
}
export interface GeneratedAPI {
  list: (params: PageInfo) => Promise<PageResult<GeneratedRow>>;
  find: (id: string) => Promise<GeneratedRow>;
  create: (row: GeneratedRow) => Promise<unknown>;
  update: (row: GeneratedRow) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  removeBatch: (ids: string[]) => Promise<unknown>;
  options?: (field: string) => Promise<{ label: string; value: string }[]>;
  exportExcel?: (params: PageInfo, template?: boolean) => Promise<void>;
  importExcel?: (file: File) => Promise<{ count: number }>;
}
export const numericType = (type: string) => /^(u?int(64)?|float64)$/.test(type);
export const jsonType = (field: GeneratedField) =>
  /^(json|array|file|pictures|\[\].+)$/.test(field.type);
export function scalarValue(field: GeneratedField, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  if (numericType(field.type)) {
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      (field.type !== 'float64' && !Number.isSafeInteger(number)) ||
      (field.type.startsWith('uint') && number < 0)
    )
      throw new Error(
        `${field.title}message${field.type.startsWith('uint') ? 'message' : ''}${field.type === 'float64' ? 'message' : 'message'}`,
      );
    return number;
  }
  if (field.type === 'bool') {
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    if (value === false || value === 'false' || value === '0' || value === 0) return false;
    throw new Error(`${field.title}message`);
  }
  if (field.type === 'time.Time') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error(`${field.title}message`);
    return date.toISOString();
  }
  return String(value);
}
export function fieldValue(field: GeneratedField, value: unknown): unknown {
  if (field.nullable && (value === '' || value === undefined || value === null)) return null;
  if (field.dataSource?.association === 2)
    return (Array.isArray(value) ? value : []).map((item) => scalarValue(field, item));
  if (jsonType(field)) {
    if (value === '' || value === undefined || value === null) return null;
    try {
      const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
      if (field.type !== 'json' && !Array.isArray(parsed)) throw new Error('array');
      if (field.type.startsWith('[]'))
        return (parsed as unknown[]).map((item) =>
          scalarValue({ ...field, type: field.type.slice(2) }, item),
        );
      return parsed;
    } catch {
      throw new Error(`${field.title}message${field.type === 'json' ? 'JSON' : 'JSONmessage'}`);
    }
  }
  return scalarValue(field, value);
}
export function prepareGeneratedRow(
  config: GeneratedConfig,
  values: GeneratedRow,
  existing?: GeneratedRow | null,
): GeneratedRow {
  const row = { ...existing };
  delete row.children;
  for (const field of config.fields) {
    if (!field.form || field.autoIncrement || (existing && field.primaryKey)) continue;
    const value = fieldValue(field, values[field.key]);
    if (value === undefined) {
      if (existing)
        row[field.key] =
          field.type === 'bool'
            ? false
            : numericType(field.type)
              ? 0
              : field.type === 'time.Time'
                ? null
                : '';
      else delete row[field.key];
    } else row[field.key] = value;
  }
  if (config.tree) row.parentID = values.parentID ?? null;
  return row;
}
export function generatedSearch(fields: GeneratedField[], values: GeneratedRow): GeneratedRow {
  const filters: GeneratedRow = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (['IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN'].includes(field.search)) {
      const items = Array.isArray(raw)
        ? raw
        : String(raw)
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
      if (items.length === 0) continue;
      if (field.search.includes('BETWEEN') && items.length !== 2)
        throw new Error(`${field.title}message，message`);
      if (items.length > 100) throw new Error(`${field.title}message100message`);
      filters[field.key] = items.map((value) => scalarValue(field, value));
    } else filters[field.key] = scalarValue(field, raw);
  }
  return filters;
}
export function flattenGeneratedRows(rows: GeneratedRow[]): GeneratedRow[] {
  return rows.flatMap((row) => [
    row,
    ...flattenGeneratedRows(Array.isArray(row.children) ? (row.children as GeneratedRow[]) : []),
  ]);
}
