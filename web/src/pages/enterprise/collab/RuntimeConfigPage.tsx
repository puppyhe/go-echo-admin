import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Input,
  Select,
  Row,
  Space,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { request } from '../../../api/request';
import type { RuntimeConfig } from './types';
const runtimeApi = {
  get: () => request<RuntimeConfig>('/enterprise/collab/config'),
  save: (body: RuntimeConfig) =>
    request<RuntimeConfig>('/enterprise/collab/config', { method: 'PUT', body }),
};
const fields: [keyof RuntimeConfig, string, number, number][] = [
  ['maxNodes', 'Maximum workflow nodes', 2, 200],
  ['maxBranches', 'Maximum branches', 2, 20],
  ['maxActiveInstances', 'Active instances', 1, 1000],
  ['maxRoles', 'Workflow roles', 0, 100],
  ['taskTimeoutMinutes', 'Task timeout (minutes; 0 disables)', 0, 525600],
  ['reminderIntervalMinutes', 'Reminder interval (minutes)', 1, 10080],
  ['scanBatch', 'Task scan batch size', 1, 200],
  ['numberDigits', 'Number of digits', 3, 12],
];
export default function RuntimeConfigPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<RuntimeConfig>();
  const [config, setConfig] = useState<RuntimeConfig>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = async () => {
    const current = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const data = await runtimeApi.get();
      if (current !== sequence.current) return;
      setConfig(data);
      form.setFieldsValue(data);
    } catch (e) {
      if (current === sequence.current) setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, []);
  const save = async (values: RuntimeConfig) => {
    if (!config) return;
    setBusy(true);
    try {
      const data = await runtimeApi.save({ ...values, version: config.version });
      setConfig(data);
      form.setFieldsValue(data);
      message.success('运行时配置已保存');
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Workflow configuration">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          type="info"
          message="Workflow runs use the saved release definition and timestamps are stored in UTC."
        />
        {error && <Alert type="error" message={error} />}
        <Spin spinning={busy}>
          <Form form={form} layout="vertical" onFinish={save}>
            <Form.Item name="workerEnabled" valuePropName="checked" label="Enable workflow worker">
              <Switch />
            </Form.Item>
            <Typography.Paragraph type="secondary">
              The worker checks for pending tasks every 30 seconds and executes approval steps. Disable it to pause task processing.
            </Typography.Paragraph>
            <Row gutter={[24, 0]}>
              {fields.map(([key, label, min, max]) => (
                <Col xs={24} md={12} lg={8} key={key}>
                  <Form.Item
                    name={key}
                    label={label}
                    rules={[{ required: true, type: 'number', min, max }]}
                  >
                    <InputNumber precision={0} min={min} max={max} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              ))}
            </Row>
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="numberPrefix"
                  label="Number prefix"
                  rules={[
                    {
                      required: true,
                      pattern: /^[A-Z][A-Z0-9]{0,15}$/,
                      message: 'Use 1 to 16 uppercase letters or numbers.',
                    },
                  ]}
                >
                  <Input maxLength={16} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="numberDateFormat" label="Number date format" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: 'ymd', label: 'Year, month, day' },
                      { value: 'ym', label: 'Year and month' },
                      { value: 'none', label: 'No date' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="preventDuplicateBusiness"
              valuePropName="checked"
              label="Prevent duplicate business records"
            >
              <Switch />
            </Form.Item>
            <Typography.Paragraph type="secondary">
              Applies to approval records, workflow runs, and audit entries.
            </Typography.Paragraph>
            <Space>
              <Button htmlType="submit" type="primary" loading={busy} disabled={!config}>
                Save configuration
              </Button>
              <Button onClick={() => void load()} disabled={busy}>
                Reload
              </Button>
              <span>version {config?.version ?? '—'}</span>
            </Space>
          </Form>
        </Spin>
        <Alert
          type="info"
          message="Runtime configuration"
          description="Keep request payloads below 50 KB, approval history below 200 entries, and history text below 400 KB. Save after changing these settings."
        />
      </Space>
    </Card>
  );
}
