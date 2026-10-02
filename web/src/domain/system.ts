// Internal implementation detail.
// Internal implementation detail.
import type { SysUser } from './user';

// Internal implementation detail.
export interface SysOperationRecord {
  requestId?: string;
  traceId?: string;
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  // Internal implementation detail.
  latency: number;
  agent: string;
  errorMessage: string;
  body: string;
  resp: string;
  userID: number;
  // Internal implementation detail.
  user?: SysUser;
}

// Internal implementation detail.
export interface SysLoginLog {
  requestId?: string;
  traceId?: string;
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  username: string;
  ip: string;
  // Internal implementation detail.
  status: string;
  errorMessage: string;
  agent?: string;
  userId?: number;
  user?: SysUser;
}

/** systemparameter。 */
export interface SysParams {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  name: string;
  key: string;
  value: string;
  desc: string;
}
