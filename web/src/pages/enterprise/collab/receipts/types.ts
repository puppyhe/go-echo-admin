import type { RequestStatus } from '../types';
export interface Receipt {
  id: number;
  requestId: number;
  nodeId: string;
  nodeName: string;
  userId: number;
  createdAt: string;
  readAt?: string | null;
}
export interface ReceiptItem extends Receipt {
  requestTitle: string;
  requestNumber: string;
  requestStatus: RequestStatus;
  workflowName: string;
}
export type ReceiptScope = 'unread' | 'read' | 'all';
export interface ReceiptQuery {
  page?: number;
  pageSize?: number;
  scope?: ReceiptScope;
  keyword?: string;
}
