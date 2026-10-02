// Session state is restored from the current browser tab after a refresh.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { session, assertSession } from '../api/request';
import * as authService from '../services/authService';
import type { LoginPayload, SysUser } from '../domain/user';

import { AuthContext, type AuthContextValue } from './context';
export { useAuth } from './context';
export type { AuthContextValue } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SysUser | null>(null);
  const isPublicPath = () =>
    ['/login', '/init'].includes(window.location.pathname) ||
    window.location.pathname === '/platform/login' ||
    window.location.pathname.startsWith('/platform/');
  const [loading, setLoading] = useState<boolean>(() => !isPublicPath());

  // Internal implementation detail.
  useEffect(() => {
    if (isPublicPath()) {
      setLoading(false);
      return;
    }
    const scope = session.capture();
    void authService
      .getUserInfo()
      .then((info) => {
        if (session.isCurrent(scope)) {
          session.markAuthenticated();
          setUser(info);
        }
      })
      .catch(() => {
        // Internal implementation detail.
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(
    () =>
      session.subscribe(() => {
        if (!session.isAuthenticated()) setUser(null);
      }),
    [],
  );

  const login = useCallback(async (payload: LoginPayload) => {
    return authService.login(payload);
  }, []);

  const loadSession = useCallback(async () => {
    const scope = session.capture();
    const info = await authService.getUserInfo();
    assertSession(scope);
    session.markAuthenticated();
    setUser(info);
    return info;
  }, []);

  const clearSession = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    window.location.assign(session.loginURL());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, loadSession, logout, clearSession }),
    [user, loading, login, loadSession, logout, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
