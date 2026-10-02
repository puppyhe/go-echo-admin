import { matchPath } from 'react-router-dom';
import type { MenuNode } from '../domain/menu';

const EXTERNAL_RE = /^https?:\/\//i;

export function joinPath(parent: string, child: string): string {
  return (child.startsWith('/') ? child : `${parent}/${child}`).replace(/\/+/g, '/');
}

interface MenuIndex {
  nodeByPath: Map<string, MenuNode>;
  nameToNode: Map<string, MenuNode>;
  pathByName: Map<string, string>;
}

export function buildIndex(tree: MenuNode[]): MenuIndex {
  const index: MenuIndex = { nodeByPath: new Map(), nameToNode: new Map(), pathByName: new Map() };
  const walk = (nodes: MenuNode[], parentPath: string) => {
    nodes.forEach((node) => {
      index.nameToNode.set(node.name, node);
      if (EXTERNAL_RE.test(node.path)) return; // documentationnodedocumentationpathdocumentation
      const abs = joinPath(parentPath, node.path);
      index.nodeByPath.set(abs, node);
      index.pathByName.set(node.name, abs);
      if (node.children?.length) walk(node.children, abs);
    });
  };
  walk(tree ?? [], '');
  return index;
}

// Internal implementation detail.
export function firstLeafPath(tree: MenuNode[], parent = ''): string | null {
  for (const node of tree) {
    if (EXTERNAL_RE.test(node.path) || node.component === '/' || node.hidden) continue;
    const path = joinPath(parent, node.path);
    if (node.children?.length) {
      const child = firstLeafPath(node.children, path);
      if (child) return child;
      continue; // documentation
    }
    if (path.includes(':')) continue;
    return path;
  }
  return null;
}

// Internal implementation detail.
export function matchingMenus(
  index: Map<string, MenuNode>,
  pathname: string,
): [string, MenuNode][] {
  const matches = [...index.entries()]
    .filter(([path]) => matchPath({ path, end: false }, pathname))
    .sort(([a], [b]) => {
      const depth = (path: string) => path.split('/').filter(Boolean).length;
      return (
        depth(a) - depth(b) || b.split(':').length - a.split(':').length || a.length - b.length
      );
    });
  const current = matches.at(-1);
  if (!current) return [];
  const entries = [...index.entries()];
  const byNode = new Map(entries.map((entry) => [entry[1], entry]));
  const parents = new Map<MenuNode, MenuNode>();
  for (const [, node] of entries) {
    for (const child of node.children ?? []) parents.set(child, node);
  }
  const lineage: [string, MenuNode][] = [current];
  const seen = new Set<MenuNode>([current[1]]);
  let parent = parents.get(current[1]);
  while (parent && !seen.has(parent)) {
    const entry = byNode.get(parent);
    if (!entry) break;
    lineage.unshift(entry);
    seen.add(parent);
    parent = parents.get(parent);
  }
  return lineage;
}

// Internal implementation detail.
export function formatMenuTitle(
  title: string,
  pattern: string,
  pathname: string,
  search = '',
): string {
  const params = matchPath({ path: pattern, end: false }, pathname)?.params || {};
  const query = new URLSearchParams(search);
  return title.replace(/\$\{([^}]+)\}/g, (_, key: string) => params[key] || query.get(key) || '');
}
