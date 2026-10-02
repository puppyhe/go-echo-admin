import { request } from '../../api/request';
import type { Department, MembersResult, OrgKind, OrgPage, OrgUser, Position } from './types';
const base = '/enterprise/org';
export const orgApi = {
  departments: () => request<{ list: Department[] }>(`${base}/departments`),
  saveDepartment: (value: Omit<Department, 'id' | 'children' | 'leader'> & { id?: number }) => {
    const { id, ...body } = value;
    return request<Department>(`${base}/departments${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body,
    });
  },
  positions: (params: { page: number; pageSize: number; keyword?: string }) =>
    request<OrgPage<Position>>(`${base}/positions`, { params }),
  savePosition: (value: Omit<Position, 'id'> & { id?: number }) => {
    const { id, ...body } = value;
    return request<Position>(`${base}/positions${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body,
    });
  },
  remove: (kind: OrgKind, id: number) =>
    request<void>(`${base}/${kind}/${id}`, { method: 'DELETE' }),
  users: (params: {
    page: number;
    pageSize: number;
    keyword?: string;
    username?: string;
    nickName?: string;
    onlyEnabled?: boolean;
  }) => request<OrgPage<OrgUser>>(`${base}/users`, { params }),
  members: (kind: OrgKind, id: number) =>
    request<MembersResult>(`${base}/${kind}/${id}/members`, { params: { page: 1, pageSize: 1 } }),
  saveMembers: (kind: OrgKind, id: number, userIds: number[]) =>
    request<void>(`${base}/${kind}/${id}/members`, { method: 'PUT', body: { userIds } }),
};
