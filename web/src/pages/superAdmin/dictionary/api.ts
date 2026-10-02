import { request } from '../../../api/request';
import { sysDictionaryApi, sysDictionaryDetailApi } from '../../../api/endpoints';
import type { SysDictionary, SysDictionaryDetail } from '../../../domain/dictionary';
import { normalizeDetail } from './model';

export const dictionaryApi = {
  async list(): Promise<SysDictionary[]> {
    const items: SysDictionary[] = [];
    let page = 1;
    for (;;) {
      const result = await sysDictionaryApi.getSysDictionaryList({ page, pageSize: 500 });
      items.push(...result.list);
      if (!result.list.length || items.length >= result.total) break;
      page++;
    }
    return items;
  },
  async tree(sysDictionaryID: number) {
    const result = await request<{ list: SysDictionaryDetail[] }>(
      '/sysDictionaryDetail/getDictionaryTreeList',
      {
        params: { sysDictionaryID },
      },
    );
    return (result.list ?? []).map(normalizeDetail);
  },
  save: (values: Partial<SysDictionary>) =>
    values.ID
      ? sysDictionaryApi.updateSysDictionary(values)
      : sysDictionaryApi.createSysDictionary(values),
  remove: (ID: number) => sysDictionaryApi.deleteSysDictionary({ ID }),
  export: (ID: number) => sysDictionaryApi.exportSysDictionary({ ID }),
  import: (value: unknown) =>
    request<void>('/sysDictionary/importSysDictionary', { method: 'POST', body: value }),
  saveDetail: (values: Partial<SysDictionaryDetail>) =>
    values.ID
      ? sysDictionaryDetailApi.updateSysDictionaryDetail(values)
      : sysDictionaryDetailApi.createSysDictionaryDetail(values),
  removeDetail: (ID: number) => sysDictionaryDetailApi.deleteSysDictionaryDetail({ ID }),
};
