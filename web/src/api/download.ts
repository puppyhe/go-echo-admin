import { SUCCESS_CODE } from './protocol';
// Internal implementation detail.
// Internal implementation detail.
import { assertSession, checkSessionResponse, session, type SessionScope } from './request';
import { toastError } from './feedback';
import { ApiError } from './request';

export interface DownloadByUrlOptions {
  // Internal implementation detail.
  params?: Record<string, unknown>;
  // Internal implementation detail.
  token?: string;
  // Internal implementation detail.
  filename?: string;
}

// Internal implementation detail.
function normalizeUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const prefixed = path.startsWith('/') ? path : `/${path}`;
  if (prefixed === '/api' || prefixed.startsWith('/api/')) return prefixed;
  return `/api${prefixed}`;
}

// Internal implementation detail.
export function downloadRequest(
  path: string,
  origin: string,
  token?: string | null,
  params?: Record<string, unknown>,
  tenantCode = '',
) {
  const url = new URL(normalizeUrl(path), origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '')
      url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {};
  if (url.origin === new URL(origin).origin && token) {
    headers['x-token'] = token;
    if (tenantCode) headers['x-tenant-id'] = tenantCode;
  }
  return {
    url: url.toString(),
    headers,
    redirect: headers['x-token'] ? ('error' as const) : ('follow' as const),
  };
}

// Internal implementation detail.
function fileNameFromUrl(path: string): string {
  try {
    const url = new URL(path, window.location.origin);
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (!last) return 'download';
    return decodeURIComponent(last);
  } catch {
    return 'download';
  }
}

// Internal implementation detail.
export function fileNameFromDisposition(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return utf8[1];
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1];
}

// Internal implementation detail.
export async function downloadByUrl(
  path: string,
  options: DownloadByUrlOptions = {},
): Promise<void> {
  if (!path) {
    toastError('下载地址无效');
    throw new ApiError(-1, '下载地址无效');
  }
  const { params, token, filename } = options;
  const scope = session.capture();
  const controller = new AbortController();
  const release = session.track(controller);

  const { url, headers, redirect } = downloadRequest(
    path,
    window.location.origin,
    token ?? scope.token,
    params,
    scope.tenantCode,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'same-origin',
      redirect,
      signal: controller.signal,
    });
  } catch {
    release();
    assertSession(scope);
    toastError('网络请求失败，请检查网络连接');
    throw new ApiError(-1, '网络请求失败，请检查网络连接');
  }

  try {
    assertSession(scope);
    if (headers['x-token']) await checkSessionResponse(response, true, scope);
    await saveDownloadResponse(response, filename, fileNameFromUrl(path), scope);
  } finally {
    release();
  }
}

/** Accept JSON attachments (version exports), while rejecting JSON API error envelopes. */
export async function saveDownloadResponse(
  response: Response,
  filename?: string,
  fallback = 'download',
  scope?: SessionScope,
): Promise<void> {
  if (!response.ok) {
    toastError(`downloadfailed (${response.status})`);
    throw new ApiError(response.status, `downloadfailed (${response.status})`);
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const attachment = /^attachment(?:\s*;|\s*$)/i.test(
    response.headers.get('content-disposition') ?? '',
  );
  // Internal implementation detail.
  if (contentType.includes('application/json') && !attachment) {
    let msg = `downloadfailed (${response.status})`;
    try {
      const envelope = (await response.json()) as { code?: number; msg?: string };
      if (envelope?.code !== SUCCESS_CODE && envelope?.msg) msg = envelope.msg;
    } catch {
      // Internal implementation detail.
    }
    toastError(msg);
    throw new ApiError(-1, msg);
  }

  if (scope) assertSession(scope);
  const blob = await response.blob();
  if (scope) assertSession(scope);
  const saveName =
    filename ?? fileNameFromDisposition(response.headers.get('content-disposition')) ?? fallback;

  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = saveName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}
