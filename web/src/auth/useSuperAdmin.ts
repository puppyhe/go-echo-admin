import { useAuth } from './context';

/** Mirrors the server's administrator-only write boundary; RBAC is still checked on each API call. */
export function useSuperAdmin(): boolean {
  const user = useAuth().user;
  if (!user) return false;
  if (user.authorityId === 888) return true;
  const administratorCodes = new Set(['platform_admin', 'tenant_admin']);
  return [user.authority, ...(user.authorities ?? [])].some((authority) =>
    administratorCodes.has(String(authority.code ?? '').toLowerCase()),
  );
}
