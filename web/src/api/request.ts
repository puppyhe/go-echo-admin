import { SUCCESS_CODE } from './protocol';
// Internal implementation detail.
// Internal implementation detail.
import { toastError } from './feedback';
import { withID } from './normalize';
import type { ApiEnvelope } from '../types';
import { session, sessionHeaders, type SessionScope } from './session';
export { session, sessionHeaders } from './session';
export type { SessionSnapshot, SessionScope } from './session';

export interface ApiErrorDetails {
  requestId?: string;
  errorCode?: string;
  field?: string;
}

export class ApiError extends Error {
  code: number;
  requestId?: string;
  errorCode?: string;
  field?: string;
  constructor(code: number, msg: string, details: ApiErrorDetails = {}) {
    super(details.requestId ? `${msg} (request ID: ${details.requestId})` : msg);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = details.requestId;
    this.errorCode = details.errorCode;
    this.field = details.field;
  }
}

function normalizeApiMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value) return fallback;
  return value;
}

function errorDetails(response: Response, envelope?: ApiErrorDetails | null): ApiErrorDetails {
  const rawID = response.headers.get('X-Request-ID') || envelope?.requestId;
  return {
    requestId:
      typeof rawID === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(rawID) ? rawID : undefined,
    errorCode: typeof envelope?.errorCode === 'string' ? envelope.errorCode : undefined,
    field: typeof envelope?.field === 'string' ? envelope.field : undefined,
  };
}

function failResponse(
  code: number,
  msg: string,
  skipError: boolean,
  details: ApiErrorDetails,
): never {
  const error = new ApiError(code, msg, details);
  if (!skipError) toastError(error.message);
  throw error;
}

const BASE = '/api';
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  // Internal implementation detail.
  body?: unknown;
  // Internal implementation detail.
  params?: Record<string, unknown>;
  // Internal implementation detail.
  skipError?: boolean;
  anonymous?: boolean;
  signal?: AbortSignal;
}

// Internal implementation detail.
export function fileUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:\/\/|blob:|data:image\/)/i.test(url)) return url;
  if (url.startsWith(`${BASE}/`)) return url;
  const prefixed = url.startsWith('/') ? url : `/${url}`;
  return `${BASE}${prefixed}`;
}

function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function assertSession(scope: SessionScope): void {
  if (!session.isCurrent(scope)) throw new ApiError(-2, '请求已取消');
}

/** Shared session handling for JSON, streaming and authenticated file responses. Does not consume the body. */
export async function checkSessionResponse(
  response: Response,
  inspectEnvelope = true,
  scope: SessionScope = session.capture(),
  anonymous = false,
): Promise<void> {
  assertSession(scope);
  const newToken = response.headers.get('new-token');
  if (newToken && !anonymous) session.setToken(newToken);

  if (response.status === 401) {
    if (anonymous) return;
    if (!anonymous) {
      session.clear();
      if (window.location.pathname !== '/login') window.location.assign(session.loginURL());
    }
    throw new ApiError(401, '登录状态已失效，请重新登录', errorDetails(response));
  }
  if (
    inspectEnvelope &&
    response.headers.get('content-type')?.toLowerCase().includes('application/json')
  ) {
    const envelope = await response
      .clone()
      .json()
      .catch(() => null);
    assertSession(scope);
    if (envelope?.code === 428)
      requirePasswordChange(envelope.msg, errorDetails(response, envelope));
  }
}

function requirePasswordChange(message?: string, details: ApiErrorDetails = {}): never {
  if (window.location.pathname !== '/login') window.location.assign(session.loginURL(true));
  throw new ApiError(428, message || '需要修改密码', details);
}

// Internal implementation detail.
async function handleResponse<T>(
  response: Response,
  skipError: boolean,
  scope: SessionScope,
  anonymous = false,
): Promise<T> {
  await checkSessionResponse(response, false, scope, anonymous);

  const text = await response.text();
  assertSession(scope);
  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;
  } catch {
    envelope = null;
  }

  // Internal implementation detail.
  if (!envelope || typeof envelope.code !== 'number') {
    if (!response.ok) {
      failResponse(
        response.status,
        normalizeApiMessage(undefined, `请求失败（${response.status}）`),
        skipError,
        errorDetails(response),
      );
    }
    return (envelope as unknown as T) ?? (undefined as unknown as T);
  }

  if (envelope.code === 428) {
    // Preserve the authenticated recovery session, including HTTP 403 recovery responses.
    requirePasswordChange(normalizeApiMessage(envelope.msg, '需要修改密码'), errorDetails(response, envelope));
  }
  if (!response.ok) {
    failResponse(
      response.status,
      normalizeApiMessage(envelope.msg, `请求失败（${response.status}）`),
      skipError,
      errorDetails(response, envelope),
    );
  }

  if (envelope.code === SUCCESS_CODE) return envelope.data;

  failResponse(
    envelope.code,
    normalizeApiMessage(envelope.msg, `请求失败（${envelope.code}）`),
    skipError,
    errorDetails(response, envelope),
  );
}

// Internal implementation detail.
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = `${BASE}${path}${opts.params ? buildQuery(opts.params) : ''}`;
  const scope = session.capture();
  const controller = new AbortController();
  const release = session.track(controller);
  const signal = opts.signal
    ? AbortSignal.any([controller.signal, opts.signal])
    : controller.signal;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...sessionHeaders(scope, opts.anonymous),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      signal,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (error) {
    release();
    assertSession(scope);
    if (signal.aborted) throw error;
    if (!opts.skipError) toastError('网络请求失败，请检查网络连接');
    throw new ApiError(-1, '网络请求失败，请检查网络连接');
  }
  try {
    return await handleResponse<T>(response, opts.skipError === true, scope, opts.anonymous);
  } finally {
    release();
  }
}

// Internal implementation detail.
export interface UploadedFile {
  ID: number;
  name: string;
  classId: number;
  url: string;
  tag: string;
  key: string;
}

// Internal implementation detail.
/** Uploads a tenant-scoped file through the compatibility API. */
export async function uploadFile(file: File): Promise<{ file: UploadedFile }> {
  const form = new FormData();
  form.append('file', file, file.name);
  const data = await postForm<UploadedFile | { file?: UploadedFile }>(
    '/fileUploadAndDownload/upload',
    form,
  );
  const value = (data as { file?: UploadedFile })?.file ?? (data as UploadedFile);
  if (!value || !value.url) {
    throw new ApiError(-1, '文件上传响应无效');
  }
  return {
    file: {
      ...value,
      ID: Number(value.ID ?? (value as UploadedFile & { id?: number }).id ?? 0),
      name: value.name || file.name,
    },
  };
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const scope = session.capture();
  const controller = new AbortController();
  const release = session.track(controller);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: sessionHeaders(scope),
      credentials: 'same-origin',
      signal: controller.signal,
      body: form,
    });
  } catch {
    release();
    assertSession(scope);
    toastError('网络请求失败，请检查网络连接');
    throw new ApiError(-1, '网络请求失败，请检查网络连接');
  }
  try {
    return await handleResponse<T>(response, false, scope);
  } finally {
    release();
  }
}
