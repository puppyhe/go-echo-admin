import { createContext, useContext } from 'react';
import type { LoginPayload, LoginResult, SysUser } from '../domain/user';

export interface AuthContextValue {
  user: SysUser | null;
  // Internal implementation detail.
  loading: boolean;
  // Internal implementation detail.
  login: (payload: LoginPayload) => Promise<LoginResult>;
  // Internal implementation detail.
  loadSession: () => Promise<SysUser>;
  // Internal implementation detail.
  logout: () => Promise<void>;
  // Internal implementation detail.
  clearSession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth message <AuthProvider> message');
  return ctx;
}
