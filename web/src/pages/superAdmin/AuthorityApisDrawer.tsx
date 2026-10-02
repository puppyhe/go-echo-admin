import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Role API assignment groups endpoints and submits selected permission leaves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Drawer, Input, Spin, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { ExpandOutlined, NodeCollapseOutlined, ReloadOutlined } from '@ant-design/icons';
import { sysApiApi } from '../../api/endpoints';
import { authorityService } from '../../services/authorityService';
import type { CasbinInfo, SysApi } from '../../domain/api';
import type { SysAuthority } from '../../domain/authority';

export interface AuthorityApisDrawerProps {
  open: boolean;
  authority: SysAuthority | null;
  onClose: () => void;
  embedded?: boolean;
}

// Internal implementation detail.
interface ApiRow {
  key: string;
  description: string;
  path?: string;
  method?: string;
  children?: ApiRow[];
}

// Internal implementation detail.
function apiLeafKey(api: { path: string; method: string }): string {
  return `p:${api.path}m:${api.method}`;
}

export default function AuthorityApisDrawer({
  open,
  authority,
  onClose,
  embedded = false,
}: AuthorityApisDrawerProps) {
  const { message } = App.useApp();
  const canWrite = useSuperAdmin();
  const authorityId = authority?.authorityId ?? 0;

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apis, setApis] = useState<SysApi[]>([]);
  // Internal implementation detail.
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [pathFilter, setPathFilter] = useState('');

  // Internal implementation detail.
  const seqRef = useRef(0);

  const load = useCallback(() => {
    if (!authorityId) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setReady(false);
    setNameFilter('');
    setPathFilter('');
    void Promise.all([sysApiApi.getAllApis(), authorityService.getApiPaths(authorityId)])
      .then(([allApis, policy]) => {
        if (seq !== seqRef.current) return;
        const list = allApis.apis ?? [];
        setApis(list);
        setReady(true);
        // Internal implementation detail.
        setSelectedKeys((policy.paths ?? []).map((item) => apiLeafKey(item)));
        // Internal implementation detail.
        setExpandedKeys([...new Set(list.map((item) => `g:${item.apiGroup}`))]);
      })
      .catch(() => undefined)
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
  }, [authorityId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Internal implementation detail.
  const rows = useMemo(() => {
    const name = nameFilter.trim();
    const path = pathFilter.trim();
    const filtered = apis.filter(
      (api) =>
        (!name || (api.description ?? '').includes(name)) &&
        (!path || (api.path ?? '').includes(path)),
    );
    const groupMap = new Map<string, SysApi[]>();
    filtered.forEach((api) => {
      const bucket = groupMap.get(api.apiGroup);
      if (bucket) bucket.push(api);
      else groupMap.set(api.apiGroup, [api]);
    });
    return [...groupMap.entries()].map(([group, list]) => ({
      key: `g:${group}`,
      description: `${group}组`,
      children: list.map((api) => ({
        key: apiLeafKey(api),
        description: api.description,
        path: api.path,
        method: api.method,
      })),
    }));
  }, [apis, nameFilter, pathFilter]);

  // Internal implementation detail.
  const leafApiMap = useMemo(() => new Map(apis.map((api) => [apiLeafKey(api), api])), [apis]);

  // Internal implementation detail.
  const leafKeys = useMemo(
    () => selectedKeys.filter((key) => leafApiMap.has(key)),
    [selectedKeys, leafApiMap],
  );

  // Internal implementation detail.
  const displayKeys = useMemo(() => {
    const leafSet = new Set(leafKeys);
    const fullGroups = rows
      .filter(
        (row) =>
          (row.children?.length ?? 0) > 0 && row.children!.every((child) => leafSet.has(child.key)),
      )
      .map((row) => row.key);
    return [...leafKeys, ...fullGroups];
  }, [leafKeys, rows]);

  const groupKeys = useMemo(() => rows.map((row) => row.key), [rows]);

  // Internal implementation detail.
  const save = async () => {
    if (!canWrite) return;
    if (!authorityId) return;
    setSaving(true);
    try {
      const casbinInfos: CasbinInfo[] = [];
      leafKeys.forEach((key) => {
        const api = leafApiMap.get(key);
        if (api) casbinInfos.push({ path: api.path, method: api.method });
      });
      await authorityService.setApiPaths(authorityId, casbinInfos);
      message.success('API 权限保存成功');
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<ApiRow> = [
    { title: '请求方法', dataIndex: 'method', width: 90 },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: 'path',
      dataIndex: 'path',
      key: 'path',
      render: (value: string | undefined) =>
        value ? (
          <Typography.Text style={{ maxWidth: 320 }} ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
  ];

  const content = (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input
          allowClear
          placeholder="搜索 API 描述"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <Input
          allowClear
          placeholder="搜索 API 路径"
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
        />
        <Button
          type="primary"
          loading={saving}
          disabled={!canWrite || !ready || loading}
          onClick={() => void save()}
        >
          保存权限
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
        <Button icon={<ExpandOutlined />} onClick={() => setExpandedKeys(groupKeys)}>
          展开全部
        </Button>
        <Button icon={<NodeCollapseOutlined />} onClick={() => setExpandedKeys([])}>
          收起全部
        </Button>
      </div>
      <Spin spinning={loading}>
        <Table<ApiRow>
          size="small"
          rowKey="key"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ y: 'calc(100vh - 320px)' }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys([...keys] as string[]),
          }}
          rowSelection={{
            checkStrictly: false,
            selectedRowKeys: displayKeys,
            preserveSelectedRowKeys: true,
            onChange: (keys) => {
              // Filtering only changes visible permissions; preserve selected hidden routes.
              const visible = new Set(
                rows.flatMap((row) => (row.children ?? []).map((child) => child.key)),
              );
              setSelectedKeys((previous) => [
                ...new Set([
                  ...previous.filter((key) => leafApiMap.has(key) && !visible.has(key)),
                  ...keys.map(String),
                ]),
              ]);
            },
          }}
        />
      </Spin>
    </>
  );
  return embedded ? (
    content
  ) : (
    <Drawer
      title={`API 权限 - ${authority?.authorityName ?? ''}`}
      width={720}
      open={open}
      onClose={onClose}
      destroyOnHidden
      getContainer={() => document.body}
    >
      {content}
    </Drawer>
  );
}
