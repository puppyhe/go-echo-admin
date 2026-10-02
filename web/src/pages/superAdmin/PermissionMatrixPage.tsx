import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Checkbox, Empty, Select, Space, Spin, Table, Tabs, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { request } from '../../api/request';
import { authorityService } from '../../services/authorityService';
import type { SysAuthority } from '../../domain/authority';

type CatalogRow = { id: number; name?: string; path?: string; permission?: string; method?: string; group?: string; granted?: boolean };
type ActionRow = { resource: string; action: string; effect?: boolean; key?: string };
type Matrix = { menus: CatalogRow[]; apis: CatalogRow[]; actions: ActionRow[] };

function flatten(items: SysAuthority[]): SysAuthority[] {
  const result: SysAuthority[] = [];
  const walk = (rows: SysAuthority[]) => rows.forEach((row) => { result.push(row); if (row.children?.length) walk(row.children); });
  walk(items);
  return result;
}

export default function PermissionMatrixPage() {
  const { message } = App.useApp();
  const [roles, setRoles] = useState<SysAuthority[]>([]);
  const [roleId, setRoleId] = useState<number>();
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [deniedActions, setDeniedActions] = useState<string[]>([]);
  const [menuIds, setMenuIds] = useState<number[]>([]);
  const [apiIds, setApiIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRoles = useCallback(async () => {
    const rows = flatten(await authorityService.listAll());
    setRoles(rows);
    setRoleId((current) => current ?? rows[0]?.authorityId);
  }, []);
  useEffect(() => { void loadRoles(); }, [loadRoles]);

  const loadMatrix = useCallback(async () => {
    if (!roleId) return;
    setLoading(true);
    try {
      const value = await request<Matrix>(`/enterprise/permissions/matrix/${roleId}`);
      setMatrix(value);
      setMenuIds((value.menus ?? []).filter((item) => item.granted).map((item) => Number(item.id)));
      setApiIds((value.apis ?? []).filter((item) => item.granted).map((item) => Number(item.id)));
      setActions((value.actions ?? []).filter((item) => item.effect !== false).map((item) => `${item.resource}:${item.action}`));
      setDeniedActions((value.actions ?? []).filter((item) => item.effect === false).map((item) => `${item.resource}:${item.action}`));
    } catch {
      setMatrix(null);
    } finally { setLoading(false); }
  }, [roleId]);
  useEffect(() => { void loadMatrix(); }, [loadMatrix]);

  const actionOptions = useMemo(() => {
    const defaults = ['user:list', 'user:create', 'user:update', 'user:delete', 'role:list', 'role:update', 'menu:list', 'menu:update', 'department:list', 'department:update', 'position:list', 'position:update', 'audit:list', 'file:list', 'file:create', 'file:update', 'file:delete', 'health:view', 'codegen:list', 'codegen:create'];
    const granted = (matrix?.actions ?? []).map((item) => `${item.resource}:${item.action}`);
    return [...new Set([...defaults, ...granted])].sort();
  }, [matrix]);

  const selectedRole = roles.find((role) => role.authorityId === roleId);
  const canEditSelectedRole = selectedRole?.code !== 'platform_admin' && selectedRole?.code !== 'tenant_admin';

  const save = async () => {
    if (!roleId) return;
    setSaving(true);
    try {
      await request(`/enterprise/permissions/matrix/${roleId}`, { method: 'PUT', body: { menuIds, apiResourceIds: apiIds, actions: [...actions.map((value) => { const [resource, action] = value.split(':'); return { resource, action, effect: true }; }), ...deniedActions.map((value) => { const [resource, action] = value.split(':'); return { resource, action, effect: false }; })] } });
      message.success('权限矩阵保存成功');
      await loadMatrix();
    } catch { /* request 已提示错误 */ } finally { setSaving(false); }
  };

  const menuColumns: TableColumnsType<CatalogRow> = [{ title: '菜单', dataIndex: 'name' }, { title: '路径', dataIndex: 'path' }, { title: '权限标识', dataIndex: 'permission', render: (value) => value ? <Tag>{value}</Tag> : '-' }];
  const apiColumns: TableColumnsType<CatalogRow> = [{ title: '方法', dataIndex: 'method', width: 100 }, { title: '路径', dataIndex: 'path' }, { title: '分组', dataIndex: 'group' }, { title: '权限标识', dataIndex: 'permission' }];
  return <Card title="权限矩阵" extra={<Space><Select style={{ minWidth: 220 }} value={roleId} onChange={setRoleId} options={roles.map((role) => ({ value: role.authorityId, label: role.authorityName }))} placeholder="选择角色" /><Button icon={<ReloadOutlined />} onClick={() => void loadMatrix()} loading={loading}>刷新</Button><Button type="primary" icon={<SaveOutlined />} onClick={() => void save()} loading={saving} disabled={!roleId || !canEditSelectedRole} title={canEditSelectedRole ? undefined : '内置角色权限由系统维护'}>保存</Button></Space>}>
    <Spin spinning={loading}>
      {!matrix ? <Empty description="请选择角色" /> : <Tabs items={[
        { key: 'menus', label: `菜单（${menuIds.length}）`, children: <Table rowKey="id" size="small" pagination={{ pageSize: 10 }} rowSelection={{ selectedRowKeys: menuIds, onChange: (keys) => setMenuIds(keys.map(Number)) }} columns={menuColumns} dataSource={matrix.menus ?? []} /> },
        { key: 'apis', label: `接口（${apiIds.length}）`, children: <Table rowKey="id" size="small" pagination={{ pageSize: 10 }} rowSelection={{ selectedRowKeys: apiIds, onChange: (keys) => setApiIds(keys.map(Number)) }} columns={apiColumns} dataSource={matrix.apis ?? []} /> },
        { key: 'actions', label: `动作（${actions.length}）`, children: <Space direction="vertical" style={{ width: '100%' }}><div><Tag color="success">允许</Tag><Checkbox.Group value={actions} onChange={(values) => setActions(values.map(String))} options={actionOptions.map((value) => ({ value, label: value }))} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }} /></div><div><Tag color="error">拒绝</Tag><Checkbox.Group value={deniedActions} onChange={(values) => setDeniedActions(values.map(String))} options={actionOptions.map((value) => ({ value, label: value }))} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }} /></div></Space> },
      ]} />}
    </Spin>
  </Card>;
}
