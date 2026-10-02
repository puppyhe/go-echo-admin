import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  providerApi,
  type ProviderChannel,
  type ProviderInput,
  type ProviderType,
} from './providerApi';
import { channels } from './managementModel';
import './management.css';

const providers: Record<ProviderType, { value: string; label: string }[]> = {
  inbox: [{ value: 'builtin', label: '系统内置' }],
  email: [{ value: 'smtp', label: 'SMTP' }],
  webhook: [
    { value: 'dingtalk', label: '钉钉' },
    { value: 'wecom', label: '企业微信' },
    { value: 'feishu', label: '飞书' },
    { value: 'generic', label: '通用 Webhook' },
  ],
  sms: [
    { value: 'aliyun', label: '阿里云短信' },
    { value: 'tencent', label: '腾讯云短信' },
  ],
};
const providerName = (row: ProviderChannel) =>
  providers[row.type]?.find((p) => p.value === row.provider)?.label ?? row.provider;
export function ProvidersPanel() {
  const { message } = App.useApp();
  const [form] = Form.useForm<ProviderInput>();
  const [testForm] = Form.useForm();
  const [rows, setRows] = useState<ProviderChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<{ q?: string; type?: string }>({});
  const [queryForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [editing, setEditing] = useState<ProviderChannel>();
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<ProviderChannel>();
  const serial = useRef(0);
  const kind = Form.useWatch('type', form) ?? 'webhook';
  const provider = Form.useWatch('provider', form) ?? 'generic';
  const load = useCallback(async () => {
    const n = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const data = await providerApi.list(page, pageSize, filters.q, filters.type);
      if (n !== serial.current) return;
      setRows(data.list ?? []);
      setTotal(data.total);
      setEncryptionReady(data.encryptionReady);
      if (page > 1 && data.total <= (page - 1) * pageSize)
        setPage(Math.max(1, Math.ceil(data.total / pageSize)));
    } catch (e) {
      if (n === serial.current) setError(e instanceof Error ? e.message : '加载数据失败');
    } finally {
      if (n === serial.current) setLoading(false);
    }
  }, [page, pageSize, filters]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  const edit = async (row?: ProviderChannel) => {
    setBusy(true);
    try {
      const fresh = row ? await providerApi.get(row.id) : undefined;
      setEditing(fresh);
      form.resetFields();
      form.setFieldsValue(
        fresh
          ? {
              code: fresh.code,
              name: fresh.name,
              type: fresh.type,
              provider: fresh.provider,
              enabled: fresh.enabled,
              default: fresh.default,
              ratePerMinute: fresh.ratePerMinute,
              description: fresh.description,
              config: fresh.config,
              version: fresh.version,
              secrets: {},
            }
          : {
              type: 'webhook',
              provider: 'generic',
              enabled: false,
              default: false,
              ratePerMinute: 0,
              description: '',
              config: { smtpTls: 'implicit', region: 'cn-hangzhou', mappings: [] },
              version: 0,
              secrets: {},
            },
      );
      setOpen(true);
    } catch {
      /* request reports errors */
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    let v: ProviderInput;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    try {
      await providerApi.save(editing?.id, {
        code: v.code,
        name: v.name,
        type: v.type,
        provider: v.provider,
        enabled: v.enabled ?? false,
        default: v.default ?? false,
        ratePerMinute: v.ratePerMinute ?? 0,
        description: v.description ?? '',
        config: v.config ?? {},
        secrets: v.secrets ?? {},
        clearSecrets: v.clearSecrets ?? [],
        version: editing?.version ?? 0,
      });
      setOpen(false);
      await load();
      message.success('保存成功');
    } catch {
      /* keep form */
    } finally {
      setBusy(false);
    }
  };
  const secret = (
    name: 'webhookUrl' | 'signingSecret' | 'smtpSecret' | 'accessKeyId' | 'accessKeySecret',
    label: string,
    required = false,
  ) => (
    <Form.Item
      label={label}
      name={['secrets', name]}
      rules={[{ required: required && !editing?.secretSet[name], message: `请输入${label}` }]}
      extra={editing?.secretSet[name] ? '已保存，留空则保留原值。' : undefined}
    >
      <Input.Password
        autoComplete="new-password"
        placeholder={editing?.secretSet[name] ? '留空则保持不变' : `请输入${label}`}
        maxLength={8000}
      />
    </Form.Item>
  );
  const runTest = async () => {
    if (!testing) return;
    let v;
    try {
      v = testing.type === 'sms' ? await testForm.validateFields() : {};
    } catch {
      return;
    }
    let values: Record<string, unknown> = {};
    try {
      values = JSON.parse(v.values || '{}');
      if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error();
    } catch {
      message.error('请提供合法的 JSON 对象');
      return;
    }
    setBusy(true);
    try {
      const result = await providerApi.test(testing, v.templateCode, values);
      setTesting(undefined);
      message.success(result.message);
    } catch {
      /* request reports */
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card>
        <Form
          form={queryForm}
          name="providerSearch"
          layout="inline"
          className="notification-management-toolbar"
          onFinish={(v) => {
            setPage(1);
            setFilters({ q: v.q?.trim(), type: v.type });
          }}
        >
          <Space wrap>
            <Form.Item label="名称/编码" name="q">
              <Input placeholder="按名称或编码搜索" allowClear />
            </Form.Item>
            <Form.Item label="渠道类型" name="type">
              <Select allowClear placeholder="全部" style={{ width: 140 }} options={channels} />
            </Form.Item>
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button
              onClick={() => {
                queryForm.resetFields();
                setFilters({});
                setPage(1);
              }}
            >
              重置
            </Button>
          </Space>
        </Form>
      </Card>
      <Card
        title="通知服务商"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              disabled={busy}
              onClick={() => void load()}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={busy}
              onClick={() => void edit()}
            >
              新建服务商
            </Button>
          </Space>
        }
      >
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Typography.Paragraph type="secondary">
          同一渠道类型下仅有一个默认服务商，未设置默认时将使用第一个已启用的服务商。
        </Typography.Paragraph>
        {!encryptionReady && !loading && !error && (
          <Alert
            type="info"
            showIcon
            message="尚未启用配置加密"
            description="服务商密钥需要加密存储，请在部署环境配置相应的 ECHO_ADMIN_* 密钥后重启服务。未设置时无法保存 Webhook 地址、SMTP 密码与短信密钥。"
            style={{ marginBottom: 16 }}
          />
        )}
        <Table
          rowKey="id"
          dataSource={rows}
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (n) => `共 ${n} 条`,
            onChange: (p, s) => {
              setPage(s === pageSize ? p : 1);
              setPageSize(s);
            },
          }}
          columns={[
            {
              title: '服务商',
              key: 'channel',
              width: 200,
              render: (_, r) => (
                <>
                  <Typography.Text strong>{r.name}</Typography.Text>
                  {r.default && (
                    <Tag color="blue" style={{ marginLeft: 6 }}>
                      默认
                    </Tag>
                  )}
                  <div>
                    <Typography.Text type="secondary" code>
                      {r.code}
                    </Typography.Text>
                  </div>
                </>
              ),
            },
            {
              title: '类型',
              dataIndex: 'type',
              width: 85,
              render: (v) => channels.find((c) => c.value === v)?.label ?? v,
            },
            { title: '服务商', key: 'provider', width: 95, render: (_, r) => providerName(r) },
            {
              title: '投递状态',
              key: 'delivery',
              width: 130,
              render: (_, r) => (
                <Tag
                  color={
                    r.lastStatus === 'sent'
                      ? 'success'
                      : r.lastStatus === 'failed'
                        ? 'error'
                        : 'default'
                  }
                >
                  {(
                    {
                      sent: '已发送',
                      failed: '发送失败',
                      pending: '待发送',
                      processing: '发送中',
                      suppressed: '已抑制',
                      cancelled: '已取消',
                    } as Record<string, string>
                  )[r.lastStatus ?? ''] ?? '未知'}
                </Tag>
              ),
            },
            { title: '接收地址', dataIndex: 'targetSummary', width: 240, ellipsis: true },
            {
              title: '限流（条/分钟）',
              dataIndex: 'ratePerMinute',
              width: 115,
              render: (v) => v || '不限流',
            },
            {
              title: '状态',
              key: 'status',
              width: 140,
              render: (_, r) => (
                <Space direction="vertical" size={0}>
                  <Tag color={r.enabled ? 'success' : 'default'}>
                    {r.enabled ? '已启用' : '已停用'}
                  </Tag>
                  {!r.credentialsReady && <Tag color="error">凭证缺失</Tag>}
                </Space>
              ),
            },
            {
              title: '操作',
              key: 'action',
              width: 190,
              fixed: 'right',
              render: (_, r) => (
                <Space size={0}>
                  <Button
                    type="link"
                    icon={<EditOutlined />}
                    disabled={busy}
                    onClick={() => void edit(r)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    icon={<SendOutlined />}
                    disabled={busy || !r.enabled || !r.credentialsReady}
                    onClick={() => {
                      testForm.resetFields();
                      testForm.setFieldsValue({ values: '{}' });
                      setTesting(r);
                    }}
                  >
                    测试
                  </Button>
                  <Popconfirm
                    title="确定要删除该服务商？"
                    description="删除后将无法恢复。"
                    disabled={busy}
                    onConfirm={async () => {
                      setBusy(true);
                      try {
                        await providerApi.remove(r.id, r.version);
                        await load();
                        message.success('删除成功');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Button
                      danger
                      type="text"
                      aria-label={`删除${r.name}`}
                      icon={<DeleteOutlined />}
                      disabled={busy}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing ? '编辑服务商' : '新建服务商'}
        centered
        styles={{ body: { maxHeight: 'calc(100dvh - 180px)', overflowY: 'auto', paddingRight: 8 } }}
        open={open}
        width={760}
        onCancel={() => !busy && setOpen(false)}
        onOk={() => void save()}
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        destroyOnHidden
      >
        <Form form={form} name="providerEditor" layout="vertical" disabled={busy} preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="编码"
                name="code"
                rules={[
                  {
                    required: true,
                    pattern: /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/,
                    message: '编码必填，长度不超过 100 个字符，仅支持字母、数字、下划线、连字符和点',
                  },
                ]}
              >
                <Input disabled={Boolean(editing)} placeholder="wecom_ops_group" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="名称"
                name="name"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="类型" name="type" rules={[{ required: true }]}>
                <Select
                  options={channels}
                  disabled={Boolean(editing)}
                  onChange={(v: ProviderType) =>
                    form.setFieldsValue({
                      provider: providers[v][0].value,
                      secrets: {},
                      config: {
                        region: v === 'sms' ? 'cn-hangzhou' : '',
                        smtpTls: 'implicit',
                        mappings: [],
                      },
                    })
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="服务商" name="provider" rules={[{ required: true }]}>
                <Select
                  options={providers[kind as ProviderType]}
                  disabled={Boolean(editing)}
                  onChange={(v) =>
                    form.setFieldsValue({
                      secrets: {},
                      config: {
                        ...form.getFieldValue('config'),
                        region: v === 'tencent' ? 'ap-guangzhou' : 'cn-hangzhou',
                      },
                    })
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          {kind === 'webhook' && (
            <>
              {secret('webhookUrl', 'Webhook 地址', true)}
              <Typography.Paragraph type="secondary">
                请填写完整的 Webhook 地址，平台将以 POST 方式推送消息，并附加签名信息用于校验。
              </Typography.Paragraph>
              {['dingtalk', 'feishu'].includes(provider) && secret('signingSecret', '签名密钥')}
              {editing?.secretSet.signingSecret && (
                <Form.Item name="clearSecrets">
                  <Checkbox.Group
                    options={[
                      { label: '清除签名密钥（已设置）', value: 'signingSecret' },
                    ]}
                  />
                </Form.Item>
              )}
            </>
          )}
          {kind === 'email' && (
            <>
              <Form.Item
                label="SMTP 服务器地址"
                name={['config', 'smtpAddress']}
                extra="留空则使用系统默认 SMTP 服务器地址，如 smtp.example.com:465。"
              >
                <Input placeholder="smtp.example.com:465" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="发件人地址"
                    name={['config', 'smtpFrom']}
                    rules={[{ type: 'email' }]}
                  >
                    <Input placeholder="no-reply@example.com" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="加密方式" name={['config', 'smtpTls']}>
                    <Select
                      options={[
                        { value: 'implicit', label: 'SSL/TLS' },
                        { value: 'starttls', label: 'STARTTLS' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              {secret('smtpSecret', 'SMTP 密码')}
              <Form.Item label="发件人昵称" name={['config', 'smtpNickname']}>
                <Input maxLength={100} placeholder="系统通知" />
              </Form.Item>
            </>
          )}
          {kind === 'sms' && (
            <>
              {secret('accessKeyId', provider === 'tencent' ? 'Secret ID' : 'AccessKey ID', true)}
              {secret(
                'accessKeySecret',
                provider === 'tencent' ? 'Secret Key' : 'AccessKey Secret',
                true,
              )}
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="短信签名"
                    name={['config', 'signName']}
                    rules={[{ required: true }]}
                  >
                    <Input maxLength={100} placeholder="请填写已审核通过的短信签名" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="地域" name={['config', 'region']} rules={[{ required: true }]}>
                    <Input placeholder={provider === 'tencent' ? 'ap-guangzhou' : 'cn-hangzhou'} />
                  </Form.Item>
                </Col>
              </Row>
              {provider === 'tencent' && (
                <Form.Item
                  label="应用 AppID"
                  name={['config', 'appId']}
                  rules={[{ required: true, pattern: /^\d{1,30}$/ }]}
                >
                  <Input />
                </Form.Item>
              )}
              <Divider orientation="left">模板配置</Divider>
              <Typography.Paragraph type="secondary">
                为每个模板填写模板编码与服务商侧的模板 ID，并配置参数名与模板变量名之间的对应关系。
              </Typography.Paragraph>
              <Form.List name={['config', 'mappings']}>
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {fields.map((f) => (
                      <Card
                        size="small"
                        key={f.key}
                        title={`模板 ${f.name + 1}`}
                        extra={
                          <Button danger type="text" onClick={() => remove(f.name)}>
                            删除
                          </Button>
                        }
                      >
                        <Row gutter={12}>
                          <Col span={12}>
                            <Form.Item
                              name={[f.name, 'templateCode']}
                              label="模板编码"
                              rules={[{ required: true }]}
                            >
                              <Input />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              name={[f.name, 'providerTemplate']}
                              label="template ID / Code"
                              rules={[{ required: true }]}
                            >
                              <Input />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.List name={[f.name, 'parameters']}>
                          {(params, actions) => (
                            <>
                              {params.map((p) => (
                                <Row key={p.key} gutter={8}>
                                  <Col span={10}>
                                    <Form.Item name={[p.name, 'name']} rules={[{ required: true }]}>
                                      <Input placeholder="参数名" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={10}>
                                    <Form.Item
                                      name={[p.name, 'variable']}
                                      rules={[{ required: true }]}
                                    >
                                      <Input placeholder="模板变量名" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={4}>
                                    <Button
                                      danger
                                      type="text"
                                      icon={<DeleteOutlined />}
                                      aria-label="删除参数"
                                      onClick={() => actions.remove(p.name)}
                                    />
                                  </Col>
                                </Row>
                              ))}
                              <Button
                                size="small"
                                onClick={() => actions.add({ name: '', variable: '' })}
                                disabled={params.length >= 40}
                              >
                                添加参数
                              </Button>
                            </>
                          )}
                        </Form.List>
                      </Card>
                    ))}
                    <Button
                      block
                      type="dashed"
                      icon={<PlusOutlined />}
                      disabled={fields.length >= 50}
                      onClick={() =>
                        add({ templateCode: '', providerTemplate: '', parameters: [] })
                      }
                    >
                      添加模板
                    </Button>
                  </Space>
                )}
              </Form.List>
            </>
          )}
          <Divider />
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="每分钟限流"
                name="ratePerMinute"
                extra="0 表示不限流"
                rules={[{ type: 'integer', min: 0, max: 100000 }]}
              >
                <InputNumber min={0} max={100000} precision={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="设为默认" name="default" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="启用" name="enabled" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`测试发送 · ${testing?.name ?? ''}`}
        open={Boolean(testing)}
        okText="发送测试消息"
        confirmLoading={busy}
        onCancel={() => !busy && setTesting(undefined)}
        onOk={() => void runTest()}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          message={
            testing?.type === 'webhook'
              ? '将向配置的 Webhook 地址发送一条测试消息。'
              : '将按所选模板发送一条测试短信。'
          }
          description="测试消息使用当前服务商配置发送，不会产生实际业务影响。"
          style={{ marginBottom: 16 }}
        />
        {testing?.type === 'sms' ? (
          <Form form={testForm} layout="vertical">
            <Form.Item name="templateCode" label="模板" rules={[{ required: true }]}>
              <Select
                options={testing.config.mappings?.map((m) => ({
                  value: m.templateCode,
                  label: m.templateCode,
                }))}
              />
            </Form.Item>
            <Form.Item name="values" label="模板参数（JSON 对象）" rules={[{ required: true }]}>
              <Input.TextArea rows={5} placeholder={'{"code":"123456"}'} />
            </Form.Item>
          </Form>
        ) : (
          <Typography.Paragraph>
            系统将向该服务商创建一条标记为“测试”的消息，并推送给当前用户。
          </Typography.Paragraph>
        )}
      </Modal>
    </>
  );
}
