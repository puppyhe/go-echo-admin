// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// API registry management with filtering, permissions, sync and workbook import/export.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Drawer, Form, Input, Popconfirm, Select, Space } from 'antd';
import { CloudSyncOutlined, PlusOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import CrudPage from '../../features/crud/CrudPage';
import { f, type CrudField, type CrudOption } from '../../features/crud/fieldRenderers';
import { sysApiApi } from '../../api/endpoints';
import type { SysApi, SysApiPayload } from '../../domain/api';
import type { PageInfo } from '../../types';
import RoleAssignmentDrawer from './RoleAssignmentDrawer';
import ApiSyncDrawer from './ApiSyncDrawer';
import ApiExcelToolbar from './ApiExcelToolbar';

// Internal implementation detail.
const METHOD_OPTIONS: CrudOption[] = [
  { label: '新增（POST）', value: 'POST', color: 'success' },
  { label: '查询（GET）', value: 'GET', color: 'processing' },
  { label: '更新（PUT）', value: 'PUT', color: 'warning' },
  { label: '删除（DELETE）', value: 'DELETE', color: 'error' },
];

// Internal implementation detail.
function toApiPayload(values: Record<string, unknown>): SysApiPayload {
  return {
    path: String(values.path ?? ''),
    apiGroup: String(values.apiGroup ?? ''),
    method: String(values.method ?? ''),
    description: String(values.description ?? ''),
    ...(typeof values.ID === 'number' ? { ID: values.ID } : {}),
  };
}

export default function ApiPage() {
  const { message } = App.useApp();
  // Internal implementation detail.
  const [listToken, setListToken] = useState(0);
  const [syncOpen, setSyncOpen] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [form] = Form.useForm<SysApiPayload>();
  const [editing, setEditing] = useState<SysApi | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState<SysApi | null>(null);
  const loadRoles = useCallback(
    () =>
      assigning ? sysApiApi.getApiRoles(assigning.path, assigning.method) : Promise.resolve([]),
    [assigning],
  );
  const saveRoles = useCallback(
    (authorityIds: number[]) =>
      assigning
        ? sysApiApi.setApiRoles({ path: assigning.path, method: assigning.method, authorityIds })
        : Promise.resolve(),
    [assigning],
  );
  const reload = useCallback(() => setListToken((token) => token + 1), []);
  const [freshing, setFreshing] = useState(false);

  // Internal implementation detail.
  const loadApiGroups = useCallback(async (): Promise<CrudOption[]> => {
    try {
      const res = await sysApiApi.getApiGroups();
      const groups = Array.isArray(res?.groups) ? res.groups : [];
      setGroups(groups);
      return groups.map((group) => ({ label: group, value: group }));
    } catch {
      return [];
    }
  }, []);

  // Internal implementation detail.
  const fields = useMemo<CrudField[]>(
    () => [
      f('ID', 'ID', { inForm: false, inTable: { width: 70 } }),
      f('path', 'API 路径', {
        required: true,
        inFilter: true,
        placeholder: '请输入 API 路径',
        inTable: { width: 260 },
      }),
      f('apiGroup', 'API 分组', {
        required: true,
        inFilter: true,
        type: 'select',
        options: groups.map((value) => ({ label: value, value })),
      }),
      f('method', '请求方法', {
        required: true,
        inFilter: true,
        type: 'select',
        options: METHOD_OPTIONS,
        inTable: { width: 130, align: 'center' },
      }),
      f('description', 'API 描述', { required: true, inFilter: true, inTable: { width: 300 } }),
    ],
    [groups],
  );

  const list = useCallback(
    async (page: PageInfo) => {
      void listToken; // documentation listToken：documentation
      return sysApiApi.getApiList(page);
    },
    [listToken],
  );

  // Internal implementation detail.
  const remove = useCallback(
    (row: SysApi) =>
      sysApiApi.deleteApi({
        ID: row.ID,
        path: row.path,
        description: row.description,
        apiGroup: row.apiGroup,
        method: row.method,
      }),
    [],
  );
  const removeBatch = useCallback((ids: number[]) => sysApiApi.deleteApisByIds({ ids }), []);

  useEffect(() => {
    void loadApiGroups();
  }, [loadApiGroups, listToken]);
  const openForm = (row: SysApi | null) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(row ?? { path: '', apiGroup: '', method: 'POST', description: '' });
    setFormOpen(true);
  };
  const save = async () => {
    let values: SysApiPayload;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const payload = toApiPayload({ ...values, ...(editing ? { ID: editing.ID } : {}) });
      if (editing) await sysApiApi.updateApi(payload);
      else await sysApiApi.createApi(payload);
      message.success(editing ? 'editsuccess' : 'createsuccess');
      setFormOpen(false);
      reload();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };

  // Internal implementation detail.
  const onFresh = async () => {
    setFreshing(true);
    try {
      await sysApiApi.freshCasbin();
      message.success('刷新成功');
    } catch {
      // Internal implementation detail.
    } finally {
      setFreshing(false);
    }
  };

  return (
    <>
      <CrudPage<SysApi>
        fields={fields}
        list={list}
        remove={remove}
        removeBatch={removeBatch}
        rowActions={(row) => (
          <>
            <Button type="link" size="small" onClick={() => openForm(row)}>
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              icon={<TeamOutlined />}
              onClick={() => setAssigning(row)}
            >
              角色授权
            </Button>
          </>
        )}
        extraToolbar={
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>
              新建 API
            </Button>
            <Button icon={<CloudSyncOutlined />} onClick={() => setSyncOpen(true)}>
              同步 API
            </Button>
            <Popconfirm title="确认刷新授权策略吗？" onConfirm={() => void onFresh()}>
              <Button icon={<ReloadOutlined />} loading={freshing}>
                刷新授权
              </Button>
            </Popconfirm>
            <ApiExcelToolbar onImported={reload} />
          </>
        }
      />
      <Drawer
        title={editing ? '编辑 API' : '新建 API'}
        getContainer={() => document.body}
        width={560}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="path"
            label="API 路径"
            rules={[
              { required: true, whitespace: true, message: '请输入 API 路径' },
              { pattern: /^\//, message: 'API 路径必须以 / 开头' },
            ]}
          >
            <Input placeholder="请输入 API 路径" maxLength={255} />
          </Form.Item>
          <Form.Item
            name="apiGroup"
            label="API 分组"
            rules={[{ required: true, whitespace: true, message: '请输入 API 分组' }]}
          >
            <AutoComplete
              options={groups.map((value) => ({ value }))}
              placeholder="选择或输入分组"
              filterOption={(input, option) =>
                String(option?.value).toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item
            name="method"
            label="请求方法"
            rules={[{ required: true, message: '请选择请求方法' }]}
          >
            <Select options={METHOD_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="description"
            label="API 描述"
            rules={[{ required: true, whitespace: true, message: '请输入 API 描述' }]}
          >
            <Input.TextArea rows={3} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </Drawer>
      <RoleAssignmentDrawer
        title={`角色授权 · ${assigning?.method ?? ''} ${assigning?.path ?? ''}`}
        open={Boolean(assigning)}
        loadSelected={loadRoles}
        saveSelected={saveRoles}
        onClose={() => setAssigning(null)}
      />
      <ApiSyncDrawer
        open={syncOpen}
        groups={groups}
        onClose={() => setSyncOpen(false)}
        onSuccess={reload}
      />
    </>
  );
}
