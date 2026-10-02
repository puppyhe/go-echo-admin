import { request } from '../../../api/request';
export type ProviderType = 'inbox' | 'email' | 'webhook' | 'sms';
export interface SMSMapping {
  templateCode: string;
  providerTemplate: string;
  parameters: { name: string; variable: string }[];
}
export interface ProviderConfig {
  smtpAddress?: string;
  smtpFrom?: string;
  smtpNickname?: string;
  smtpTls?: string;
  region?: string;
  signName?: string;
  appId?: string;
  mappings?: SMSMapping[];
}
export interface ProviderInput {
  code: string;
  name: string;
  type: ProviderType;
  provider: string;
  enabled: boolean;
  default: boolean;
  ratePerMinute: number;
  description: string;
  config: ProviderConfig;
  version: number;
  secrets?: Partial<
    Record<
      'webhookUrl' | 'signingSecret' | 'smtpSecret' | 'accessKeyId' | 'accessKeySecret',
      string
    >
  >;
  clearSecrets?: string[];
}
export interface ProviderChannel extends ProviderInput {
  id: number;
  secretSet: Record<string, boolean>;
  targetSummary: string;
  credentialsReady: boolean;
  lastStatus?: string;
  lastAttemptAt?: string;
}
export const providerApi = {
  list: (page: number, pageSize: number, q?: string, type?: string) =>
    request<{ list: ProviderChannel[]; total: number; encryptionReady: boolean }>(
      '/enterprise/notification-providers',
      { params: { page, pageSize, q, type } },
    ),
  get: (id: number) => request<ProviderChannel>(`/enterprise/notification-providers/${id}`),
  save: (id: number | undefined, body: ProviderInput) =>
    request<ProviderChannel>(`/enterprise/notification-providers${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body,
    }),
  remove: (id: number, version: number) =>
    request<void>(`/enterprise/notification-providers/${id}`, {
      method: 'DELETE',
      body: { version },
    }),
  test: (row: ProviderChannel, templateCode?: string, values?: Record<string, unknown>) =>
    request<{ message: string }>(`/enterprise/notification-providers/${row.id}/test`, {
      method: 'POST',
      body: { version: row.version, templateCode, values },
    }),
};
