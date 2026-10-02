import { request } from '../../../api/request';
import type { ScopeDocument } from './model';
import { scopePayload } from './model';
export const scopeApi = {
  get: (authorityId: number) =>
    request<ScopeDocument>('/authority/dataScope', { skipError: true, params: { authorityId } }),
  save: (body: ReturnType<typeof scopePayload>) =>
    request<ScopeDocument>('/authority/dataScope', { skipError: true, method: 'PUT', body }),
};
