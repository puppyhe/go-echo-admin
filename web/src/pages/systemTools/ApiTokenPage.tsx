import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// User API token issuance, expiration and revocation. Secrets display only on creation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { CopyOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { sysApiTokenApi, userApi } from '../../api/endpoints';
import { authorityService } from '../../services/authorityService';
import type { SysApiToken } from '../../domain/systemTools';
import type { SysAuthority } from '../../domain/authority';
import type { SysUser } from '../../domain/user';

// Internal implementation detail.
interface IssueFormValues {
  userId: number;
  authorityId: number;
  days: number;
  remark?: string;
}

// Internal implementation detail.
function statusTag(value: unknown): ReactNode {
  if (value === true || value === 1 || value === '1' || value === 'true')
    return <Tag color="success">启用</Tag>;
  if (
    value === false ||
    value === 0 ||
    value === 2 ||
    value === '0' ||
    value === '2' ||
    value === 'false'
  )
    return <Tag color="error">已失效</Tag>;
  if (value === 'pending' || value === 'active') return <Tag color="success">启用</Tag>;
  if (value === 'expired' || value === 'revoked' || value === 'invalid') return <Tag color="error">已失效</Tag>;
  if (value === null || value === undefined || value === '') return '-';
  return <Tag>{String(value)}</Tag>;
}

// Internal implementation detail.
function formatExpires(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    return dayjs(ms).format('YYYY-MM-DD HH:mm:ss');
  }
  const text = String(value);
  if (/^\d+$/.test(text)) return formatExpires(Number(text));
  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : text;
}

// Internal implementation detail.
async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Internal implementation detail.
  }
  try {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    return true;
  } catch {
    return false;
  }
}

