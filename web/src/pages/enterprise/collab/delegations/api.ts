import { request } from '../../../../api/request';
import type { Delegation, DelegationCandidates, DelegationInput } from './types';
const base = '/enterprise/collab/delegations';
export const delegationsApi = {
  list: () => request<{ list: Delegation[] }>(base, { skipError: true }),
  candidates: () => request<DelegationCandidates>(`${base}/candidates`, { skipError: true }),
  create: (body: DelegationInput) =>
    request<Delegation>(base, { method: 'POST', body, skipError: true }),
  update: (id: number, body: DelegationInput) =>
    request<Delegation>(`${base}/${id}`, { method: 'PUT', body, skipError: true }),
  remove: (id: number, revision: number) =>
    request(`${base}/${id}`, { method: 'DELETE', body: { revision }, skipError: true }),
};
