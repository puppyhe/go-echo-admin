// Internal implementation detail.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { session } from '../api/request';
import * as menuService from '../services/menuService';
import type { MenuNode } from '../domain/menu';
import { buildIndex, firstLeafPath } from './menuPaths';

import { MenuContext, type MenuContextValue } from './context';
export { useMenu } from './context';
export type { MenuContextValue } from './context';

export function MenuProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [ready, setReady] = useState(false);
  const treeRef = useRef<MenuNode[]>([]);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestRef.current;
    try {
      const menus = await menuService.getMenu();
      if (sequence !== requestRef.current) return;
      treeRef.current = menus;
      setTree(menus);
    } catch {
      if (sequence !== requestRef.current) return;
      treeRef.current = [];
      setTree([]); // errordocumentationrequestdocumentation toast；documentationtreedocumentation
    } finally {
      if (sequence === requestRef.current) setReady(true);
    }
  }, []);
  useEffect(
    () =>
      session.subscribe(() => {
        requestRef.current++;
        treeRef.current = [];
        setTree([]);
        setReady(false);
        if (session.isAuthenticated()) void reload();
      }),
    [reload],
  );

  useEffect(() => {
    const publicPath =
      ['/login', '/init'].includes(window.location.pathname) ||
      window.location.pathname === '/platform/login' ||
      window.location.pathname.startsWith('/platform/');
    if (session.isAuthenticated() || !publicPath)
      void reload();
    else setReady(true);
  }, [reload]);

  const index = useMemo(() => buildIndex(tree), [tree]);

  const value = useMemo<MenuContextValue>(
    () => ({
      tree,
      nodeByPath: index.nodeByPath,
      nameToNode: index.nameToNode,
      pathOf: (name: string) => index.pathByName.get(name),
      resolveLandingPath: (defaultRouter?: string) => {
        const freshIndex = buildIndex(treeRef.current);
        if (defaultRouter) {
          const path = freshIndex.pathByName.get(defaultRouter);
          if (path) return path;
        }
        return firstLeafPath(treeRef.current) ?? '/';
      },
      ready,
      reload,
    }),
    [tree, index, ready, reload],
  );

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}
