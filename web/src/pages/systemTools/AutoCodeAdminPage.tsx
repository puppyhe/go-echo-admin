// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Generated-code history, metadata reuse and explicit rollback options.
import { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Modal, Popconfirm, Space, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import { EditOutlined, PlusOutlined, RollbackOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { autoCodeApi } from '../../api/endpoints';
import { useMenu } from '../../menu/MenuContext';
import { componentKey } from '../../routes/pageRegistry';
import type { MenuNode } from '../../domain/menu';
import type { SysHistory } from '../../domain/autoCode';

interface HistoryRow extends SysHistory {
  package?: string;
  flag?: number;
}

// Internal implementation detail.
interface RollbackState {
  ID: number;
  structName: string;
  deleteApi: boolean;
  deleteMenu: boolean;
  deleteTable: boolean;
}

// Internal implementation detail.
function findComponentPath(nodes: MenuNode[], key: string, parentPath = ''): string | undefined {
  for (const node of nodes) {
    if (/^https?:\/\//i.test(node.path) || node.component === '/') continue;
    // Seeded menu children may expose an absolute path (for example
    // `/dev/auto-code`) even when they are nested below a `/dev` directory.
    // Preserve that path instead of prefixing the parent a second time.
    const abs = (node.path.startsWith('/') ? node.path : `${parentPath}/${node.path}`).replace(
      /\/+/g,
      '/',
    );
    if (componentKey(node.component) === key) return abs;
    const hit = findComponentPath(node.children ?? [], key, abs);
    if (hit) return hit;
  }
  return undefined;
}

// Internal implementation detail.
function formatCreatedAt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const text = String(value);
  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : text;
}

export default function AutoCodeAdminPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { tree } = useMenu();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  const [rollback, setRollback] = useState<RollbackState | null>(null);
  const [rolling, setRolling] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    void autoCodeApi
      .getSysHistory({ page, pageSize })
      .then((res) => {
        setRows(res.list ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Internal implementation detail.
  const openRollback = (row: HistoryRow) => {
    if (row.flag === 1) return;
    setRollback({
      ID: row.ID,
      structName: row.structName,
      deleteApi: true,
      deleteMenu: true,
      deleteTable: false,
    });
  };

  // Internal implementation detail.
  const onRollback = async () => {
    if (!rollback) return;
    setRolling(true);
    try {
      await autoCodeApi.rollback({
        ID: rollback.ID,
        deleteApi: rollback.deleteApi,
        deleteMenu: rollback.deleteMenu,
        deleteTable: rollback.deleteTable,
      });
      message.success('回滚成功');
      setRollback(null);
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setRolling(false);
    }
  };

  // Internal implementation detail.
  const onDelete = async (row: SysHistory) => {
    try {
      await autoCodeApi.delSysHistory({ ID: row.ID });
      message.success('删除成功');
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else loadList();
    } catch {
      // Internal implementation detail.
    }
  };

  // Internal implementation detail.
  const onReuse = (row?: SysHistory) => {
    const path = findComponentPath(tree, 'systemTools/autoCode');
    if (!path) {
      message.warning('菜单页面不存在，请在菜单管理中配置');
      return;
    }
    navigate(row ? `${path}?id=${row.ID}` : path);
  };

  const columns: TableColumnsType<HistoryRow> = [
    { title: 'ID', dataIndex: 'ID', width: 70 },
    { title: '业务对象', dataIndex: 'structName', width: 160 },
    {
      title: '包名',
      key: 'packageName',
      width: 150,
      render: (_value, row) => row.packageName || row.package || '-',
    },
    { title: '表名', dataIndex: 'tableName', width: 150, render: (value) => value || '-' },
    {
      title: '状态',
      key: 'flag',
      width: 110,
      render: (_value, row) => (
        <Tag color={row.flag === 1 ? 'error' : 'success'}>
          {row.flag === 1 ? '失败' : '成功'}
        </Tag>
      ),
    },
    {
      title: '说明',
      dataIndex: 'description',
      render: (value: unknown) =>
        value === null || value === undefined || value === '' ? '-' : String(value),
    },
    {
      title: '创建时间',
      key: 'createdAt',
      width: 180,
      render: (_v, row) => formatCreatedAt(row.CreatedAt),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_v, row) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onReuse(row)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<RollbackOutlined />}
            disabled={row.flag === 1}
            onClick={() => openRollback(row)}
          >
            回滚
          </Button>
          <Popconfirm
            title="确定删除此记录吗？"
            onConfirm={() => void onDelete(row)}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card className="table-card" styles={{ body: { padding: '16px 16px 0' } }}>
        <div
          className="table-toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 0 14px',
          }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => onReuse()}>
            新增
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadList} title="刷新" />
        </div>
        <Table<HistoryRow>
          rowKey={(row) => row.ID}
          columns={columns}
          dataSource={rows}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
        />
      </Card>

      {/* 回滚确认弹窗 */}
      <Modal
        title={`回滚：${rollback?.structName ?? ''}`}
        open={rollback !== null}
        onOk={() => void onRollback()}
        onCancel={() => setRollback(null)}
        confirmLoading={rolling}
        okText="确定"
        okButtonProps={{ danger: true }}
        destroyOnHidden
        width={520}
      >
        <Space direction="vertical" size={12} style={{ marginTop: 16, width: '100%' }}>
          <div>回滚配置：</div>
          <Space size={16}>
            <Checkbox
              checked={rollback?.deleteApi ?? false}
              onChange={(e) =>
                setRollback((prev) => (prev ? { ...prev, deleteApi: e.target.checked } : prev))
              }
            >
              删除API
            </Checkbox>
            <Checkbox
              checked={rollback?.deleteMenu ?? false}
              onChange={(e) =>
                setRollback((prev) => (prev ? { ...prev, deleteMenu: e.target.checked } : prev))
              }
            >
              删除菜单
            </Checkbox>
            <Checkbox
              checked={rollback?.deleteTable ?? false}
              onChange={(e) =>
                setRollback((prev) => (prev ? { ...prev, deleteTable: e.target.checked } : prev))
              }
            >
              删除表
            </Checkbox>
          </Space>
          {rollback?.deleteTable && (
            <Alert
              type="error"
              showIcon
              message="注意：此操作将删除数据表及相关数据，不可恢复！"
            />
          )}
        </Space>
      </Modal>
    </div>
  );
}
