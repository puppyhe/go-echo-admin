import type { ExportQuery } from '../pages/systemTools/exportBuilder/model';
// Internal implementation detail.
// Internal implementation detail.

// Internal implementation detail.
export interface ServerDiskInfo {
  path?: string;
  total?: number;
  used?: number;
}

// Internal implementation detail.
export interface ServerInfo {
  os?: string;
  arch?: string;
  cpus?: number;
  // Internal implementation detail.
  cpuUsed?: number;
  memTotal?: number;
  memUsed?: number;
  disks: ServerDiskInfo[];
  goVersion?: string;
}

// Internal implementation detail.
export interface SysError {
  status?: string;
  revision?: number;
  resolvedAt?: string | null;
  resolvedBy?: number;
  requestId?: string;
  traceId?: string;
  agent?: string;
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  // Internal implementation detail.
  app: string;
  msg: string;
  err: string;
  level: string;
  request: string;
  userID: number;
  solution: string;
  // Internal implementation detail.
  stack?: string;
}

// Internal implementation detail.
export interface SysErrorReport {
  app: string;
  msg: string;
  err: string;
  stack: string;
  level: string;
  request: string;
}

// Internal implementation detail.
export interface Info {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  title: string;
  content: string;
  userID?: number;
  attachments?: { uid?: string | number; name: string; url: string }[] | string;
}

// Internal implementation detail.
export interface InfoDataSource {
  users: { id: number; nickName: string }[];
  authorities: { authorityId: number; authorityName: string }[];
}

// Internal implementation detail.
export interface SysApiToken {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  userId?: number;
  // Internal implementation detail.
  userName?: string;
  authorityId: number;
  // Internal implementation detail.
  expiresAt: string | number;
  status: boolean | number | string;
  remark: string;
  // Internal implementation detail.
  token?: string;
}

// Internal implementation detail.
export interface SysExportTemplate {
  query?: ExportQuery | null;
  revision?: number;
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  name: string;
  tableName: string;
  templateID: string;
  fieldList: string;
  whereCond: string;
  orderCond: string;
  limit: number;
  sql: string;
  info: string;
}

// Internal implementation detail.
export interface SysVersion {
  versionData?: string;
  importMode?: 'export' | 'record' | 'resources';
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  versionName: string;
  versionCode: string;
  description: string;
  menus?: unknown[];
  apis?: unknown[];
  dictionaries?: unknown[];
}

export interface VersionImportResult {
  mode: 'record' | 'resources';
  dryRun: boolean;
  items: {
    kind: string;
    key: string;
    action: 'create' | 'unchanged' | 'conflict';
    reason?: string;
  }[];
  version?: SysVersion;
}

// Internal implementation detail.
export interface ExportVersionPayload {
  versionName: string;
  versionCode: string;
  description: string;
  menus: number[];
  apis: number[];
  dictionaries: number[];
}

/** attachmentcategorytreenode（attachmentCategory） */
export interface AttachmentCategoryNode {
  id: number;
  name: string;
  parentId: number;
  children?: AttachmentCategoryNode[];
}
