import type { UserMemberships, MembershipOrganization, MembershipInput } from './api';
import type { Department } from '../../org/types';
export type MembershipReadState = 'ready' | 'forbidden' | 'error';
export interface MembershipResult {
  organization?: UserMemberships;
  organizationState: MembershipReadState;
}
export function membershipFailureState(error: unknown): MembershipReadState {
  const message = error instanceof Error ? error.message : '';
  return /permission|label/.test(message) ? 'forbidden' : 'error';
}
export function attachMemberships<T extends { ID: number }>(
  rows: T[],
  memberships: UserMemberships[],
  failure?: MembershipReadState,
): (T & MembershipResult)[] {
  const index = new Map(memberships.map((item) => [item.userId, item]));
  return rows.map((row) => {
    const organization = index.get(row.ID);
    return {
      ...row,
      organization,
      organizationState: failure ?? (organization ? 'ready' : 'error'),
    };
  });
}
export function membershipInput(departmentIds: number[], positionIds: number[]): MembershipInput {
  return {
    departmentIds: [...new Set(departmentIds)].sort((a, b) => a - b),
    positionIds: [...new Set(positionIds)].sort((a, b) => a - b),
  };
}
export function canAssignOrganization(
  item: MembershipOrganization,
  currentIds: number[],
  userEnabled: boolean,
): boolean {
  return currentIds.includes(item.id) || (userEnabled && item.status);
}
export interface MembershipTreeOption {
  title: string;
  value: number;
  disabled: boolean;
  children: MembershipTreeOption[];
}
export function membershipDepartmentTree(
  items: Department[],
  currentIds: number[],
  userEnabled: boolean,
): MembershipTreeOption[] {
  return items.map((item) => ({
    title: `${item.name}${item.status ? '' : '（disabled）'}`,
    value: item.id,
    disabled: !canAssignOrganization(item, currentIds, userEnabled),
    children: membershipDepartmentTree(item.children ?? [], currentIds, userEnabled),
  }));
}
