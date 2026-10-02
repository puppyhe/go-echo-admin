import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  InputNumber,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography,
} from 'antd';
import { ReloadOutlined, SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { securityApi, type SecurityPolicy } from './api';
import { securityPreset } from './model';

export default function SecurityPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<SecurityPolicy>();
  const [policy, setPolicy] = useState<SecurityPolicy>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await securityApi.get();
      setPolicy(next);
      form.setFieldsValue(next);
      setError('');
    } finally {
      setLoading(false);
    }
  }, [form]);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  const save = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    if (!policy) return;
    setSaving(true);
    setError('');
    try {
      const next = await securityApi.save({
        ...form.getFieldsValue(true),
        version: policy.version,
      });
      setPolicy(next);
      form.setFieldsValue(next);
      message.success('安全策略已保存');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  const number = (name: string[], label: string, min: number, max: number, extra?: string) => (
    <Form.Item
      name={name}
      label={label}
      extra={extra}
      rules={[
        {
          required: true,
          type: 'integer',
          min,
          max,
          message: `请输入 ${min} 到 ${max} 之间的值`,
        },
      ]}
    >
      <InputNumber min={min} max={max} precision={0} style={{ width: 260 }} />
    </Form.Item>
  );
  const toggle = (name: string[], label: string, extra?: string) => (
    <Form.Item name={name} label={label} valuePropName="checked" extra={extra}>
      <Switch />
    </Form.Item>
  );
  return (
    <Card
      title={
        <Space>
          <SafetyCertificateOutlined />
          安全策略
        </Space>
      }
      extra={
        <Space>
          <Typography.Text type="secondary">版本 {policy?.version ?? '—'}</Typography.Text>
          <Popconfirm
            title="丢弃未保存的修改并重新加载？"
            onConfirm={() => load()}
            disabled={loading || saving}
          >
            <Button icon={<ReloadOutlined />} disabled={loading || saving}>
              重新加载
            </Button>
          </Popconfirm>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!policy || loading}
            onClick={() => void save()}
          >
            保存策略
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            description="请检查各字段后重新保存。"
            style={{ marginBottom: 16 }}
          />
        )}
        <Alert
          type="info"
          showIcon
          message="安全控制"
          description="配置该租户的验证码、密码、频率限制、锁定和过期策略。"
          style={{ marginBottom: 20 }}
        />
        <Form form={form} layout="vertical" disabled={saving || loading} style={{ maxWidth: 900 }}>
          <Tabs
            items={[
              {
                key: 'captcha',
                label: '验证码',
                forceRender: true,
                children: (
                  <>
                    {number(
                      ['captcha', 'threshold'],
                      '登录失败阈值',
                      0,
                      1000,
                      '设为 0 则禁用验证码阈值。',
                    )}
                    {number(
                      ['captcha', 'cacheSeconds'],
                      '时间窗口（秒）',
                      60,
                      86400,
                      '生成的验证码的有效期。',
                    )}
                    {number(['captcha', 'length'], '验证码长度', 4, 8)}
                    {number(['captcha', 'width'], '图片宽度（px）', 120, 600)}
                    {number(['captcha', 'height'], '图片高度（px）', 40, 240)}
                  </>
                ),
              },
              {
                key: 'password',
                label: '密码',
                forceRender: true,
                children: (
                  <>
                    {toggle(
                      ['password', 'enabled'],
                      '启用密码策略',
                      '仅在旧版客户端无法满足策略时禁用。',
                    )}
                    {number(
                      ['password', 'minLength'],
                      '最小长度',
                      6,
                      64,
                      '密码上限为 72 个 UTF-8 字节。',
                    )}
                    <Space wrap>
                      {(['uppercase', 'lowercase', 'number', 'special'] as const).map(
                        (key, index) => (
                          <Form.Item key={key} name={['password', key]} valuePropName="checked">
                            <Checkbox>
                              {['大写字母', '小写字母', '数字', '特殊字符'][index]}
                            </Checkbox>
                          </Form.Item>
                        ),
                      )}
                    </Space>
                  </>
                ),
              },
              {
                key: 'rateLimit',
                label: '频率限制',
                forceRender: true,
                children: (
                  <>
                    {toggle(['rateLimit', 'enabled'], '启用频率限制')}
                    {number(['rateLimit', 'windowSeconds'], '时间窗口（秒）', 1, 3600)}
                    {number(['rateLimit', 'maxAttempts'], '最大尝试次数', 1, 10000)}
                    <Typography.Paragraph type="secondary">
                      频率限制基于 IP 地址和登录身份。启用 IP 限制前请先配置可信代理设置。
                    </Typography.Paragraph>
                  </>
                ),
              },
              {
                key: 'lockout',
                label: '账户锁定',
                forceRender: true,
                children: (
                  <>
                    {toggle(['lockout', 'enabled'], '启用账户锁定')}
                    {number(['lockout', 'failures'], '失败次数', 1, 100)}
                    {number(['lockout', 'durationMinutes'], '锁定时长（分钟）', 1, 1440)}
                    <Typography.Paragraph type="secondary">
                      登录成功后计数器重置；验证码失败也计入锁定次数。
                    </Typography.Paragraph>
                  </>
                ),
              },
              {
                key: 'expiry',
                label: '密码过期',
                forceRender: true,
                children: (
                  <>
                    {toggle(['expiry', 'enabled'], '启用密码过期')}
                    {number(['expiry', 'days'], '过期周期（天）', 1, 3650)}
                    {toggle(
                      ['expiry', 'forceFirstLogin'],
                      '要求首次登录时修改',
                      '用户创建或管理员重置后必须修改临时密码。',
                    )}
                    <Alert
                      type="warning"
                      showIcon
                      message="会话安全"
                      description="密码修改会使当前会话和 API 令牌失效；修改凭证后请重新登录。"
                    />
                  </>
                ),
              },
            ]}
          />
          <Popconfirm
            title="应用推荐的安全策略？"
            onConfirm={() => form.setFieldsValue(securityPreset(policy?.version ?? 0))}
          >
            <Button disabled={saving || loading}>使用推荐默认值</Button>
          </Popconfirm>
        </Form>
      </Spin>
    </Card>
  );
}
