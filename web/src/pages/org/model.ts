import type { Department, OrgUser } from './types';

/** Apply changes from the current page only; selections on other pages remain intact. */
export function updateMemberSelection(
  previous: number[],
  changed: number[],
  checked: boolean,
): number[] {
  const next = new Set(previous);
  changed.forEach((id) => (checked ? next.add(id) : next.delete(id)));
  return [...next].sort((a, b) => a - b);
}
export function sameMembers(left: number[], right: number[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id));
}
export function canChooseMember(user: OrgUser, selectedIds: number[]): boolean {
  return user.enable === 1 || selectedIds.includes(user.id);
}
export interface DepartmentOption {
  value: number;
  title: string;
  children?: DepartmentOption[];
}
export function departmentParentOptions(tree: Department[], editedId?: number): DepartmentOption[] {
  return tree
    .filter((item) => item.id !== editedId)
    .map((item) => ({
      value: item.id,
      title: `${item.name}${item.status ? '' : '（disabled）'}`,
      children: departmentParentOptions(item.children ?? [], editedId),
    }));
}
export function flattenDepartments(tree: Department[]): Department[] {
  return tree.flatMap((item) => [item, ...flattenDepartments(item.children ?? [])]);
}
export function filterDepartments(tree: Department[], keyword: string): Department[] {
  const term = keyword.trim().toLocaleLowerCase();
  if (!term) return tree;
  return tree.flatMap((item) => {
    const children = filterDepartments(item.children ?? [], term);
    return item.name.toLocaleLowerCase().includes(term) || children.length
      ? [{ ...item, children }]
      : [];
  });
}
