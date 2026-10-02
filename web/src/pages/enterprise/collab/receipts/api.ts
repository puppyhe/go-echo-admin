import { request } from '../../../../api/request';
import type { Page } from '../types';
import type { Receipt, ReceiptItem, ReceiptQuery } from './types';
const base = '/enterprise/collab';
export const receiptsApi = {
  list: (params: ReceiptQuery) =>
    request<Page<ReceiptItem>>(`${base}/receipts`, { params: { ...params } }),
  read: (requestId: number, receiptId: number) =>
    request<Receipt>(`${base}/requests/${requestId}/read`, { method: 'POST', body: { receiptId } }),
};
