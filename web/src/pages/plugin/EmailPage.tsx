// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Email form with recipient validation and server-backed delivery.
import { useState } from 'react';
import { App, Alert, Button, Card, Form, Input, Space } from 'antd';
import { SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { emailApi } from '../../api/endpoints';

// Internal implementation detail.
interface EmailFormValues {
  to: string;
  subject: string;
  body: string;
}

// Internal implementation detail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toValidator = {
  validator: (_rule: unknown, value: string) => {
    const list = String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (list.length === 0) return Promise.reject(new Error('请输入收件人地址'));
    if (list.some((item) => !EMAIL_PATTERN.test(item)))
      return Promise.reject(new Error('收件人地址格式不正确'));
    return Promise.resolve();
  },
};

export default function EmailPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<EmailFormValues>();
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  // Internal implementation detail.
  const onSend = async (values: EmailFormValues) => {
    setSending(true);
    try {
      await emailApi.sendEmail({ to: values.to, subject: values.subject, body: values.body });
      message.success('发送成功，请查收邮件');
      form.resetFields();
    } catch {
      // Internal implementation detail.
    } finally {
      setSending(false);
    }
  };

  // Internal implementation detail.
  const onTest = async () => {
    setTesting(true);
    try {
      await emailApi.emailTest();
      message.success('测试配置成功，请检查消息');
    } catch {
      // Internal implementation detail.
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card title="邮件发送">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="请先在 .env 中配置邮件服务，保存后即可发送测试邮件。"
      />
      <Form<EmailFormValues>
        form={form}
        layout="vertical"
        style={{ maxWidth: 560 }}
        onFinish={(values) => void onSend(values)}
      >
        <Form.Item
          name="to"
          label="收件人"
          rules={[{ required: true, message: '请输入收件人地址' }, toValidator]}
          extra="多个地址请使用英文逗号分隔"
        >
          <Input placeholder="例如：someone@example.com" maxLength={255} />
        </Form.Item>
        <Form.Item
          name="subject"
          label="主题"
          rules={[{ required: true, message: '请输入邮件主题' }]}
        >
          <Input placeholder="请输入邮件主题" maxLength={128} />
        </Form.Item>
        <Form.Item
          name="body"
          label="正文"
          rules={[{ required: true, message: '请输入邮件正文' }]}
        >
          <Input.TextArea placeholder="请输入邮件正文" rows={8} maxLength={2000} showCount />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending}>
              发送邮件
            </Button>
            <Button icon={<ThunderboltOutlined />} loading={testing} onClick={() => void onTest()}>
              测试邮件配置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
