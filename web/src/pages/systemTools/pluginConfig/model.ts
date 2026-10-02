export interface MenuConfig {
  name: string;
  path: string;
  title: string;
  component: string;
  icon: string;
  sort: number;
  hidden: boolean;
  keepAlive: boolean;
  parentName?: string;
  children?: MenuConfig[];
}
export interface ApiConfig {
  path: string;
  method: string;
  description: string;
  apiGroup: string;
}
export interface DetailConfig {
  label: string;
  value: string;
  status: boolean;
  sort: number;
  extend: string;
  children?: DetailConfig[];
}
export interface DictionaryConfig {
  name: string;
  type: string;
  status: boolean;
  description: string;
  details: DetailConfig[];
}
export interface Manifest {
  version: 1;
  pluginName: string;
  description: string;
  menus: MenuConfig[];
  apis: ApiConfig[];
  dictionaries: DictionaryConfig[];
}
export interface Counts {
  menus: number;
  apis: number;
  dictionaries: number;
  details: number;
}
export interface PluginFile {
  path: string;
  side: string;
  size: number;
}
export interface ConfigDocument {
  pluginName: string;
  pluginType: string;
  revision: string;
  manifest: Manifest;
  files: PluginFile[];
  warnings: string[];
  counts: Counts;
}
export interface GeneratedFile {
  path: string;
  content: string;
}
export interface ConfigPreview {
  manifest: Manifest;
  files: GeneratedFile[];
  counts: Counts;
}
export interface Analysis {
  pluginName: string;
  pluginType: string;
  manifest: Manifest;
  counts: Counts;
  files: PluginFile[];
  warnings: string[];
  conflicts: string[];
}
export type TreeNode<T> = T & { children?: TreeNode<T>[] };
export function flattenTree<T extends { children?: T[] }>(
  nodes: T[],
  prefix = '',
): Array<{ key: string; node: T }> {
  return nodes.flatMap((node, i) => {
    const key = prefix ? `${prefix}.${i}` : String(i);
    return [{ key, node }, ...flattenTree(node.children ?? [], key)];
  });
}
export function changeTree<T extends { children?: T[] }>(
  nodes: T[],
  key: string,
  change: (node: T) => T | null,
): T[] {
  const [index, ...rest] = key.split('.').map(Number);
  if (!Number.isInteger(index) || index < 0 || index >= nodes.length) return nodes;
  return nodes.flatMap((node, i) => {
    if (i !== index) return [node];
    if (rest.length)
      return [{ ...node, children: changeTree(node.children ?? [], rest.join('.'), change) }];
    const next = change(node);
    return next ? [next] : [];
  });
}
export function addTree<T extends { children?: T[] }>(
  nodes: T[],
  parent: string | undefined,
  node: T,
): T[] {
  return parent === undefined
    ? [...nodes, node]
    : changeTree(nodes, parent, (current) => ({
        ...current,
        children: [...(current.children ?? []), node],
      }));
}
/** Move by object identity so removing a preceding sibling cannot retarget a parent index. */
export function moveTree<T extends { children?: T[] }>(
  nodes: T[],
  key: string,
  parent: string | undefined,
): T[] {
  if (parent === key || parent?.startsWith(`${key}.`)) throw Error('message');
  const source = flattenTree(nodes).find((v) => v.key === key)?.node;
  const target =
    parent === undefined ? undefined : flattenTree(nodes).find((v) => v.key === parent)?.node;
  if (!source || (parent !== undefined && !target)) return nodes;
  const prune = (items: T[]): T[] =>
    items.flatMap((node) => {
      if (node === source) return [];
      const children = prune(node.children ?? []);
      if (node === target) children.push(source);
      return [{ ...node, ...(node.children || children.length ? { children } : {}) }];
    });
  const result = prune(nodes);
  if (!target) result.push(source);
  return result;
}

export const newMenu = (): MenuConfig => ({
  name: '',
  path: '',
  title: 'menu',
  component: '',
  icon: '',
  sort: 0,
  hidden: false,
  keepAlive: false,
});
export const newDetail = (): DetailConfig => ({
  label: 'message',
  value: '',
  sort: 0,
  status: true,
  extend: '',
});
export const newDictionary = (): DictionaryConfig => ({
  name: 'dictionary',
  type: '',
  status: true,
  description: '',
  details: [],
});
export function manifestError(m: Manifest): string | undefined {
  const menus = flattenTree(m.menus);
  if (menus.length > 300) return 'menumessage300message';
  const names = new Set<string>();
  for (const { node: v } of menus) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(v.name) || names.has(v.name))
      return `menunameduplicate：${v.name || 'message'}`;
    names.add(v.name);
    if (!v.title.trim() || !v.path || (!v.component && !v.children?.length))
      return `menu「${v.title}」pathmessage`;
  }
  const apis = new Set<string>();
  for (const v of m.apis) {
    const key = `${v.method} ${v.path}`;
    if (!v.path.startsWith('/') || !v.apiGroup.trim() || apis.has(key))
      return `APIpath、groupduplicate：${key}`;
    apis.add(key);
  }
  const types = new Set<string>();
  for (const d of m.dictionaries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(d.type) || types.has(d.type) || !d.name.trim())
      return 'dictionaryname、typeduplicate';
    types.add(d.type);
    const values = new Set<string>();
    for (const { node: v } of flattenTree(d.details)) {
      if (!v.label.trim() || v.value === '' || values.has(v.value))
        return `dictionary「${d.name}」name/duplicate`;
      values.add(v.value);
    }
  }
  return undefined;
}
export function importResources(
  current: Manifest,
  kind: 'menus' | 'apis' | 'dictionaries',
  items: MenuConfig[] | ApiConfig[] | DictionaryConfig[],
): Manifest {
  const next = structuredClone(current);
  if (kind === 'menus') {
    const used = new Set(flattenTree(next.menus).map((v) => v.node.name));
    for (const item of items as MenuConfig[]) {
      if (flattenTree([item]).some((v) => used.has(v.node.name)))
        throw Error('menumenu，removeduplicatemessage');
      flattenTree([item]).forEach((v) => used.add(v.node.name));
      next.menus.push(structuredClone(item));
    }
  } else if (kind === 'apis') {
    for (const item of items as ApiConfig[]) {
      if (next.apis.some((v) => v.method === item.method && v.path === item.path)) continue;
      next.apis.push(structuredClone(item));
    }
  } else {
    for (const item of items as DictionaryConfig[]) {
      if (next.dictionaries.some((v) => v.type === item.type)) throw Error('typedictionary');
      next.dictionaries.push(structuredClone(item));
    }
  }
  return next;
}
export function saveTextFile(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Only roots can mount to an existing external menu; moving into this tree clears that old mount.
export function menuHierarchy(nodes: MenuConfig[], nested = false): MenuConfig[] {
  return nodes.map((node) => ({
    ...node,
    parentName: nested ? undefined : node.parentName,
    children: menuHierarchy(node.children ?? [], true),
  }));
}
