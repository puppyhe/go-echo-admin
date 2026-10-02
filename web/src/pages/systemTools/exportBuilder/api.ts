import { request } from '../../../api/request';
import type { BuilderCatalog, BuilderPreview, ExportQuery } from './model';
export const exportBuilderApi = {
  catalog: () => request<BuilderCatalog>('/sysExportTemplate/getBuilderCatalog'),
  preview: (query: ExportQuery, templateID = '') =>
    request<BuilderPreview>('/sysExportTemplate/previewBuilder', {
      method: 'POST',
      body: { query, templateID },
    }),
  export: (templateID: string, values: Record<string, unknown>, limit: number) =>
    request<{ url: string }>('/sysExportTemplate/exportExcel', {
      params: {
        templateID,
        params: new URLSearchParams(
          Object.entries(values).map(([key, value]) => [
            key,
            typeof value === 'object' ? JSON.stringify(value) : String(value),
          ]),
        ).toString(),
        limit,
      },
    }),
};