export default function ApiTokenPage() {
  const { message } = App.useApp();
  const canManage = useSuperAdmin();
  const [form] = Form.useForm<IssueFormValues>();

  const [rows, setRows] = useState<SysApiToken[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [users, setUsers] = useState<SysUser[]>([]);
  const [authorities, setAuthorities] = useState<SysAuthority[]>([]);
  // Internal implementation detail.
  const [tokenResult, setTokenResult] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const [invalidating, setInvalidating] = useState(false);

  const loadList = useCallback(() => {
    if (!canManage) return;
    setLoading(true);
    void sysApiTokenApi
      .getApiTokenList({ page, pageSize })
      .then((res) => {
        setRows(res.list ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [page, pageSize, canManage]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Internal implementation detail.
  const openIssue = async () => {
    form.resetFields();
    form.setFieldsValue({ days: 30 });
    setIssueOpen(true);
    try {
      if (users.length === 0) {
        const res = await userApi.getUserList({ page: 1, pageSize: 999 });
        setUsers(res.list ?? []);
      }
      if (authorities.length === 0) setAuthorities(await authorityService.listAll());
    } catch {
      // Internal implementation detail.
    }
  };

  // Internal implementation detail.
  const onIssue = async () => {
    const values = await form.validateFields();
    setIssuing(true);
    try {
      const res = await sysApiTokenApi.createApiToken({
        userId: values.userId,
        authorityId: values.authorityId,
        days: values.days,
        remark: values.remark,
      });
      setIssueOpen(false);
      setTokenResult(res?.token ?? '');
      setTokenOpen(true);
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setIssuing(false);
    }
  };

  // Internal implementation detail.
  const onInvalidate = async (row: SysApiToken) => {
    setInvalidating(true);
    try {
      await sysApiTokenApi.deleteApiToken({ ID: row.ID });
      message.success('操作成功');
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setInvalidating(false);
    }
  };

  const columns = useMemo<TableColumnsType<SysApiToken>>(
    () => [
      { title: 'ID', dataIndex: 'ID', width: 70 },
      {
        title: '用户',
        key: 'userName',
        width: 160,
        render: (_: unknown, row: SysApiToken) =>
          row.userName ? (
            <Typography.Text style={{ maxWidth: 150 }} ellipsis={{ tooltip: row.userName }}>
              {row.userName}
            </Typography.Text>
          ) : row.userId ? (
            `用户 ID：${row.userId}`
          ) : (
            '-'
          ),
      },
      { title: '角色 ID', dataIndex: 'authorityId', width: 90, align: 'center' },
      {
        title: '状态',
        key: 'status',
        width: 100,
        align: 'center',
        render: (_: unknown, row: SysApiToken) => statusTag(row.status),
      },
      {
        title: '过期时间',
        key: 'expiresAt',
        width: 180,
        render: (_: unknown, row: SysApiToken) => formatExpires(row.expiresAt),
      },
      {
        title: '备注',
        dataIndex: 'remark',
        render: (value: unknown) => {
          const text = value === null || value === undefined ? '' : String(value);
          return text ? (
            <Typography.Text style={{ maxWidth: 220 }} ellipsis={{ tooltip: text }}>
              {text}
            </Typography.Text>
          ) : (
            '-'
          );
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 100,
        fixed: 'right',
        render: (_: unknown, row: SysApiToken) => (
          <Popconfirm
            title="确定要作废此 API 令牌吗？"
            onConfirm={() => void onInvalidate(row)}
          >
            <Button type="link" size="small" danger loading={invalidating}>
              作废
            </Button>
          </Popconfirm>
        ),
      },
    ],
    // Internal implementation detail.
    [invalidating],
  );

  if (!canManage) return <Alert type="info" showIcon message="仅超级管理员可管理 API 令牌" />;
  return (
    <div>
      <Card className="table-card" title="API 令牌" styles={{ body: { padding: '16px 16px 0' } }}>
        <div
          className="table-toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 0 14px',
          }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void openIssue()}>
            签发令牌
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadList} />
        </div>
        <Table<SysApiToken>
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

      {/* label */}
      <Modal
        title="签发 API 令牌"
        open={issueOpen}
        onOk={() => void onIssue()}
        onCancel={() => setIssueOpen(false)}
        confirmLoading={issuing}
        destroyOnHidden
        width={460}
      >
        <Form<IssueFormValues> form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="userId" label="用户" rules={[{ required: true, message: '请选择用户' }]}>
            <Select
              placeholder="请选择用户"
              showSearch
              optionFilterProp="label"
              options={users.map((u) => ({
                label: u.nickName ? `${u.nickName} (${u.userName})` : u.userName,
                value: u.ID,
              }))}
              allowClear
            />
          </Form.Item>
          <Form.Item
            name="authorityId"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              placeholder="请选择角色"
              showSearch
              optionFilterProp="label"
              options={authorities.map((a) => ({
                label: `${a.authorityName} (${a.authorityId})`,
                value: a.authorityId,
              }))}
              allowClear
            />
          </Form.Item>
          <Form.Item
            name="days"
            label="有效期（天）"
            rules={[{ required: true, message: '请输入有效期天数' }]}
          >
            <InputNumber placeholder="请输入天数，-1 表示永久有效" style={{ width: '100%' }} precision={0} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="请输入备注" rows={2} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* label */}
      <Modal
        title="令牌生成成功"
        open={tokenOpen}
        footer={null}
        onCancel={() => setTokenOpen(false)}
        width={560}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          message="复制令牌后，关闭将无法再次查看。请妥善保管！"
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea
          readOnly
          value={tokenResult}
          autoSize={{ minRows: 6, maxRows: 10 }}
          style={{ fontFamily: 'Menlo, Consolas, "Courier New", monospace', fontSize: 12 }}
        />
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Space>
            <Button
              icon={<CopyOutlined />}
              onClick={async () => {
                const ok = await copyText(tokenResult);
                if (ok) message.success('复制成功');
                else message.error('复制失败，请手动选择并复制');
              }}
            >
              复制
            </Button>
            <Button type="primary" onClick={() => setTokenOpen(false)}>
              关闭
            </Button>
          </Space>
        </div>
      </Modal>
    </div>
  );
}
