import { Form, Input } from 'antd';
import { validateAdminPassword, validateTenantCode } from './model';

export function TenantCreateFields() {
  return (
    <>
      <Form.Item
        name="name"
        label="租户名称"
        rules={[{ required: true, whitespace: true, max: 100 }]}
      >
        <Input placeholder="例如：华东运营中心" autoComplete="off" />
      </Form.Item>
      <Form.Item
        name="code"
        label="租户编码"
        extra="仅支持小写字母、数字和短横线，用于租户登录入口。"
        rules={[
          { required: true },
          {
            validator: async (_, value: string) => validateTenantCode(value || ''),
          },
        ]}
      >
        <Input placeholder="例如：east-office" autoComplete="off" />
      </Form.Item>
      <Form.Item
        name="adminPassword"
        label="租户管理员初始密码"
        extra="至少 12 位，登录后可在个人中心修改。"
        rules={[
          { required: true },
          {
            validator: async (_, value: string) => validateAdminPassword(value || ''),
          },
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
    </>
  );
}
