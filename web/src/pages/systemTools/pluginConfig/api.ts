import { postForm, request } from '../../../api/request';
import type { Analysis, ConfigDocument, ConfigPreview, Counts, Manifest } from './model';
const base = '/autoCode';
const options = { skipError: true };
export const pluginConfigApi = {
  get: (pluginName: string) =>
    request<ConfigDocument>(`${base}/pluginConfig`, { ...options, params: { pluginName } }),
  catalog: () => request<Manifest>(`${base}/pluginInitCatalog`, options),
  preview: (document: Pick<ConfigDocument, 'pluginName' | 'revision'>, manifest: Manifest) =>
    request<ConfigPreview>(`${base}/previewPluginConfig`, {
      ...options,
      method: 'POST',
      body: { pluginName: document.pluginName, revision: document.revision, manifest },
    }),
  save: (document: Pick<ConfigDocument, 'pluginName' | 'revision'>, manifest: Manifest) =>
    request<ConfigDocument>(`${base}/savePluginConfig`, {
      ...options,
      method: 'POST',
      body: { pluginName: document.pluginName, revision: document.revision, manifest },
    }),
  apply: (document: Pick<ConfigDocument, 'pluginName' | 'revision'>) =>
    request<{ created: Counts; skipped: Counts }>(`${base}/applyPluginConfig`, {
      ...options,
      method: 'POST',
      body: { pluginName: document.pluginName, revision: document.revision },
  }),
  analyze: (file: File) => {
    const body = new FormData();
    // Pass the filename explicitly so browsers and the Node 18/19 FormData
    // implementation preserve the uploaded archive name consistently.
    body.append('plug', file, file.name);
    return postForm<Analysis>(`${base}/analyzePlugin`, body);
  },
};
