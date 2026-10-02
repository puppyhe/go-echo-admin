import { request } from '../../../api/request';
export interface PasswordRules {
  enabled: boolean;
  minLength: number;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}
export interface SecurityPolicy {
  version: number;
  captcha: {
    threshold: number;
    cacheSeconds: number;
    length: number;
    width: number;
    height: number;
  };
  password: PasswordRules;
  rateLimit: { enabled: boolean; windowSeconds: number; maxAttempts: number };
  lockout: { enabled: boolean; failures: number; durationMinutes: number };
  expiry: { enabled: boolean; forceFirstLogin: boolean; days: number };
}
export interface PasswordStatus {
  required: boolean;
  reason: string;
  expiresAt?: string;
  rules: PasswordRules;
}
export const securityApi = {
  get: () => request<SecurityPolicy>('/system/security'),
  save: (body: SecurityPolicy) =>
    request<SecurityPolicy>('/system/security', { method: 'PUT', body, skipError: true }),
  status: () => request<PasswordStatus>('/security/password-status', { skipError: true }),
};
