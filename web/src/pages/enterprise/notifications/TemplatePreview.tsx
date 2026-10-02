import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
} from 'antd';
import { notificationManagementApi, type TemplateInput } from './managementApi';
import { templateValues } from './managementModel';
export default function TemplatePreview({
  template,
  allowTest,
  onClose,
}: {
  template: TemplateInput | null;
  allowTest: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    form.resetFields();
    setPreview(null);
    setError('');
    if (template)
      form.setFieldsValue(
        Object.fromEntries(
          (template.variables ?? []).map((variable) => [variable.name, variable.example]),
        ),
      );
  }, [template, form]);
  const run = async (test: boolean) => {
    if (!template) return;
    let values: Record<string, unknown>;
    try {
      values = templateValues(template.variables ?? [], await form.validateFields());
    } catch (e) {
      if (e instanceof Error) setError(e.message);
      return;
    }
    setError('');
    test ? setTesting(true) : setLoading(true);
    try {
      if (test && template.id) {
        await notificationManagementApi.test(template.id, values);
        message.success('测试消息发送成功');
        window.dispatchEvent(new Event('gea-notifications-change'));
      } else setPreview(await notificationManagementApi.preview(template, values));
    } catch (e) {
      setError(e instanceof Error ? e.message : '预览失败');
    } finally {
      setTesting(false);
      setLoading(false);
    }
  };
  return (
    <Modal
      title="模板预览"
      forceRender
      width={740}
      open={Boolean(template)}
      onCancel={onClose}
      keyboard={!loading && !testing}
      maskClosable={!loading && !testing}
      closable={!loading && !testing}
      footer={
        <Space>
          <Button disabled={loading || testing} onClick={onClose}>
            关闭
          </Button>
          <Button
            type="primary"
            loading={loading}
            disabled={testing}
            onClick={() => void run(false)}
          >
            预览
          </Button>
          {allowTest && template?.id && (
            <Button
              loading={testing}
              disabled={loading || !template.enabled}
              onClick={() => void run(true)}
            >
              发送测试
            </Button>
          )}
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        message={
          allowTest
            ? '测试消息将发送给当前用户，请确认 Webhook 配置正确。'
            : '预览使用当前模板和示例数据。'
        }
        style={{ marginBottom: 16 }}
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form
        form={form}
        layout="vertical"
        disabled={loading || testing}
        onValuesChange={() => setPreview(null)}
      >
        {(template?.variables ?? []).map((variable, index) => (
          <Form.Item
            key={`${variable.name}:${index}`}
            name={variable.name}
            label={`${variable.name} · ${variable.type}`}
            rules={[{ required: variable.required, message: `请输入${variable.name}` }]}
          >
            {variable.type === 'number' ? (
              <InputNumber style={{ width: '100%' }} />
            ) : variable.type === 'boolean' ? (
              <Select
                allowClear
                options={[
                  { label: 'true', value: true },
                  { label: 'false', value: false },
                ]}
              />
            ) : (
              <Input />
            )}
          </Form.Item>
        ))}
      </Form>
      {preview && (
        <Card size="small" title={preview.title || '（无标题）'}>
          <Typography.Paragraph
            style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}
          >
            {preview.body}
          </Typography.Paragraph>
        </Card>
      )}
    </Modal>
  );
}
