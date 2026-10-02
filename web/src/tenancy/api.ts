import { SUCCESS_CODE } from '../api/protocol';
import { ApiError } from '../api/request';
import type { Tenant } from '../domain/tenancy';
import { TenancyApiError, type TenancyOperation } from './errors';

async function publicData<T>(path: string, operation: TenancyOperation): Promise<T> {
  const unavailable = 'Tenant service unavailable. Please try again.';
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new TenancyApiError(-1, unavailable, operation, 'connection');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.code !== SUCCESS_CODE) {
    const message = typeof body?.msg === 'string' ? body.msg.trim() : '';
    throw new TenancyApiError(
      response.status,
      message || (response.status >= 500 ? unavailable : 'information'),
      operation,
      response.ok && (!body || typeof body.code !== 'number') ? 'configuration' : 'response',
    );
  }
  return body.data;
}
export const tenancyApi = {
  info: async (): Promise<{ enabled: boolean }> => {
    try {
      const data = await publicData<{ enabled?: unknown } | null>('/tenancy/info', 'info');
      if (typeof data?.enabled !== 'boolean')
        throw new TenancyApiError(
          200,
          'Tenant service returned an invalid configuration response.',
          'info',
          'configuration',
        );
      return { enabled: data.enabled };
    } catch (error) {
      if (error instanceof ApiError && error.code === 404)
        throw new TenancyApiError(
          404,
          'Tenant service configuration is incompatible with this frontend.',
          'info',
          'configuration',
        );
      throw error;
    }
  },
  resolve: (code: string) =>
    publicData<Tenant>(`/tenancy/resolve?code=${encodeURIComponent(code.trim())}`, 'resolve'),
};

let platformGeneration = 0;
const PLATFORM_TOKEN_KEY = 'gea-platform-token';
let platformAccessToken =
  typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(PLATFORM_TOKEN_KEY) || '';

const DEFAULT_PLATFORM_ROUTE = '/platform/tenants';

/** Keep platform redirects inside the platform area. */
export function safePlatformReturnTo(value: string | null | undefined): string {
  if (!value || typeof window === 'undefined') return DEFAULT_PLATFORM_ROUTE;
  try {
    const url = new URL(value, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !/^\/platform(?:\/|$)/.test(url.pathname) ||
      url.pathname === '/platform/login'
    )
      return DEFAULT_PLATFORM_ROUTE;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_PLATFORM_ROUTE;
  }
}

export function platformLoginURL(returnTo?: string): string {
  const current =
    returnTo ??
    (typeof window === 'undefined'
      ? DEFAULT_PLATFORM_ROUTE
      : `${window.location.pathname}${window.location.search}${window.location.hash}`);
  return `/platform/login?returnTo=${encodeURIComponent(safePlatformReturnTo(current))}`;
}

export const platformSession = {
  token: () => platformAccessToken,
  start(token: string) {
    platformGeneration++;
    platformAccessToken = token;
    sessionStorage.setItem(PLATFORM_TOKEN_KEY, token);
  },
  clear() {
    platformGeneration++;
    platformAccessToken = '';
    sessionStorage.removeItem('gea-platform-token');
  },
};
async function platformRequest<T>(path: string, body?: unknown, anonymous = false): Promise<T> {
  const generation = platformGeneration;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!anonymous) headers['x-platform-token'] = platformSession.token();
  const response = await fetch(`/api/platform${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (generation !== platformGeneration)
    throw new ApiError(-2, 'Request superseded by a newer session.');
  if (response.status === 401 && !anonymous) {
    platformSession.clear();
    window.location.assign(platformLoginURL());
  }
  if (!response.ok || data?.code !== SUCCESS_CODE)
    throw new ApiError(response.status, data?.msg || 'Request failed');
  return data.data;
}
export const platformApi = {
  async login(body: { username: string; password: string }) {
    const result = await platformRequest<{ token: string }>('/login', body, true);
    if (!result?.token) throw new Error('Platform sign-in returned no session token.');
    platformSession.start(result.token);
  },
  tenants: () => platformRequest<{ list: Tenant[] }>('/tenants'),
  create: (body: { code: string; name: string; adminPassword: string }) =>
    platformRequest<Tenant>('/tenants', body),
  action: (id: string, action: 'disable' | 'enable' | 'retry') =>
    platformRequest<Tenant>(`/tenants/${encodeURIComponent(id)}/${action}`, {}),
};
