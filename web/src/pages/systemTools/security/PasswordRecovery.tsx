import { useState } from 'react';
import { Alert, App, Button, Form, Input, Space, Typography } from 'antd';
import { userApi } from '../../../api/endpoints';
import type { PasswordStatus } from './api';
import { passwordError, passwordRuleText } from './model';

export function PasswordRecovery({
  status,
  onComplete,
  onCancel,
}: {
  status: PasswordStatus;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert type="warning" showIcon message="需要更新密码" description={status.reason} />
      <Typography.Text type="secondary">{passwordRuleText(status.rules)}</Typography.Text>
      <Form
        layout="vertical"
        disabled={saving}
        onFinish={async (values: { password: string; newPassword: string }) => {
          setSaving(true);
          setError('');
          try {
            await userApi.changePassword({
              password: values.password,
              newPassword: values.newPassword,
            });
            message.success('密码已更新，请重新登录。');
            onComplete();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '密码更新失败');
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item
          name="password"
          label="当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          dependencies={['password']}
          rules={[
            ({ getFieldValue }) => ({
              validator: (_, value: string = '') => {
                const issue =
                  passwordError(value, status.rules) ||
                  (value === getFieldValue('password') ? '两次输入的密码不一致' : undefined);
                return issue ? Promise.reject(new Error(issue)) : Promise.resolve();
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请确认新密码' },
            ({ getFieldValue }) => ({
              validator: (_, value: string) =>
                value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的密码不一致')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>
            更新密码
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </Space>
      </Form>
    </Space>
  );
}
