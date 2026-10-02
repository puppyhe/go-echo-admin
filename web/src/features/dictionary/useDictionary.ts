import { session } from '../../api/request';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Internal implementation detail.
// Internal implementation detail.
import { useEffect, useMemo, useState } from 'react';
import { sysDictionaryDetailApi } from '../../api/endpoints';
import { dictionaryService } from '../../services/dictionaryService';
import type { DictionaryTreeNode } from '../../domain/dictionary';

// Internal implementation detail.
export interface DictionaryOption {
  label: string;
  value: string;
  disabled?: boolean;
}

// Internal implementation detail.
const dictionaryCache = new Map<string, DictionaryTreeNode[]>();

// Internal implementation detail.
const pendingFetches = new Map<string, Promise<DictionaryTreeNode[]>>();
const listeners = new Set<(type?: string) => void>();

// Internal implementation detail.
export function normalizeTreeData(items: DictionaryTreeNode[]): DictionaryTreeNode[] {
  return items.map((item) => ({
    label: item.label,
    value: item.value,
    extend: item.extend,
    disabled: item.disabled,
    children:
      item.children && item.children.length > 0 ? normalizeTreeData(item.children) : undefined,
  }));
}

// Internal implementation detail.
export function filterTreeByDepth(
  items: DictionaryTreeNode[],
  currentDepth: number,
  targetDepth: number,
): DictionaryTreeNode[] {
  if (targetDepth <= 0) return items;
  if (currentDepth >= targetDepth) {
    return items.map((item) => ({
      label: item.label,
      value: item.value,
      extend: item.extend,
      disabled: item.disabled,
    }));
  }
  return items.map((item) => ({
    label: item.label,
    value: item.value,
    extend: item.extend,
    disabled: item.disabled,
    children: item.children
      ? filterTreeByDepth(item.children, currentDepth + 1, targetDepth)
      : undefined,
  }));
}

// Internal implementation detail.
export function flattenTree(
  items: DictionaryTreeNode[],
  out: DictionaryOption[] = [],
): DictionaryOption[] {
  items.forEach((item) => {
    out.push({ label: item.label, value: item.value, disabled: item.disabled });
    if (item.children && item.children.length > 0) flattenTree(item.children, out);
  });
  return out;
}

// Internal implementation detail.
function fetchDictionaryTree(type: string): Promise<DictionaryTreeNode[]> {
  const cacheKey = session.cacheKey(type);
  const cached = dictionaryCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  const pending = pendingFetches.get(cacheKey);
  if (pending) return pending;
  const request = sysDictionaryDetailApi
    .getDictionaryTreeListByType({ type })
    .then((res) => {
      const tree = normalizeTreeData(res.list ?? []);
      if (pendingFetches.get(cacheKey) === request) dictionaryCache.set(cacheKey, tree);
      return tree;
    })
    .finally(() => {
      if (pendingFetches.get(cacheKey) === request) pendingFetches.delete(cacheKey);
    });
  pendingFetches.set(cacheKey, request);
  return request;
}

// Internal implementation detail.
export function useDictionary(
  type: string,
  depth = 0,
): { options: DictionaryOption[]; loading: boolean } {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = (changedType?: string) => {
      if (changedType === undefined || changedType === type) setRevision((value) => value + 1);
    };
    listeners.add(changed);
    return () => {
      listeners.delete(changed);
    };
  }, [type]);
  const [tree, setTree] = useState<DictionaryTreeNode[] | null>(
    () => dictionaryCache.get(session.cacheKey(type)) ?? null,
  );
  const [loading, setLoading] = useState(
    () => Boolean(type) && !dictionaryCache.has(session.cacheKey(type)),
  );

  useEffect(() => {
    if (!type) {
      // Internal implementation detail.
      setTree(null);
      setLoading(false);
      return;
    }
    const cached = dictionaryCache.get(session.cacheKey(type));
    if (cached) {
      setTree(cached);
      setLoading(false);
      return;
    }
    let alive = true;
    setTree(null);
    setLoading(true);
    void fetchDictionaryTree(type)
      .then((result) => {
        if (alive) setTree(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [type, revision]);

  // Internal implementation detail.
  const options = useMemo<DictionaryOption[]>(() => {
    if (!tree) return [];
    const pruned = depth > 0 ? filterTreeByDepth(tree, 1, depth) : tree;
    return flattenTree(pruned);
  }, [tree, depth]);

  return { options, loading };
}

// Internal implementation detail.
export function clearDictionaryCache(type?: string): void {
  dictionaryService.clearCache(type);
  if (type === undefined) {
    dictionaryCache.clear();
    pendingFetches.clear();
    listeners.forEach((changed) => changed());
    return;
  }
  dictionaryCache.delete(session.cacheKey(type));
  pendingFetches.delete(session.cacheKey(type));
  listeners.forEach((changed) => changed(type));
}
