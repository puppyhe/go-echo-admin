import { request } from '../../../api/request';
export interface Notice {
  id: number;
  title: string;
  content: string;
  link: string;
  createdAt: string;
  readAt: string | null;
  category: string;
  templateCode: string;
  urgent: boolean;
}
export interface Channel {
  id: number;
  name: string;
  type: 'email' | 'webhook';
  target: string;
  enabled: boolean;
}
export interface Delivery {
  id: number;
  notificationId: number;
  channelName: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string;
  createdAt: string;
  sentAt?: string;
}
export const notificationsApi = {
  list: (
    page = 1,
    unread = false,
    silent = false,
    filters: { pageSize?: number; q?: string; category?: string; status?: 'read' } = {},
  ) =>
    request<{ list: Notice[]; total: number; unread: number }>('/enterprise/notifications', {
      params: { page, pageSize: 20, unread, ...filters },
      skipError: silent,
    }),
  read: (id: number) => request(`/enterprise/notifications/${id}/read`, { method: 'POST' }),
  batch: (ids: number[], action: 'read' | 'remove') =>
    request<void>('/enterprise/notifications/batch', { method: 'POST', body: { ids, action } }),
  readAll: () => request('/enterprise/notifications/read-all', { method: 'POST' }),
  channels: () => request<{ list: Channel[] }>('/enterprise/channels'),
  saveChannel: (body: Omit<Channel, 'id'>, id?: number) =>
    request(`/enterprise/channels${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body }),
  deleteChannel: (id: number) => request(`/enterprise/channels/${id}`, { method: 'DELETE' }),
  deliveries: (
    page = 1,
    filters: { pageSize?: number; q?: string; type?: string; status?: string } = {},
  ) =>
    request<{ list: Delivery[]; total: number }>('/enterprise/deliveries', {
      params: { page, pageSize: 20, ...filters },
    }),
  retry: (id: number) => request(`/enterprise/deliveries/${id}/retry`, { method: 'POST' }),
};
