import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Input, Select, Space, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { session } from '../../../api/request';
import { collabApi } from './api';
import { statusColors, statusLabels } from './model';
import type { ListQuery, Page, RequestScope, RoleChoice } from './types';

export const canManage = (ownerId: number) => {
  const user = session.getSnapshot();
  return user?.ID === ownerId || user?.authorityId === 888;
};
export const formatTime = (time?: string) =>
  time ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '—';
export function StatusTag({ status }: { status: string }) {
  return <Tag color={statusColors[status]}>{statusLabels[status] ?? status}</Tag>;
}

export function usePagedList<T>(
  loader: (query: ListQuery) => Promise<Page<T>>,
  scope?: RequestScope,
) {
  const [query, setQuery] = useState<ListQuery & { page: number; pageSize: number }>({
    page: 1,
    pageSize: 10,
    keyword: '',
  });
  const [result, setResult] = useState<Page<T>>({ list: [], total: 0, page: 1, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  const reload = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const result = await loader({ ...query, scope });
      if (current === serial.current) {
        const lastPage = Math.max(1, Math.ceil(result.total / query.pageSize));
        if (query.page > lastPage) setQuery((previous) => ({ ...previous, page: lastPage }));
        else setResult({ ...result, list: result.list ?? [] });
      }
    } catch (error) {
      if (current === serial.current) {
        setResult({ list: [], total: 0, page: query.page, pageSize: query.pageSize });
        setError(error instanceof Error ? error.message : '加载失败');
      }
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [loader, query, scope]);
  useEffect(() => {
    void reload();
    return () => {
      serial.current++;
    };
  }, [reload]);
  return {
    result,
    loading,
    error,
    reload,
    query,
    filter: (filters: Omit<ListQuery, 'page' | 'pageSize' | 'scope'>) =>
      setQuery((previous) => ({ page: 1, pageSize: previous.pageSize, ...filters })),
    search: (keyword: string) => setQuery((previous) => ({ ...previous, page: 1, keyword })),
    pagination: {
      current: query.page,
      pageSize: query.pageSize,
      total: result.total,
      showSizeChanger: true,
      showTotal: (total: number) => `共 ${total} 条`,
      onChange: (page: number, pageSize: number) =>
        setQuery((previous) => ({ ...previous, page, pageSize })),
    },
  };
}
export function ListToolbar({
  search,
  reload,
  children,
}: {
  search: (value: string) => void;
  reload: () => unknown;
  children?: React.ReactNode;
}) {
  return (
    <div className="collab-toolbar">
      <Input.Search
        allowClear
        placeholder="名称/标题搜索"
        onSearch={search}
        style={{ width: 280, maxWidth: '100%' }}
      />
      <Space wrap>
        <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
          刷新
        </Button>
        {children}
      </Space>
    </div>
  );
}
export function LoadError({ error, retry }: { error: string; retry: () => unknown }) {
  return error ? (
    <Alert
      type="error"
      showIcon
      message="加载失败"
      description={error}
      action={<Button onClick={() => void retry()}>重试</Button>}
      style={{ marginBottom: 16 }}
    />
  ) : null;
}

export function SharedRoles({
  value = [],
  onChange,
}: {
  value?: number[];
  onChange?: (ids: number[]) => void;
}) {
  const [roles, setRoles] = useState<RoleChoice[]>([]);
  const [failed, setFailed] = useState(false);
  const { message } = App.useApp();
  useEffect(() => {
    let live = true;
    void collabApi
      .roles()
      .then((roles) => {
        if (live) setRoles(roles);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <Select
        mode="tags"
        value={value.map(String)}
        options={roles.map((role) => ({ ...role, value: String(role.value) }))}
        optionFilterProp="label="
        placeholder="选择角色，输入角色 ID"
        tokenSeparators={[',']}
        onChange={(values) => {
          if (
            values.some(
              (value) => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)),
            )
          ) {
            message.warning('角色 ID 格式不正确');
            return;
          }
          onChange?.([...new Set(values.map(Number))]);
        }}
      />
      {failed && (
        <div className="collab-muted">获取角色列表失败，请输入有效的角色 ID。</div>
      )}
    </>
  );
}
