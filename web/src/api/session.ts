import type { SysUser } from '../domain/user';
import type { TenantIdentity } from '../domain/tenancy';

export interface SessionSnapshot {
  ID: number;
  nickName: string;
  headerImg: string;
  authorityId: number;
}
export interface SessionScope {
  generation: number;
  tenantCode: string;
  token: string;
  userId?: number;
}
const TENANT_KEY = 'gea-tenant';
let generation = 0;
const pending = new Set<AbortController>();
const listeners = new Set<() => void>();
const read = (key: string) =>
  typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
// Keep the short-lived access token in sessionStorage so a page refresh does
// not unexpectedly log the operator out. sessionStorage is scoped to the
// browser tab and is cleared when that tab is closed.
const TOKEN_KEY = 'gea-access-token';
let accessToken = read(TOKEN_KEY) || '';
let cookieAuthenticated = false;
if (accessToken) cookieAuthenticated = true;
function advance() {
  generation++;
  for (const controller of pending) controller.abort();
  pending.clear();
}
function changed() {
  listeners.forEach((listener) => listener());
}
export const session = {
  getToken: () => accessToken,
  isAuthenticated: () => Boolean(accessToken || cookieAuthenticated),
  getSnapshot(): SessionSnapshot | null {
    try {
      return JSON.parse(read('userInfo') || 'null');
    } catch {
      return null;
    }
  },
  getTenant(): TenantIdentity | null {
    try {
      const value = JSON.parse(read(TENANT_KEY) || 'null');
      return value &&
        typeof value.code === 'string' &&
        typeof value.id === 'string' &&
        value.id.length > 0
        ? value
        : null;
    } catch {
      return null;
    }
  },
  setToken(token: string) {
    accessToken = token || '';
    cookieAuthenticated = Boolean(accessToken);
    if (accessToken) sessionStorage.setItem(TOKEN_KEY, accessToken);
    else sessionStorage.removeItem(TOKEN_KEY);
  },
  markAuthenticated() {
    cookieAuthenticated = true;
    changed();
  },
  setSnapshot(user: SysUser) {
    sessionStorage.setItem(
      'userInfo',
      JSON.stringify({
        ID: user.ID,
        nickName: user.nickName,
        headerImg: user.headerImg,
        authorityId: user.authorityId,
      }),
    );
  },
  selectTenant(tenant: TenantIdentity | null) {
    if (tenant?.code === session.getTenant()?.code && tenant?.id === session.getTenant()?.id)
      return;
    session.clear();
    if (tenant) sessionStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
    else sessionStorage.removeItem(TENANT_KEY);
    changed();
  },
  start(token: string, user: SysUser, tenant: TenantIdentity) {
    advance();
    sessionStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
    session.setToken(token);
    session.setSnapshot(user);
    changed();
  },
  clear() {
    advance();
    accessToken = '';
    cookieAuthenticated = false;
    sessionStorage.removeItem(session.storageKey('gea-tabs'));
    sessionStorage.removeItem('token'); // Remove credentials left by older releases.
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('userInfo');
    changed();
  },
  capture(): SessionScope {
    return {
      generation,
      tenantCode: session.getTenant()?.code || '',
      token: session.getToken(),
      userId: session.getSnapshot()?.ID,
    };
  },
  isCurrent(scope: SessionScope) {
    return (
      scope.generation === generation && scope.tenantCode === (session.getTenant()?.code || '')
    );
  },
  track(controller: AbortController) {
    pending.add(controller);
    return () => {
      pending.delete(controller);
    };
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  cacheKey(key = '') {
    const tenant = session.getTenant();
    const user = session.getSnapshot();
    return JSON.stringify([
      tenant?.id ?? '',
      tenant?.code ?? '',
      user?.ID ?? 0,
      user?.authorityId ?? 0,
      key,
    ]);
  },
  storageKey(key: string) {
    return `${key}:${session.cacheKey()}`;
  },
  loginURL(passwordChange = false) {
    const params = new URLSearchParams();
    const code = session.getTenant()?.code;
    if (code) params.set('tenant', code);
    if (passwordChange) params.set('passwordChange', '1');
    return `/login${params.size ? `?${params}` : ''}`;
  },
};

export function sessionHeaders(
  scope: SessionScope = session.capture(),
  anonymous = false,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (scope.tenantCode) headers['x-tenant-id'] = scope.tenantCode;
  if (!anonymous && scope.token) {
    headers['x-token'] = scope.token;
    if (scope.userId) headers['x-user-id'] = String(scope.userId);
  }
  return headers;
}
