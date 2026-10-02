import { request } from '../../../api/request';
export type NotificationCategory = 'system' | 'todo' | 'announcement' | 'alert' | 'report';
export type NotificationChannel = 'inbox' | 'email' | 'webhook' | 'sms';
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  example?: string | number | boolean;
}
export interface NotificationTemplate {
  id: number;
  code: string;
  name: string;
  category: NotificationCategory;
  titleTemplate: string;
  bodyTemplate: string;
  variables: TemplateVariable[];
  channels: NotificationChannel[];
  description: string;
  enabled: boolean;
  version: number;
}
export interface NotificationPreferences {
  matrix: Record<NotificationCategory, { email: boolean; webhook: boolean; sms?: boolean }>;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timezone: string;
  version: number;
}
export interface NotificationRuntime {
  workerEnabled: boolean;
  smsEnabled?: boolean;
  maxAttempts: number;
  leaseSeconds: number;
  timeoutSeconds: number;
  batchSize: number;
  retentionDays: number;
  suppressMinutes: number;
  defaultQuietStart: string;
  defaultQuietEnd: string;
  defaultTimezone: string;
  allowedWebhookHosts: string[];
  version: number;
}
export type TemplateInput = Omit<NotificationTemplate, 'id'> & { id?: number };
export const notificationManagementApi = {
  templates: (params: {
    page: number;
    pageSize: number;
    q?: string;
    category?: NotificationCategory;
    type?: NotificationChannel;
  }) =>
    request<{ list: NotificationTemplate[]; total: number; page: number; pageSize: number }>(
      '/enterprise/notification-templates',
      { params },
    ),
  template: (id: number) =>
    request<NotificationTemplate>(`/enterprise/notification-templates/${id}`),
  saveTemplate: (template: TemplateInput) => {
    const { id, ...body } = template;
    return request<NotificationTemplate>(
      `/enterprise/notification-templates${id ? `/${id}` : ''}`,
      { method: id ? 'PUT' : 'POST', body },
    );
  },
  deleteTemplate: (id: number) =>
    request<void>(`/enterprise/notification-templates/${id}`, { method: 'DELETE' }),
  preview: (template: TemplateInput, values: Record<string, unknown>) =>
    request<{ title: string; body: string }>('/enterprise/notification-templates/preview', {
      method: 'POST',
      body: { ...template, values },
    }),
  test: (id: number, values: Record<string, unknown>) =>
    request<void>(`/enterprise/notification-templates/${id}/test`, {
      method: 'POST',
      body: { values },
    }),
  preferences: () => request<NotificationPreferences>('/enterprise/notification-preferences'),
  savePreferences: (body: NotificationPreferences) =>
    request<NotificationPreferences>('/enterprise/notification-preferences', {
      method: 'PUT',
      body,
    }),
  runtime: () => request<NotificationRuntime>('/enterprise/notification-config'),
  saveRuntime: (body: NotificationRuntime) =>
    request<NotificationRuntime>('/enterprise/notification-config', { method: 'PUT', body }),
};
