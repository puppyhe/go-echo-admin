// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Drawer,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { sysApiApi } from '../../api/endpoints';
import type { SysApi } from '../../domain/api';

interface Props {
  open: boolean;
  groups: string[];
  onClose: () => void;
  onSuccess: () => void;
}
interface ApiDiff {
  newApis: SysApi[];
  deleteApis: SysApi[];
  ignoreApis: SysApi[];
}
const apiKey = (api: SysApi) => `${api.method}:${api.path}`;

export default function ApiSyncDrawer({ open, groups, onClose, onSuccess }: Props) {
  const { message } = App.useApp();
  const [diff, setDiff] = useState<ApiDiff>({ newApis: [], deleteApis: [], ignoreApis: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setReady(false);
    try {
      const data = await sysApiApi.syncApi();
      setDiff({
        newApis: data.newApis ?? [],
        deleteApis: data.deleteApis ?? [],
        ignoreApis: data.ignoreApis ?? [],
      });
      setReady(true);
    } catch {
      // Internal implementation detail.
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const changeNew = (row: SysApi, field: 'apiGroup' | 'description', value: string) => {
    setDiff((current) => ({
      ...current,
      newApis: current.newApis.map((api) =>
        apiKey(api) === apiKey(row) ? { ...api, [field]: value } : api,
      ),
    }));
  };
  const ignore = async (row: SysApi, flag: boolean) => {
    setSaving(true);
    try {
      await sysApiApi.ignoreApi({ path: row.path, method: row.method, flag });
      message.success(flag ? '已忽略该路由' : '已取消忽略');
      // Keep unsaved metadata for all other new routes.
      const next = await sysApiApi.syncApi();
      setDiff((current) => ({
        newApis: (next.newApis ?? []).map(
          (api) => current.newApis.find((existing) => apiKey(existing) === apiKey(api)) ?? api,
        ),
        deleteApis: next.deleteApis ?? [],
        ignoreApis: next.ignoreApis ?? [],
      }));
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };
  const addOne = async (row: SysApi) => {
    if (!row.apiGroup?.trim() || !row.description?.trim()) {
      message.warning('请输入 API 分组信息');
      return;
    }
    setSaving(true);
    try {
      await sysApiApi.createApi({
        ...row,
        apiGroup: row.apiGroup.trim(),
        description: row.description.trim(),
      });
      setDiff((current) => ({
        ...current,
        newApis: current.newApis.filter((api) => apiKey(api) !== apiKey(row)),
      }));
      message.success('创建成功');
      onSuccess();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    const newApis = diff.newApis
      .filter((api) => api.apiGroup?.trim())
      .map((api) => ({ ...api, apiGroup: api.apiGroup.trim() }));
    if (!newApis.length && !diff.deleteApis.length) {
      message.info('请先填写待同步路由的 API 分组和描述');
      return;
    }
    setSaving(true);
    try {
      await sysApiApi.enterSyncApi({ newApis, deleteApis: diff.deleteApis });
      message.success('操作成功');
      onSuccess();
      await load();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };
  const columns: TableColumnsType<SysApi> = [
    { title: 'API 路径', dataIndex: 'path', width: 230 },
    { title: 'API 分组', dataIndex: 'apiGroup', width: 160 },
    { title: 'API 描述', dataIndex: 'description', width: 180 },
    { title: '请求方法', dataIndex: 'method', width: 100, render: (method) => <Tag>{method}</Tag> },
  ];
  const newColumns: TableColumnsType<SysApi> = columns.map((column) => {
    if ('dataIndex' in column && column.dataIndex === 'apiGroup')
      return {
        ...column,
        render: (_: unknown, row: SysApi) => (
          <AutoComplete
            style={{ width: '100%' }}
            value={row.apiGroup}
            options={groups.map((value) => ({ value }))}
            onChange={(value) => changeNew(row, 'apiGroup', value)}
            placeholder="选择或输入分组"
          />
        ),
      };
    if ('dataIndex' in column && column.dataIndex === 'description')
      return {
        ...column,
        render: (_: unknown, row: SysApi) => (
          <Input
            value={row.description}
            onChange={(event) => changeNew(row, 'description', event.target.value)}
            placeholder="请输入 API 描述"
          />
        ),
      };
    return column;
  });
  newColumns.push({
    title: '操作',
    width: 165,
    render: (_: unknown, row: SysApi) => (
      <Space>
        <Button type="link" size="small" disabled={saving} onClick={() => void addOne(row)}>
          新增
        </Button>
        <Button type="link" size="small" disabled={saving} onClick={() => void ignore(row, true)}>
          忽略
        </Button>
      </Space>
    ),
  });

  return (
    <Drawer
      title="路由同步"
      getContainer={() => document.body}
      width="min(1120px, 94vw)"
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={saving}
            disabled={!ready || loading}
            onClick={() => void save()}
          >
            保存同步结果
          </Button>
        </Space>
      }
    >
      <Alert
        type="warning"
        showIcon
        message="扫描当前后端路由，补充 API 分组和描述后即可写入 API 资源表。"
        style={{ marginBottom: 24 }}
      />
      <Typography.Title level={5}>待新增路由（{diff.newApis.length}）</Typography.Title>
      <Table
        rowKey={apiKey}
        size="small"
        loading={loading}
        columns={newColumns}
        dataSource={diff.newApis}
        pagination={false}
        scroll={{ x: 835 }}
      />
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        待删除路由（{diff.deleteApis.length}）
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        后端已不再提供的路由会出现在这里，确认后可以从 API 资源表删除。
      </Typography.Paragraph>
      <Table
        rowKey={apiKey}
        size="small"
        loading={loading}
        columns={columns}
        dataSource={diff.deleteApis}
        pagination={false}
        scroll={{ x: 670 }}
      />
      <Typography.Title level={5} style={{ marginTop: 24 }}>
        已忽略路由（{diff.ignoreApis.length}）
      </Typography.Title>
      <Table
        rowKey={apiKey}
        size="small"
        loading={loading}
        columns={[
          ...columns,
          {
            title: '操作',
            width: 110,
            render: (_: unknown, row: SysApi) => (
              <Button type="link" disabled={saving} onClick={() => void ignore(row, false)}>
                取消忽略
              </Button>
            ),
          },
        ]}
        dataSource={diff.ignoreApis}
        pagination={false}
        scroll={{ x: 780 }}
      />
    </Drawer>
  );
}
