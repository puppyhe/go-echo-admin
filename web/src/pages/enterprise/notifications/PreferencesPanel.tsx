import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Space,
  Spin,
  Switch,
  Table,
  Typography,
} from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { notificationManagementApi, type NotificationPreferences } from './managementApi';
import { categories, quietRangeError, timezones, validTimezone } from './managementModel';
import './management.css';
export function PreferencesPanel() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<NotificationPreferences>();
  const [current, setCurrent] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  const quiet = Form.useWatch('quietEnabled', form);
  const load = useCallback(async () => {
    const id = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const value = await notificationManagementApi.preferences();
      if (id !== serial.current) return;
      setCurrent(value);
      form.setFieldsValue(value);
      setDirty(false);
    } catch (e) {
      if (id === serial.current) setError(e instanceof Error ? e.message : '加载数据失败');
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
        title: '放弃未保存的修改？',
        content: '重新加载会丢失当前修改，确定继续吗？',
        onOk: () => load(),
      });
    else void load();
  };
  const save = async () => {
    if (!current) return;
    let values: NotificationPreferences;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await notificationManagementApi.savePreferences({
        ...current,
        ...values,
        version: current.version,
      });
      setCurrent(result);
      form.setFieldsValue(result);
      setDirty(false);
      message.success('保存成功');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card
      title="通知偏好"
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
            保存
          </Button>
        </Space>
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          description="配置版本已更新，请刷新后重试。"
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
          <Alert
            type="info"
            showIcon
            message="配置各类消息的通知渠道，系统通知默认开启，短信、邮件和 Webhook 可按分类设置。"
            style={{ marginBottom: 20 }}
          />
          <Table
            dataSource={categories}
            rowKey="value"
            pagination={false}
            scroll={{ x: 450 }}
            columns={[
              { title: '通知分类', dataIndex: 'label' },
              {
                title: '短信',
                key: 'sms',
                align: 'center',
                render: (_, row) => (
                  <Form.Item noStyle name={['matrix', row.value, 'sms']} valuePropName="checked">
                    <Checkbox aria-label={`${row.label}短信通知`} />
                  </Form.Item>
                ),
              },
              {
                title: '站内消息',
                key: 'inbox',
                align: 'center',
                render: () => <Checkbox checked disabled aria-label="启用站内消息" />,
              },
              {
                title: '邮件',
                key: 'email',
                align: 'center',
                render: (_, row) => (
                  <Form.Item noStyle name={['matrix', row.value, 'email']} valuePropName="checked">
                    <Checkbox aria-label={`${row.label}邮件通知`} />
                  </Form.Item>
                ),
              },
              {
                title: 'Webhook',
                key: 'webhook',
                align: 'center',
                render: (_, row) => (
                  <Form.Item
                    noStyle
                    name={['matrix', row.value, 'webhook']}
                    valuePropName="checked"
                  >
                    <Checkbox aria-label={`${row.label} Webhook 通知`} />
                  </Form.Item>
                ),
              },
            ]}
          />
          <Typography.Title level={5} style={{ marginTop: 28 }}>
            免打扰设置
          </Typography.Title>
          <Form.Item label="启用免打扰" name="quietEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <div className="notification-form-columns">
            <Form.Item
              label="开始时间"
              name="quietStart"
              dependencies={['quietEnd', 'quietEnabled']}
              rules={[
                {
                  validator: (_, value) => {
                    const error = quietRangeError(
                      value ?? '',
                      form.getFieldValue('quietEnd') ?? '',
                      quiet,
                    );
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                },
              ]}
            >
              <Input type="time" disabled={!quiet || saving || loading || !current} />
            </Form.Item>
            <Form.Item
              label="结束时间"
              name="quietEnd"
              dependencies={['quietStart', 'quietEnabled']}
              rules={[
                {
                  validator: (_, value) => {
                    const error = quietRangeError(
                      form.getFieldValue('quietStart') ?? '',
                      value ?? '',
                      quiet,
                    );
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                },
              ]}
            >
              <Input type="time" disabled={!quiet || saving || loading || !current} />
            </Form.Item>
          </div>
          <Form.Item
            label="时区"
            name="timezone"
            rules={[
              { required: true, message: '请输入时区' },
              {
                validator: (_, value) =>
                  validTimezone(value ?? '')
                    ? Promise.resolve()
                    : Promise.reject(new Error('请输入有效的 IANA 时区，例如 Asia/Shanghai')),
              },
            ]}
          >
            <AutoComplete options={timezones} placeholder="Asia/Shanghai" />
          </Form.Item>
          <Typography.Paragraph type="secondary">
            时区请使用 IANA 格式，例如 Asia/Shanghai；保存后对通知服务生效。
          </Typography.Paragraph>
        </Form>
      </Spin>
    </Card>
  );
}
export default PreferencesPanel;
