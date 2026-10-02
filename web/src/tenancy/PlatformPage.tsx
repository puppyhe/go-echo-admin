import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  platformApi,
  platformLoginURL,
  platformSession,
  safePlatformReturnTo,
  tenancyApi,
} from './api';
import type { Tenant } from '../domain/tenancy';
import { TenantCreateFields } from './TenantCreateFields';
import { tenancyFeedback, type TenancyFeedback } from './errors';
import '../pages/login/LoginPage.css';

const stateLabels: Record<Tenant['state'], string> = {
  provisioning: '准备中',
  active: '正常',
  disabled: '已禁用',
  failed: '请求失败',
};
const colors: Record<Tenant['state'], string> = {
  provisioning: 'processing',
  active: 'success',
  disabled: 'default',
  failed: 'error',
};
type CreateValue = { code: string; name: string; adminPassword: string };
export default function PlatformPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [enabled, setEnabled] = useState<boolean>();
  const [configError, setConfigError] = useState<TenancyFeedback>();
  const [rows, setRows] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionID, setActionID] = useState<string>();
  const [form] = Form.useForm<CreateValue>();
  const isLogin = location.pathname === '/platform/login';
  const returnTo = safePlatformReturnTo(new URLSearchParams(location.search).get('returnTo'));
  useEffect(() => {
    let active = true;
    void tenancyApi
      .info()
      .then((v) => {
        if (active) setEnabled(v.enabled);
      })
      .catch((e) => {
        if (active) setConfigError(tenancyFeedback(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const tenants = await platformApi.tenants();
      setRows(tenants.list ?? []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled && !isLogin && platformSession.token()) void load();
  }, [enabled, isLogin, load]);
  useEffect(() => {
    if (!enabled || isLogin || !rows.some((row) => row.state === 'provisioning')) return;
    const timer = window.setInterval(() => {
      if (!loading) void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled, isLogin, rows, loading, load]);
  async function create() {
    try {
      const value = await form.validateFields();
      setBusy(true);
      await platformApi.create({
        ...value,
        code: value.code.trim(),
        name: value.name.trim(),
      });
      setCreating(false);
      form.resetFields();
      message.success('租户创建成功，准备完成后可复制登录链接。');
      await load();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(row: Tenant, action: 'enable' | 'disable' | 'retry') {
    setActionID(row.id);
    try {
      await platformApi.action(row.id, action);
      message.success('租户状态已更新。');
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '请求失败');
    } finally {
      setActionID(undefined);
    }
  }
  if (configError)
    return (
      <div className="page-loading">
        <Alert
          type="error"
          message={configError.title}
          description={configError.description}
          action={<Button onClick={() => window.location.reload()}>重试</Button>}
        />
      </div>
    );
  if (enabled === undefined)
    return (
      <div className="page-loading">
        <Spin />
      </div>
    );
  if (!enabled)
    return (
      <div className="page-loading">
        <Alert
          type="info"
          message="租户管理已禁用"
          action={<Button onClick={() => navigate('/login')}>返回登录</Button>}
        />
      </div>
    );
  if (!isLogin && !platformSession.token()) return <Navigate to={platformLoginURL()} replace />;
  if (isLogin)
    return (
      <main className="login-page platform-login-page">
        <section className="login-card platform-login-card" aria-labelledby="platform-login-title">
          <header className="login-card-header">
            <div className="login-card-brand">
              <img className="login-logo" src="/logo.png" alt="" aria-hidden="true" />
              <strong>Go-Echo-Admin</strong>
            </div>
          </header>
          <h1 id="platform-login-title">平台登录</h1>
          <Typography.Paragraph className="platform-login-intro" type="secondary">
            登录后管理租户和平台配置
          </Typography.Paragraph>
          <Form
            className="login-form platform-login-form"
            layout="vertical"
            onFinish={async (value: { username: string; password: string }) => {
              setBusy(true);
              setError('');
              try {
                await platformApi.login(value);
                navigate(returnTo, { replace: true });
              } catch (e) {
                setError(e instanceof Error ? e.message : '登录失败');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input
                size="large"
                prefix={<UserOutlined />}
                placeholder="请输入用户名"
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true }]}>
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </Form.Item>
            {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
            <Button
              className="login-submit platform-login-submit"
              type="primary"
              htmlType="submit"
              loading={busy}
              block
              size="large"
            >
              登录
            </Button>
            <Button className="login-platform-link" type="link" onClick={() => navigate('/login')}>
              返回租户登录
            </Button>
          </Form>
        </section>
      </main>
    );
  return (
    <div className="platform-page">
      <header className="platform-header">
        <div className="brand-lockup">
          <img src="/logo.png" className="brand-mark" alt="Go-Echo-Admin" />
          <span>
            <b>Go-Echo-Admin</b>
            <small>平台控制中心</small>
          </span>
        </div>
        <div className="platform-header-right">
          <Typography.Text type="secondary">租户生命周期与登录入口管理</Typography.Text>
          <Button
            onClick={() => {
              platformSession.clear();
              navigate('/platform/login', { replace: true });
            }}
          >
            登出
          </Button>
        </div>
      </header>
      <main className="platform-content">
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <div>
              <Typography.Title level={2} style={{ marginBottom: 6 }}>
                租户管理
              </Typography.Title>
              <Typography.Text type="secondary">平台管理 · 租户数据与管理员入口</Typography.Text>
            </div>
          </Space>
          {error && (
            <Alert
              type="error"
              message={error}
              action={<Button onClick={() => void load()}>重试</Button>}
            />
          )}
          <Card
            extra={
              <Space>
                <Button loading={loading} onClick={() => void load()}>
                  刷新
                </Button>
                <Button
                  type="primary"
                  disabled={loading}
                  onClick={() => {
                    form.resetFields();
                    setCreating(true);
                  }}
                >
                  新建租户
                </Button>
              </Space>
            }
            title="列表"
          >
            <Table<Tenant>
              rowKey="id"
              dataSource={rows}
              loading={loading}
              scroll={{ x: 850 }}
              locale={{
                emptyText:
                  !loading && !error ? (
                    <Empty description="暂无租户">
                      <Typography.Paragraph type="secondary">
                        创建租户以准备独立工作区和管理员登录。
                      </Typography.Paragraph>
                      <Button
                        type="primary"
                        onClick={() => {
                          form.resetFields();
                          setCreating(true);
                        }}
                      >
                        新建租户
                      </Button>
                    </Empty>
                  ) : (
                    <Empty description={error ? '请求失败，请重试。' : '暂无租户'} />
                  ),
              }}
              columns={[
                { title: '名称', dataIndex: 'name' },
                { title: '编码', dataIndex: 'code' },
                {
                  title: '状态',
                  dataIndex: 'state',
                  render: (v: Tenant['state']) => (
                    <Tag color={colors[v]}>{stateLabels[v] ?? v}</Tag>
                  ),
                },
                {
                  title: '更新时间',
                  dataIndex: 'updatedAt',
                  render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
                },
                {
                  title: '操作',
                  width: 270,
                  render: (_, row) => (
                    <Space wrap size={0}>
                      {row.state === 'active' && (
                        <Button
                          type="link"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(
                                `${window.location.origin}/login?tenant=${encodeURIComponent(row.code)}`,
                              )
                              .then(() => message.success('登录链接已复制。'))
                              .catch(() => message.error('无法复制登录链接。'))
                          }
                        >
                          复制登录链接
                        </Button>
                      )}
                      {row.state === 'active' && (
                        <Popconfirm
                          title={`确定停用「${row.name}」吗？`}
                          description="停用后，该租户下的用户将无法继续登录。"
                          onConfirm={() => act(row, 'disable')}
                        >
                          <Button type="link" danger loading={actionID === row.id}>
                            禁用
                          </Button>
                        </Popconfirm>
                      )}
                      {row.state === 'disabled' && (
                        <Button
                          type="link"
                          loading={actionID === row.id}
                          onClick={() => void act(row, 'enable')}
                        >
                          启用
                        </Button>
                      )}
                      {row.state === 'failed' && (
                        <Button
                          type="link"
                          loading={actionID === row.id}
                          onClick={() => void act(row, 'retry')}
                        >
                          重试准备
                        </Button>
                      )}
                    </Space>
                  ),
                },
              ]}
              expandable={{
                expandedRowRender: (row) => (
                  <Space direction="vertical">
                    <Typography.Text
                      copyable={{
                        text: `${window.location.origin}/login?tenant=${encodeURIComponent(row.code)}`,
                      }}
                    >
                      登录链接：
                      {`${window.location.origin}/login?tenant=${encodeURIComponent(row.code)}`}
                    </Typography.Text>
                    {row.error && <Alert type="error" message={row.error} />}
                  </Space>
                ),
              }}
            />
          </Card>
        </Space>
        <Modal
          title="新建租户"
          okText="创建"
          open={creating}
          onCancel={() => {
            if (!busy) setCreating(false);
          }}
          onOk={() => void create()}
          confirmLoading={busy}
          forceRender
        >
          <Form form={form} layout="vertical" disabled={busy}>
            <TenantCreateFields />
          </Form>
        </Modal>
      </main>
    </div>
  );
}
