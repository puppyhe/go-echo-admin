export type ScopeMode = 'all' | 'department' | 'departmentTree' | 'self' | 'custom';
export const scopeLabels: Record<ScopeMode, string> = {
  all: '全部数据',
  department: '本部门数据',
  departmentTree: '本部门及下属部门',
  self: '仅本人数据',
  custom: '自定义部门',
};
export interface DepartmentOption {
  id: number;
  parentId: number | null;
  name: string;
  status: boolean;
  disabled: boolean;
  children: DepartmentOption[];
}
export interface ScopeDocument {
  authorityId: number;
  mode: ScopeMode;
  departmentIds: number[];
  version: number;
  configured: boolean;
  canWrite: boolean;
  departments: DepartmentOption[];
}
export function scopePayload(doc: ScopeDocument, mode: ScopeMode, ids: number[]) {
  if (!Object.hasOwn(scopeLabels, mode)) throw Error('请选择有效的数据范围模式');
  const departmentIds = mode === 'custom' ? [...new Set(ids)] : [];
  if (mode === 'custom' && !departmentIds.length) throw Error('自定义数据范围至少选择一个部门');
  if (departmentIds.some((v) => !Number.isSafeInteger(v) || v <= 0))
    throw Error('部门编号必须为正整数');
  return { authorityId: doc.authorityId, mode, departmentIds, version: doc.version };
}
export function scopeTree(nodes: DepartmentOption[]): Array<{
  value: number;
  title: string;
  disabled: boolean;
  children: ReturnType<typeof scopeTree>;
}> {
  return nodes.map((node) => ({
    value: node.id,
    title: `${node.name}${node.disabled ? '（已禁用）' : ''}`,
    disabled: node.disabled,
    children: scopeTree(node.children ?? []),
  }));
}
