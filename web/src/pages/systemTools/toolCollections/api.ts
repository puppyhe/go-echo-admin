import { request } from '../../../api/request';
import { downloadByUrl } from '../../../api/download';
export type Kind = 'cli';
export interface ValueSchema {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
  properties?: Record<string, ValueSchema>;
  required?: string[];
  items?: ValueSchema;
  enum?: unknown[];
}
export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'body';
  description: string;
  required: boolean;
  schema: ValueSchema;
}
export interface Binding {
  apiId: number;
  name: string;
  description: string;
  parameters: Parameter[];
  path?: string;
  method?: string;
}
export interface Definition {
  kind: Kind;
  name: string;
  displayName: string;
  version: string;
  status: 'draft' | 'enabled' | 'disabled';
  command: string;
  skillName: string;
  skillDescription: string;
  sharedRoleIds: number[];
  bindings: Binding[];
}
export interface Collection {
  id: number;
  ownerId: number;
  lockVersion: number;
  definition: Definition;
}
export interface Summary {
  id: number;
  kind: Kind;
  name: string;
  displayName: string;
  version: string;
  status: Definition['status'];
  apiCount: number;
  lockVersion: number;
  ownerId: number;
  accessible: boolean;
  updatedAt: string;
}
export interface RegisteredAPI {
  id: number;
  path: string;
  method: string;
  description: string;
  apiGroup: string;
}
export interface Artifact {
  files: Record<string, string>;
  tools: unknown[];
  revision: number;
  warning: string;
}
export interface Revision {
  revision: number;
  version: string;
  status: Definition['status'];
  createdAt: string;
}
const prefix = '/enterprise/tooling';
export const collectionsApi = {
  apis: () => request<{ list: RegisteredAPI[] }>(prefix + '/apis'),
  list: (kind: Kind) => request<{ list: Summary[] }>(prefix + '/collections', { params: { kind } }),
  get: (id: number) => request<Collection>(prefix + '/collections/' + id),
  save: (id: number | undefined, definition: Definition, lockVersion: number) =>
    request<Collection>(prefix + '/collections' + (id ? '/' + id : ''), {
      method: id ? 'PUT' : 'POST',
      body: {
        ...definition,
        lockVersion,
        bindings: definition.bindings.map(
          ({ path: _path, method: _method, ...binding }) => binding,
        ),
      },
    }),
  remove: (row: Summary) =>
    request(prefix + '/collections/' + row.id, {
      method: 'DELETE',
      params: { lockVersion: row.lockVersion },
    }),
  preview: (id: number) => request<Artifact>(prefix + '/collections/' + id + '/preview'),
  download: (id: number, revision?: number) =>
    downloadByUrl(prefix + '/collections/' + id + '/download', { params: { revision } }),
  history: (id: number) =>
    request<{ list: Revision[] }>(prefix + '/collections/' + id + '/history'),
  restore: (id: number, revision: number, lockVersion: number) =>
    request<Collection>(prefix + '/collections/' + id + '/restore', {
      method: 'POST',
      body: { revision, lockVersion },
    }),
};
export function newDefinition(kind: Kind): Definition {
  return {
    kind,
    name: '',
    displayName: '',
    version: '1.0.0',
    status: 'draft',
    command: '',
    skillName: '',
    skillDescription: '',
    sharedRoleIds: [],
    bindings: [],
  };
}
export function bindingForAPI(api: RegisteredAPI): Binding {
  return {
    apiId: api.id,
    name: 'api_' + api.id,
    description: api.description || api.path,
    path: api.path,
    method: api.method,
    parameters: api.path
      .split('/')
      .filter((part) => part.startsWith(':'))
      .map((part) => ({
        name: part.slice(1),
        in: 'path',
        required: true,
        description: 'pathparameter ' + part.slice(1),
        schema: { type: 'string' },
      })),
  };
}
