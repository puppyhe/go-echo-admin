import { request } from '../../../api/request';
import type {
  ApprovalRequest,
  BusinessForm,
  BusinessTypeChoice,
  FormInput,
  FormVersion,
  ListQuery,
  Page,
  RequestDetail,
  RoleChoice,
  UserChoice,
  Workflow,
  WorkflowInput,
  WorkflowVersion,
  WorkflowCheckup,
  WorkflowGraph,
  GraphValidation,
  GraphPreview,
} from './types';

const base = '/enterprise/collab';
export const collabApi = {
  businessTypes: () => request<BusinessTypeChoice[]>(`${base}/business-types`),
  forms: (params: ListQuery = {}) => request<Page<BusinessForm>>(`${base}/forms`, { params }),
  form: (id: number) => request<BusinessForm>(`${base}/forms/${id}`),
  saveForm: (body: FormInput, id?: number) =>
    request<BusinessForm>(`${base}/forms${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body,
    }),
  publishForm: (id: number, revision: number, note?: string) =>
    request<BusinessForm>(`${base}/forms/${id}/publish`, {
      method: 'POST',
      body: { revision, note },
    }),
  formVersions: (id: number) => request<{ list: FormVersion[] }>(`${base}/forms/${id}/versions`),
  formVersion: (id: number, version: number) =>
    request<FormVersion>(`${base}/forms/${id}/versions/${version}`),
  restoreForm: (id: number, version: number, revision: number) =>
    request<BusinessForm>(`${base}/forms/${id}/versions/${version}/restore`, {
      method: 'POST',
      body: { revision },
    }),
  deleteForm: (id: number) => request(`${base}/forms/${id}`, { method: 'DELETE' }),
  workflows: (params: ListQuery = {}) => request<Page<Workflow>>(`${base}/workflows`, { params }),
  workflow: (id: number) => request<Workflow>(`${base}/workflows/${id}`),
  validateGraph: (body: { formId?: number; businessType?: string; graph: WorkflowGraph }) =>
    request<GraphValidation>(`${base}/workflows/graph/validate`, { method: 'POST', body }),
  previewGraph: (body: {
    formId?: number;
    businessType?: string;
    graph: WorkflowGraph;
    data: Record<string, unknown>;
    approvals?: Record<string, 'approve' | 'reject'>;
  }) => request<GraphPreview>(`${base}/workflows/graph/preview`, { method: 'POST', body }),
  saveWorkflow: (body: WorkflowInput, id?: number) =>
    request<Workflow>(`${base}/workflows${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body,
    }),
  publishWorkflow: (id: number, revision: number, note?: string) =>
    request<Workflow>(`${base}/workflows/${id}/publish`, {
      method: 'POST',
      body: { revision, note },
    }),
  workflowVersions: (id: number) =>
    request<{ list: WorkflowVersion[] }>(`${base}/workflows/${id}/versions`),
  workflowVersion: (id: number, version: number) =>
    request<WorkflowVersion>(`${base}/workflows/${id}/versions/${version}`),
  restoreWorkflow: (id: number, version: number, revision: number) =>
    request<Workflow>(`${base}/workflows/${id}/versions/${version}/restore`, {
      method: 'POST',
      body: { revision },
    }),
  checkup: (id?: number, silent = false) =>
    request<WorkflowCheckup>(id ? `${base}/workflows/${id}/checkup` : `${base}/checkup`, {
      skipError: silent,
    }),
  deleteWorkflow: (id: number) => request(`${base}/workflows/${id}`, { method: 'DELETE' }),
  requests: (params: ListQuery = {}) =>
    request<Page<ApprovalRequest>>(`${base}/requests`, { params }),
  remind: (id: number) =>
    request<{ count: number }>(`${base}/requests/${id}/remind`, { method: 'POST' }),
  submit: (body: {
    urgency?: import('./types').RequestUrgency;
    businessKey?: string;
    formId: number;
    workflowId: number;
    title: string;
    data: Record<string, unknown>;
  }) => request<ApprovalRequest>(`${base}/requests`, { method: 'POST', body }),
  detail: (id: number) => request<RequestDetail>(`${base}/requests/${id}`),
  withdraw: (id: number) => request(`${base}/requests/${id}/withdraw`, { method: 'POST' }),
  decide: (id: number, action: 'approve' | 'reject', comment: string) =>
    request(`${base}/tasks/${id}/${action}`, { method: 'POST', body: { comment } }),
  users: async () => {
    const data = await request<UserChoice[] | { list: UserChoice[] }>(`${base}/users`);
    return Array.isArray(data) ? data : (data.list ?? []);
  },
  roles: async (): Promise<RoleChoice[]> => {
    type Role = { authorityId: number; authorityName: string; children?: Role[] };
    const data = await request<{ list: Role[] }>('/authority/getAuthorityList', {
      method: 'POST',
      body: { page: 1, pageSize: 999 },
      skipError: true,
    });
    const choices = new Map<number, RoleChoice>();
    const visit = (items: Role[]) =>
      items.forEach((role) => {
        choices.set(role.authorityId, {
          value: role.authorityId,
          label: `${role.authorityName} (${role.authorityId})`,
        });
        visit(role.children ?? []);
      });
    visit(data.list ?? []);
    return [...choices.values()];
  },
};

/** Candidate lists must not silently omit records after the first server page. */
export async function allPages<T>(load: (query: ListQuery) => Promise<Page<T>>): Promise<T[]> {
  const list: T[] = [];
  for (let page = 1; ; page++) {
    const result = await load({ page, pageSize: 100 });
    const batch = result.list ?? [];
    list.push(...batch);
    if (!batch.length || list.length >= result.total) return list;
    if (page >= 100) throw new Error('message，message');
  }
}
