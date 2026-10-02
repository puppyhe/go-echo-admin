import { createContext, useContext } from 'react';
import type { MenuNode } from '../domain/menu';

export interface MenuContextValue {
  tree: MenuNode[];
  // Internal implementation detail.
  nodeByPath: Map<string, MenuNode>;
  /** route name -> menunode */
  nameToNode: Map<string, MenuNode>;
  // Internal implementation detail.
  pathOf: (name: string) => string | undefined;
  // Internal implementation detail.
  resolveLandingPath: (defaultRouter?: string) => string;
  // Internal implementation detail.
  ready: boolean;
  reload: () => Promise<void>;
}

export const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error('useMenu message <MenuProvider> message');
  return ctx;
}
