import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { UNSAFE_LocationContext, useLocation, useOutlet } from 'react-router-dom';
import { useMenu } from '../menu/MenuContext';
import { matchingMenus } from '../menu/menuPaths';
import { ConfigProvider } from 'antd';

interface Entry {
  path: string;
  revision: number;
  element: ReactNode;
  context: React.ContextType<typeof UNSAFE_LocationContext>;
}

// Internal implementation detail.
export default function CachedOutlet({ revision }: { revision: number }) {
  const location = useLocation();
  const context = useContext(UNSAFE_LocationContext);
  const outlet = useOutlet();
  const { nodeByPath, tree } = useMenu();
  const path = location.pathname + location.search;
  const keepAlive =
    matchingMenus(nodeByPath, location.pathname).at(-1)?.[1].meta.keepAlive === true;
  const [entries, setEntries] = useState<Entry[]>([]);
  const refreshRef = useRef(revision);
  const existing = entries.find((entry) => entry.path === path);
  const current: Entry = {
    path,
    revision: revision !== refreshRef.current ? revision : (existing?.revision ?? revision),
    element: outlet,
    context,
  };
  useEffect(() => {
    refreshRef.current = revision;
    setEntries((prev) => {
      const valid = prev.filter(
        (entry) =>
          entry.path !== path &&
          matchingMenus(nodeByPath, entry.context.location.pathname).at(-1)?.[1].meta.keepAlive,
      );
      return keepAlive ? [...valid, current].slice(-20) : valid;
    });
  }, [path, revision, keepAlive, tree]);
  useEffect(() => {
    const close = (event: Event) => {
      const paths = (event as CustomEvent<string[]>).detail;
      setEntries((prev) => prev.filter((entry) => paths.includes(entry.path)));
    };
    window.addEventListener('gea-tabs-change', close);
    return () => window.removeEventListener('gea-tabs-change', close);
  }, []);
  const rendered = [...entries.filter((entry) => entry.path !== path), current];
  return (
    <>
      {rendered.map((entry) => (
        <CacheFrame
          key={`${entry.path}:${entry.revision}`}
          entry={entry}
          active={entry.path === path}
        />
      ))}
    </>
  );
}

function CacheFrame({ entry, active }: { entry: Entry; active: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const getContainer = useCallback(() => root.current || document.body, []);
  return (
    <div
      ref={root}
      className={`cache-frame${active ? ' cache-frame-active' : ''}`}
      hidden={!active}
    >
      <UNSAFE_LocationContext.Provider value={entry.context}>
        <ConfigProvider getPopupContainer={getContainer}>{entry.element}</ConfigProvider>
      </UNSAFE_LocationContext.Provider>
    </div>
  );
}
