// Internal implementation detail.
export interface ApiEnvelope<T> {
  code: number;
  data: T;
  msg: string;
  // Internal implementation detail.
  requestId?: string;
  errorCode?: string;
  field?: string;
}

// Internal implementation detail.
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Internal implementation detail.
export interface PageInfo {
  page: number;
  pageSize: number;
  keyword?: string;
  [key: string]: unknown;
}
