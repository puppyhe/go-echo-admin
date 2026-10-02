import type { AssigneeSpec } from './types';

type Assignment = { assignee?: AssigneeSpec; approverIds?: number[]; name?: string };
const checkedIDs = (ids: number[], label: string) => {
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
    throw new Error(`${label} contains an invalid user ID`);
  if (ids.length > 100) throw new Error(`${label} cannot contain more than 100 IDs`);
  return [...new Set(ids)];
};
export function prepareAssignee(value: Assignment): {
  approverIds: number[];
  assignee?: AssigneeSpec;
} {
  const label = value.name ? `Approvers for “${value.name}”` : 'Approvers';
  if (!value.assignee) {
    const ids = checkedIDs(value.approverIds ?? [], label);
    if (!ids.length) throw new Error('Select at least one approver');
    return { approverIds: ids };
  }
  if (value.approverIds?.length) throw new Error(`${label} cannot combine direct users with an assignment rule`);
  const ids = checkedIDs(value.assignee.ids ?? [], label);
  if (!value.assignee.kind || (['users', 'role'].includes(value.assignee.kind) && !ids.length))
    throw new Error(`Configure an assignment rule for ${label.toLowerCase()}`);
  return {
    approverIds: [],
    assignee: {
      ...structuredClone(value.assignee),
      ...(ids.length ? { ids } : { ids: undefined }),
    },
  };
}
export function assigneeLabel(value: Assignment): string {
  if (!value.assignee || value.assignee.kind === 'users')
    return `${value.assignee?.ids?.length ?? value.approverIds?.length ?? 0} users`;
  if (value.assignee.kind === 'role') return `${value.assignee.ids?.length ?? 0} roles`;
  if (value.assignee.kind === 'department_leader')
    return value.assignee.ids?.length ? 'Selected department leaders' : 'Requester department leader';
  return `Assignment rule: ${value.assignee.kind}`;
}
