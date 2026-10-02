import { request } from '../../../api/request';
import { downloadByUrl } from '../../../api/download';
import type { RequestDetail } from '../../enterprise/collab/types';

export interface Purchase {
  id: number;
  title: string;
  amountCents: number;
  note: string;
  ownerId: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn';
  version: number;
  approvalRequestId: number;
  createdAt: string;
}
export interface PurchaseInput {
  title: string;
  amountCents: number;
  note: string;
  version: number;
}
const base = '/business/purchases';
export const purchaseApi = {
  list: (params: Record<string, unknown>) =>
    request<{ list: Purchase[]; total: number }>(base, { params }),
  get: (id: number) => request<Purchase>(`${base}/${id}`),
  save: (body: PurchaseInput, id?: number) =>
    request<Purchase>(`${base}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body }),
  delete: (row: Purchase) =>
    request(`${base}/${row.id}`, { method: 'DELETE', body: { version: row.version } }),
  submit: (row: Purchase, workflowId: number) =>
    request<RequestDetail>(`${base}/${row.id}/submit`, {
      method: 'POST',
      body: { version: row.version, workflowId, previousRequestId: row.approvalRequestId || 0 },
    }),
  export: (params: Record<string, unknown>) => downloadByUrl(`${base}/export`, { params }),
};
