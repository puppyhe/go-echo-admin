// Internal implementation detail.
import type { ReactNode } from 'react';
import type { MenuNode } from '../domain/menu';
import { translateMenuTitle } from '../locale/zh';
import { getMenuIcon } from './iconMap';

export interface NavMenuItem {
  path: string;
  name: string;
  icon?: ReactNode;
  children?: NavMenuItem[];
}

const EXTERNAL_RE = /^https?:\/\//i;

function joinPath(parent: string, child: string): string {
  return (child.startsWith('/') ? child : `${parent}/${child}`).replace(/\/+/g, '/');
}

export function menuToNavigation(tree: MenuNode[], parentPath = ''): NavMenuItem[] {
  return (tree ?? [])
    .filter((node) => !node.hidden)
    .map((node) => {
      const isExternal = EXTERNAL_RE.test(node.path);
      const path = isExternal ? node.path : joinPath(parentPath, node.path);
      const item: NavMenuItem = {
        path,
        name: translateMenuTitle(node.meta?.title || '', node.name || node.path),
        icon: getMenuIcon({ ...node, path }),
      };
      const children = node.children?.length
        ? menuToNavigation(node.children, isExternal ? '' : path)
        : [];
      if (children.length > 0) item.children = children;
      return item;
    });
}
