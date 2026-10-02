import { request, sessionHeaders, session, checkSessionResponse } from '../../../api/request';
import { readLlmResponse, type LlmProgress } from '../../../domain/llmStream';
import type { Design, DesignInput, Version } from './model';
const base = '/enterprise/page-designs';
const opts = { skipError: true };
export const pageBuilderApi = {
  config: () => request<{ configured: boolean; mode: string }>(`${base}/config`, opts),
  list: (page = 1, q = '') =>
    request<{ list: Design[]; total: number; page: number; pageSize: number }>(base, {
      ...opts,
      params: { page, pageSize: 10, q },
    }),
  get: (id: number) => request<Design>(`${base}/${id}`, opts),
  save: (body: DesignInput, id?: number) =>
    request<Design>(`${base}${id ? `/${id}` : ''}`, { ...opts, method: id ? 'PUT' : 'POST', body }),
  remove: (id: number, revision: number) =>
    request(`${base}/${id}`, { ...opts, method: 'DELETE', body: { revision } }),
  versions: (id: number) => request<{ list: Version[] }>(`${base}/${id}/versions`, opts),
  version: (id: number, versionId: number) =>
    request<Version>(`${base}/${id}/versions/${versionId}`, opts),
  async generate(
    id: number,
    revision: number,
    instruction: string,
    signal: AbortSignal,
    progress: (value: LlmProgress) => void,
  ) {
    const scope = session.capture();
    const response = await fetch(`/api${base}/${id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders(scope) },
      body: JSON.stringify({ revision, instruction }),
      signal,
    });
    await checkSessionResponse(response, true, scope);
    return readLlmResponse(response, progress, signal);
  },
};
