import { session } from '../../api/request';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Internal implementation detail.
// Internal implementation detail.
import { useEffect, useState } from 'react';
import { sysParamsApi } from '../../api/endpoints';

// Internal implementation detail.
const paramsCache = new Map<string, string>();

// Internal implementation detail.
const pendingFetches = new Map<string, Promise<string>>();

// Internal implementation detail.
function fetchSystemParam(key: string): Promise<string> {
  const cacheKey = session.cacheKey(key);
  const scope = session.capture();
  if (paramsCache.has(cacheKey)) return Promise.resolve(paramsCache.get(cacheKey) ?? '');
  const pending = pendingFetches.get(cacheKey);
  if (pending) return pending;
  const request = sysParamsApi
    .getSysParam(key)
    .then((res) => {
      const value = res.value ?? '';
      if (session.isCurrent(scope) && pendingFetches.get(cacheKey) === request)
        paramsCache.set(cacheKey, value);
      return value;
    })
    .finally(() => {
      if (pendingFetches.get(cacheKey) === request) pendingFetches.delete(cacheKey);
    });
  pendingFetches.set(cacheKey, request);
  return request;
}

// Internal implementation detail.
export function useSystemParam(key: string): { value: string | undefined; loading: boolean } {
  const [value, setValue] = useState<string | undefined>(() =>
    paramsCache.has(session.cacheKey(key)) ? paramsCache.get(session.cacheKey(key)) : undefined,
  );
  const [loading, setLoading] = useState(
    () => Boolean(key) && !paramsCache.has(session.cacheKey(key)),
  );

  useEffect(() => {
    if (!key) {
      // Internal implementation detail.
      setValue(undefined);
      setLoading(false);
      return;
    }
    if (paramsCache.has(session.cacheKey(key))) {
      setValue(paramsCache.get(session.cacheKey(key)));
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void fetchSystemParam(key)
      .then((result) => {
        if (alive) setValue(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return { value, loading };
}

// Internal implementation detail.
export function clearSystemParamCache(key?: string): void {
  if (key === undefined) {
    paramsCache.clear();
    pendingFetches.clear();
    return;
  }
  paramsCache.delete(session.cacheKey(key));
  pendingFetches.delete(session.cacheKey(key));
}
