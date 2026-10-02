import { request } from '../../../api/request';
import type { Department, OrgPage, Position } from '../../org/types';
export interface MembershipOrganization {
  id: number;
  name: string;
  status: boolean;
  code?: string;
}
export interface UserMemberships {
  userId: number;
  departmentIds: number[];
  positionIds: number[];
  departmentNames: string[];
  positionNames: string[];
  departments: MembershipOrganization[];
  positions: MembershipOrganization[];
  canManage: boolean;
}
export interface MembershipInput {
  departmentIds: number[];
  positionIds: number[];
}
const base = '/enterprise/org';
export const userOrganizationApi = {
  list: (userIds: number[]) =>
    request<{ list: UserMemberships[] }>(`${base}/user-memberships`, {
      params: { userIds: userIds.join(',') },
      skipError: true,
    }),
  save: (id: number, body: MembershipInput) =>
    request<UserMemberships>(`${base}/users/${id}/memberships`, {
      method: 'PUT',
      body,
      skipError: true,
    }),
  departments: () => request<{ list: Department[] }>(`${base}/departments`, { skipError: true }),
  positions: (params: { page: number; pageSize: number; keyword?: string }) =>
    request<OrgPage<Position>>(`${base}/positions`, { params, skipError: true }),
};
