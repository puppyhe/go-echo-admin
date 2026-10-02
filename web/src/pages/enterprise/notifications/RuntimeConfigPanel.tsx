import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { notificationManagementApi, type NotificationRuntime } from './managementApi';
import { quietRangeError, timezones, validTimezone, webhookHostsError } from './managementModel';
import './management.css';
export function RuntimeConfigPanel() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<NotificationRuntime>();
  const [current, setCurrent] = useState<NotificationRuntime | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  const timeout = Form.useWatch('timeoutSeconds', form) ?? 1;
  const load = useCallback(async () => {
    const id = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const value = await notificationManagementApi.runtime();
      if (id !== serial.current) return;
      setCurrent(value);
      form.setFieldsValue(value);
      setDirty(false);
    } catch (e) {
      if (id === serial.current) setError(e instanceof Error ? e.message : '配置加载失败');
    } finally {
      if (id === serial.current) setLoading(false);
    }
  }, [form]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  const refresh = () => {
    if (dirty)
      modal.confirm({
        title: '刷新配置？',
        content: '未保存的编辑内容将会丢失。',
        onOk: () => load(),
      });
    else void load();
  };
  const save = async () => {
    if (!current) return;
    let values: NotificationRuntime;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await notificationManagementApi.saveRuntime({
        ...current,
        ...values,
        allowedWebhookHosts: [
          ...new Set((values.allowedWebhookHosts ?? []).map((value) => value.trim().toLowerCase())),
        ],
        version: current.version,
      });
      setCurrent(result);
      form.setFieldsValue(result);
      setDirty(false);
      message.success('配置已保存');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card
      title="运行时配置"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} disabled={saving} loading={loading} onClick={refresh}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!current || loading || !dirty}
            onClick={() => void save()}
          >
            保存配置
          </Button>
        </Space>
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          description="版本已变更，请刷新后重试。"
          action={!current ? <Button onClick={() => void load()}>重试</Button> : undefined}
          style={{ marginBottom: 16 }}
        />
      )}
      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          disabled={saving || loading || !current}
          onValuesChange={() => setDirty(true)}
        >
          <Typography.Title level={5}>基础设置</Typography.Title>
          <Form.Item
            label="启用后台任务"
            name="workerEnabled"
            valuePropName="checked"
            extra="用于发送邮件、Webhook 消息。"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="启用短信"
            name="smsEnabled"
            valuePropName="checked"
            extra="启用后需配置服务商，并按模板与用户分类发送消息。成功后发送消息。"
          >
            <Switch />
          </Form.Item>
          <div className="notification-form-columns">
            <Form.Item
              label="最大重试次数"
              name="maxAttempts"
              rules={[{ required: true, type: 'integer', min: 1, max: 20 }]}
            >
              <InputNumber min={1} max={20} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="批量大小"
              name="batchSize"
              rules={[{ required: true, type: 'integer', min: 1, max: 100 }]}
            >
              <InputNumber min={1} max={100} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="任务租约时间（秒）"
              name="leaseSeconds"
              dependencies={['timeoutSeconds']}
              rules={[
                { required: true, type: 'integer', min: 1, max: 3600 },
                {
                  validator: (_, value) =>
                    value >= timeout + 10
                      ? Promise.resolve()
                      : Promise.reject(new Error('任务租约时间需比超时时间大至少 10 秒')),
                },
              ]}
            >
              <InputNumber min={timeout + 10} max={3600} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="超时时间（秒）"
              name="timeoutSeconds"
              rules={[{ required: true, type: 'integer', min: 1, max: 60 }]}
            >
              <InputNumber min={1} max={60} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Divider />
          <Typography.Title level={5}>消息保留与去重</Typography.Title>
          <div className="notification-form-columns">
            <Form.Item
              label="消息保留天数"
              name="retentionDays"
              rules={[{ required: true, type: 'integer', min: 1, max: 3650 }]}
            >
              <InputNumber min={1} max={3650} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="消息去重（分钟）"
              name="suppressMinutes"
              extra="0 表示关闭去重。"
              rules={[{ required: true, type: 'integer', min: 0, max: 1440 }]}
            >
              <InputNumber min={0} max={1440} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Divider />
          <Typography.Title level={5}>默认设置</Typography.Title>
          <Typography.Paragraph type="secondary">
            未单独设置时使用的默认值，留空则默认关闭。
          </Typography.Paragraph>
          <div className="notification-form-columns">
            <Form.Item
              label="默认静默开始时间"
              name="defaultQuietStart"
              dependencies={['defaultQuietEnd']}
              rules={[
                {
                  validator: (_, value) => {
                    const error = quietRangeError(
                      value ?? '',
                      form.getFieldValue('defaultQuietEnd') ?? '',
                    );
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                },
              ]}
            >
              <Input type="time" />
            </Form.Item>
            <Form.Item
              label="默认静默结束时间"
              name="defaultQuietEnd"
              dependencies={['defaultQuietStart']}
              rules={[
                {
                  validator: (_, value) => {
                    const error = quietRangeError(
                      form.getFieldValue('defaultQuietStart') ?? '',
                      value ?? '',
                    );
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                },
              ]}
            >
              <Input type="time" />
            </Form.Item>
          </div>
          <Form.Item
            label="默认时区"
            name="defaultTimezone"
            rules={[
              { required: true },
              {
                validator: (_, value) =>
                  validTimezone(value ?? '')
                    ? Promise.resolve()
                    : Promise.reject(new Error('请输入有效的 IANA 时区')),
              },
            ]}
          >
            <AutoComplete options={timezones} placeholder="Asia/Shanghai" />
          </Form.Item>
          <Divider />
          <Typography.Title level={5}>Webhook 设置</Typography.Title>
          <Alert
            type="info"
            showIcon
            message="限制 Webhook 请求的目标主机；不在列表内的主机将被拒绝，支持服务地址。"
            style={{ marginBottom: 16 }}
          />
          <Form.Item
            label="允许的 Webhook 主机"
            name="allowedWebhookHosts"
            rules={[
              {
                validator: (_, value) => {
                  const error = webhookHostsError(value ?? []);
                  return error ? Promise.reject(new Error(error)) : Promise.resolve();
                },
              },
            ]}
            extra="支持 *.example.com 格式，最多 100 个域名。"
          >
            <Select mode="tags" tokenSeparators={[',', '，']} placeholder="请输入域名" />
          </Form.Item>
        </Form>
      </Spin>
    </Card>
  );
}
export default RuntimeConfigPanel;
