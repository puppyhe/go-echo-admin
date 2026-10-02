// Internal implementation detail.
// Internal implementation detail.
import type { ReactNode } from 'react';
import { useBtnAuth } from '../auth/useBtnAuth';

export default function AuthButton({ btn, fallback, children }: { btn: string; fallback?: ReactNode; children: ReactNode }) {
  const can = useBtnAuth();
  if (!can(btn)) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
