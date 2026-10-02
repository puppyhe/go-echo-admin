export interface OrgUser {
  id: number;
  username: string;
  nickName: string;
  phone: string;
  email: string;
  enable: number;
}
export interface Department {
  id: number;
  parentId: number | null;
  name: string;
  leaderId: number | null;
  leader: OrgUser | null;
  sort: number;
  status: boolean;
  children: Department[];
}
export interface Position {
  id: number;
  name: string;
  code: string;
  sort: number;
  status: boolean;
  remark: string;
}
export interface OrgPage<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type OrgKind = 'departments' | 'positions';
export interface MembersResult extends OrgPage<OrgUser> {
  userIds: number[];
}
export interface MemberTarget {
  id: number;
  name: string;
  status: boolean;
}
