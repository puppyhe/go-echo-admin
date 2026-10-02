import type { SysExportTemplate } from '../../../domain/systemTools';

export interface ExportField {
  field: string;
  header: string;
}
export interface ExportJoin {
  table: string;
  type: 'left' | 'inner';
  left: string;
  right: string;
}
export interface ExportFilter {
  field: string;
  operator: string;
  value?: unknown;
  parameter?: string;
}
export interface ExportSort {
  field: string;
  direction: 'asc' | 'desc';
}
export interface ExportQuery {
  version: 1;
  table: string;
  joins: ExportJoin[];
  fields: ExportField[];
  filters: ExportFilter[];
  sort: ExportSort[];
  limit: number;
}
export interface CatalogField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'datetime';
}
export interface CatalogTable {
  key: string;
  label: string;
  fields: CatalogField[];
  scope: string;
}
export interface BuilderCatalog {
  tables: CatalogTable[];
  relations: { left: string; right: string }[];
  limit: number;
}
export interface BuilderPreview {
  sql: string;
  code: string;
  columns: { key: string; field: string; header: string }[];
  parameters: { name: string; type: string; operator: string }[];
  query: ExportQuery;
  canImport: boolean;
}
export const operators = [
  ['eq', 'message'],
  ['ne', 'message'],
  ['gt', 'message'],
  ['gte', 'message'],
  ['lt', 'message'],
  ['lte', 'message'],
  ['contains', 'message'],
  ['in', 'message'],
  ['between', 'message'],
  ['isNull', 'message'],
  ['isNotNull', 'message'],
].map(([value, label]) => ({ value, label }));
export const emptyQuery = (table = ''): ExportQuery => ({
  version: 1,
  table,
  joins: [],
  fields: [],
  filters: [],
  sort: [],
  limit: 1000,
});
export function tableFields(query: ExportQuery, catalog: BuilderCatalog): CatalogField[] {
  const tables = new Set([query.table, ...query.joins.map((join) => join.table)]);
  return catalog.tables
    .filter((table) => tables.has(table.key))
    .flatMap((table) =>
      table.fields.map((field) => ({
        ...field,
        key: `${table.key}.${field.key}`,
        label: `${table.label} · ${field.label}`,
      })),
    );
}
export function legacyQuery(row: SysExportTemplate): ExportQuery {
  if (row.query) return structuredClone(row.query);
  if (
    row.sql?.trim() ||
    (row.whereCond?.trim() && !/^(?:[\w]+\.)?deleted_at\s+is\s+null$/i.test(row.whereCond.trim()))
  ) {
    throw new Error('templatemessage SQL message WHERE。configurationretain，selectsave。');
  }
  const fields: unknown = JSON.parse(row.fieldList || '[]');
  if (!Array.isArray(fields)) throw new Error('exportconfigurationmessage，configurationexportmessage。');
  const qualify = (name: string) => `${row.tableName}.${name.split('.').at(-1)}`;
  return {
    ...emptyQuery(row.tableName),
    fields: fields.map((field: { name?: string; header?: string }) => ({
      field: qualify(String(field.name || '')),
      header: String(field.header || field.name || ''),
    })),
    sort: row.orderCond?.trim()
      ? row.orderCond.split(',').map((term) => {
          const [field, dir = 'asc'] = term.trim().split(/\s+/);
          if (!/^(asc|desc)$/i.test(dir)) throw new Error('sortconfigurationmessage');
          return { field: qualify(field), direction: dir.toLowerCase() as 'asc' | 'desc' };
        })
      : [],
    limit: Math.min(Math.max(row.limit || 10000, 1), 10000),
  };
}
export function scalarValue(raw: unknown, type: string): unknown {
  if (raw === undefined || raw === null || raw === '') throw new Error('message');
  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error('numbermessage');
    return n;
  }
  if (type === 'boolean') {
    if (raw === true || raw === 'true' || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === '0') return false;
    throw new Error('message');
  }
  return String(raw);
}
export function filterValue(raw: unknown, type: string, operator: string): unknown {
  if (operator === 'isNull' || operator === 'isNotNull') return undefined;
  if (operator === 'in' || operator === 'between') {
    const values = Array.isArray(raw)
      ? raw
      : String(raw ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
    if (!values.length || values.length > 100 || (operator === 'between' && values.length !== 2))
      throw new Error(operator === 'between' ? 'message' : 'message 1 message 100 message');
    return values.map((value) => scalarValue(value, type));
  }
  return scalarValue(raw, type);
}
export function prepareQuery(query: ExportQuery, catalog: BuilderCatalog): ExportQuery {
  const fields = new Map(tableFields(query, catalog).map((field) => [field.key, field]));
  if (!catalog.tables.some((table) => table.key === query.table))
    throw new Error('selectmessage');
  if (!query.fields.length || query.fields.length > 100)
    throw new Error('select 1 message 100 exportmessage');
  const seen = new Set<string>();
  const headers = new Set<string>();
  const result = structuredClone(query);
  result.fields = query.fields.map((field) => {
    const header = field.header.trim();
    if (!fields.has(field.field) || seen.has(field.field)) throw new Error('exportfieldduplicate');
    if (!header || header.length > 120 || headers.has(header))
      throw new Error('message、message 120 duplicate');
    seen.add(field.field);
    headers.add(header);
    return { ...field, header };
  });
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 10000)
    throw new Error('exportmessage 1 message 10000');
  result.filters = query.filters.map((filter) => {
    const field = fields.get(filter.field);
    if (!field) throw new Error('fieldmessage');
    if (filter.operator === 'isNull' || filter.operator === 'isNotNull')
      return { field: filter.field, operator: filter.operator };
    if (filter.parameter) {
      if (
        !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(filter.parameter) ||
        ['templateID', 'params', 'limit', 'order', 'offset', 'filterDeleted'].includes(
          filter.parameter,
        )
      )
        throw new Error('parametersystemretainname');
      return { field: filter.field, operator: filter.operator, parameter: filter.parameter };
    }
    return {
      field: filter.field,
      operator: filter.operator,
      value: filterValue(filter.value, field.type, filter.operator),
    };
  });
  return result;
}
export function canImportAPI(query: ExportQuery): boolean {
  return (
    query.table === 'sys_apis' &&
    !query.joins.length &&
    query.fields.length === 4 &&
    ['path', 'method', 'description', 'api_group'].every((field) =>
      query.fields.some((column) => column.field === `sys_apis.${field}`),
    )
  );
}
