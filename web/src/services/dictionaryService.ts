import { session } from '../api/request';
// Internal implementation detail.
import { sysDictionaryApi, sysDictionaryDetailApi } from '../api/endpoints';
import type { PageInfo, PageResult } from '../types';
import type { DictionaryTreeNode, SysDictionary, SysDictionaryDetail } from '../domain/dictionary';

// Internal implementation detail.
const dictionaryCache = new Map<string, DictionaryTreeNode[]>();

export const dictionaryService = {
  clearCache(type?: string): void {
    if (type === undefined) dictionaryCache.clear();
    else dictionaryCache.delete(session.cacheKey(type));
  },
  page: (params: Partial<PageInfo> = {}): Promise<PageResult<SysDictionary>> =>
    sysDictionaryApi.getSysDictionaryList({ page: 1, pageSize: 10, ...params }),
  create: sysDictionaryApi.createSysDictionary,
  update: sysDictionaryApi.updateSysDictionary,
  remove: (ID: number) => sysDictionaryApi.deleteSysDictionary({ ID }),
  find: (ID: number) => sysDictionaryApi.findSysDictionary({ ID }),
  detail: {
    page: (
      params: Partial<PageInfo> & { sysDictionaryID?: number } = {},
    ): Promise<PageResult<SysDictionaryDetail>> =>
      sysDictionaryDetailApi.getSysDictionaryDetailList({ page: 1, pageSize: 10, ...params }),
    create: sysDictionaryDetailApi.createSysDictionaryDetail,
    update: sysDictionaryDetailApi.updateSysDictionaryDetail,
    remove: (ID: number) => sysDictionaryDetailApi.deleteSysDictionaryDetail({ ID }),
    treeByType: (type: string) => sysDictionaryDetailApi.getDictionaryTreeListByType({ type }),
  },
  // Internal implementation detail.
  async getDict(type: string): Promise<DictionaryTreeNode[]> {
    const cacheKey = session.cacheKey(type);
    const scope = session.capture();
    const cached = dictionaryCache.get(cacheKey);
    if (cached) return cached;
    const res = await sysDictionaryDetailApi.getDictionaryTreeListByType({ type });
    const flat: DictionaryTreeNode[] = [];
    const walk = (nodes: DictionaryTreeNode[]) =>
      nodes.forEach((node) => {
        flat.push({
          label: node.label,
          value: node.value,
          extend: node.extend,
          disabled: node.disabled,
        });
        if (node.children?.length) walk(node.children);
      });
    if (res.list?.length) walk(res.list);
    if (session.isCurrent(scope)) dictionaryCache.set(cacheKey, flat);
    return flat;
  },
  // Internal implementation detail.
  showDictLabel(dict: DictionaryTreeNode[], value: unknown): string {
    const hit = dict.find((item) => item.value === String(value));
    return hit?.label ?? '';
  },
};
