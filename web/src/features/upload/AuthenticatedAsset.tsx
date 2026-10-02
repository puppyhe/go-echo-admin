import { useEffect, useState, type ComponentProps } from 'react';
import { Avatar, Image, Typography } from 'antd';
import {
  assertSession,
  checkSessionResponse,
  fileUrl,
  session,
  sessionHeaders,
} from '../../api/request';
import { downloadByUrl } from '../../api/download';

export function protectedAsset(path?: string | null): boolean {
  if (!path || typeof window === 'undefined') return false;
  try {
    const url = new URL(fileUrl(path)!, window.location.origin);
    return url.origin === window.location.origin && /^\/(?:api\/)?uploads\//.test(url.pathname);
  } catch {
    return false;
  }
}
type Entry = { users: number; url?: string; promise: Promise<string>; controller: AbortController };
const assets = new Map<string, Entry>();
session.subscribe(() => {
  for (const entry of assets.values()) {
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
  }
  assets.clear();
});
export function acquireAsset(path: string): { promise: Promise<string>; release: () => void } {
  if (!protectedAsset(path))
    return { promise: Promise.resolve(fileUrl(path) || path), release: () => {} };
  const scope = session.capture(),
    key = session.cacheKey(path);
  let entry = assets.get(key);
  if (!entry) {
    const controller = new AbortController();
    const untrack = session.track(controller);
    const value: Entry = { users: 0, controller, promise: Promise.resolve('') };
    entry = value;
    value.promise = (async () => {
      try {
        const response = await fetch(fileUrl(path)!, {
          headers: sessionHeaders(scope),
          redirect: 'error',
          signal: controller.signal,
        });
        await checkSessionResponse(response, true, scope);
        if (!response.ok) throw new Error('filemessage');
        const blob = await response.blob();
        assertSession(scope);
        if (controller.signal.aborted) throw new Error('previewclose');
        const url = URL.createObjectURL(blob);
        value.url = url;
        return url;
      } finally {
        untrack();
      }
    })();
    assets.set(key, value);
  }
  entry.users++;
  let released = false;
  const held = entry;
  return {
    promise: held.promise,
    release: () => {
      if (released) return;
      released = true;
      held.users--;
      if (!held.users) {
        held.controller.abort();
        if (held.url) URL.revokeObjectURL(held.url);
        if (assets.get(key) === held) assets.delete(key);
      }
    },
  };
}
export function useAssetUrl(path?: string | null): string | undefined {
  const key = session.cacheKey(path || '');
  const [value, setValue] = useState<{ key: string; url?: string }>({ key: '' });
  useEffect(() => {
    if (!path) return;
    let active = true;
    const acquired = acquireAsset(path);
    void acquired.promise
      .then((url) => {
        if (active) setValue({ key, url });
      })
      .catch(() => {
        if (active) setValue({ key });
      });
    return () => {
      active = false;
      acquired.release();
    };
  }, [path, key]);
  return protectedAsset(path) ? (value.key === key ? value.url : undefined) : fileUrl(path);
}
export function AuthenticatedImage({ src, ...props }: ComponentProps<typeof Image>) {
  const url = useAssetUrl(src);
  return <Image {...props} src={url} />;
}
export function AuthenticatedAvatar({ src, ...props }: ComponentProps<typeof Avatar>) {
  const url = useAssetUrl(typeof src === 'string' ? src : undefined);
  return <Avatar {...props} src={typeof src === 'string' ? url : src} />;
}
export function AuthenticatedImg({ src, ...props }: ComponentProps<'img'>) {
  const url = useAssetUrl(src);
  return <img {...props} src={url} />;
}
export function FileLink({ href, children, ...props }: ComponentProps<typeof Typography.Link>) {
  const [busy, setBusy] = useState(false);
  if (!href) return <Typography.Text>{children}</Typography.Text>;
  if (!protectedAsset(href))
    return (
      <Typography.Link {...props} href={fileUrl(href)}>
        {children}
      </Typography.Link>
    );
  return (
    <Typography.Link
      {...props}
      aria-disabled={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void downloadByUrl(href)
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
    >
      {busy ? 'download…' : children}
    </Typography.Link>
  );
}
