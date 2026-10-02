import { request } from '../../../api/request';

export interface Definition {
  name: string;
  group: string;
  executor: 'method' | 'http';
  methodKey: string;
  http: { url: string; method: string; headers: Record<string, string> };
  parameters: Record<string, unknown>;
  cron: string;
  timezone: string;
  timeoutSeconds: number;
}
export interface Job {
  id: number;
  definition: Definition;
  name: string;
  group: string;
  executor: string;
  enabled: boolean;
  revision: number;
  ownerId: number;
  nextRunAt?: string;
  lastRunAt?: string;
  activeRunId: number;
}
export interface Template {
  id: number;
  key: string;
  name: string;
  definition: Definition;
  revision: number;
  builtin: boolean;
}
export interface Method {
  key: string;
  name: string;
  description: string;
  example: Record<string, unknown>;
}
export interface Settings {
  workerEnabled: boolean;
  httpEnabled: boolean;
  allowedHosts: string[];
  revision: number;
  updatedAt?: string;
}
export interface Run {
  id: number;
  jobId: number;
  jobName: string;
  jobRevision: number;
  trigger: 'manual' | 'cron';
  status: string;
  actorId: number;
  occurrenceKey: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs: number;
  httpStatus: number;
  responseBytes: number;
  result: Record<string, unknown>;
  errorCode: string;
  error: string;
}
export interface Page<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  group?: string;
  executor?: string;
  enabled?: boolean;
  jobId?: number;
  status?: string;
  trigger?: string;
  startCreatedAt?: string;
  endCreatedAt?: string;
}
const base = '/enterprise/ops';
export const opsApi = {
  settings: () => request<Settings>(`${base}/settings`),
  saveSettings: (body: Settings) =>
    request<Settings>(`${base}/settings`, {
      method: 'PUT',
      body: {
        workerEnabled: body.workerEnabled,
        httpEnabled: body.httpEnabled,
        allowedHosts: body.allowedHosts,
        revision: body.revision,
      },
    }),
  jobs: (query: ListQuery) => request<Page<Job>>(`${base}/jobs`, { params: { ...query } }),
  job: (id: number) => request<Job>(`${base}/jobs/${id}`),
  saveJob: (definition: Definition, current?: Pick<Job, 'id' | 'revision'>) =>
    request<Job>(`${base}/jobs${current ? `/${current.id}` : ''}`, {
      method: current ? 'PUT' : 'POST',
      body: { definition, revision: current?.revision ?? 0 },
    }),
  enabled: (job: Job, enabled: boolean) =>
    request<Job>(`${base}/jobs/${job.id}/enabled`, {
      method: 'PUT',
      body: { enabled, revision: job.revision },
    }),
  deleteJob: (id: number) => request(`${base}/jobs/${id}`, { method: 'DELETE' }),
  run: (id: number) => request<Run>(`${base}/jobs/${id}/run`, { method: 'POST' }),
  templates: () => request<{ list: Template[]; methods: Method[] }>(`${base}/templates`),
  saveTemplate: (definition: Definition, current?: Pick<Template, 'id' | 'revision'>) =>
    request<Template>(`${base}/templates${current ? `/${current.id}` : ''}`, {
      method: current ? 'PUT' : 'POST',
      body: { definition, revision: current?.revision ?? 0 },
    }),
  deleteTemplate: (id: number) => request(`${base}/templates/${id}`, { method: 'DELETE' }),
  runs: (query: ListQuery) => request<Page<Run>>(`${base}/runs`, { params: { ...query } }),
  runDetail: (id: number) => request<Run>(`${base}/runs/${id}`),
};
