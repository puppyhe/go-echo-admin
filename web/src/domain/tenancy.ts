export interface TenantIdentity {
  id: string;
  code: string;
  name: string;
}
export interface Tenant extends TenantIdentity {
  state: 'provisioning' | 'active' | 'disabled' | 'failed';
  error?: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}
