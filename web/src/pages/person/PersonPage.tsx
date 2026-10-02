import { useEffect, useState } from 'react';
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { userApi } from '../../api/endpoints';
import { session } from '../../api/request';
import { useAuth } from '../../auth/AuthContext';
import type { SysUser } from '../../domain/user';
import './person.css';

interface ProfileFormValues {
  nickName: string;
  phone: string;
  email: string;
}

interface PasswordFormValues {
  password: string;
  newPassword: string;
  confirmPassword: string;
}

function display(value: string | number | undefined | null): string {
  return value === undefined || value === null || String(value).trim() === '' ? '未设置' : String(value);
}

function roleName(user: SysUser): string {
  return user.authority?.authorityName || user.authorities?.[0]?.authorityName || '暂无角色';
}

export default function PersonPage() {
  const { message } = App.useApp();
  const { user, loadSession } = useAuth();
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const tenant = session.getTenant();

  useEffect(() => {
    // The profile modal uses destroyOnHidden. Wait until it is mounted before
    // touching its Form instance, otherwise Ant Design reports a disconnected
    // useForm warning during the initial page render.
    if (profileOpen && user) {
      profileForm.setFieldsValue({ nickName: user.nickName, phone: user.phone, email: user.email });
    }
  }, [profileForm, profileOpen, user]);

  if (!user) return null;

  const profileFields = [user.nickName, user.phone, user.email];
  const profileCompletion = Math.round(
    (profileFields.filter((value) => String(value || '').trim()).length / profileFields.length) * 100,
  );

  const openProfile = () => {
    setProfileOpen(true);
  };

  const saveProfile = async (values: ProfileFormValues) => {
    setSavingProfile(true);
    try {
      await userApi.setSelfInfo({
        nickName: values.nickName.trim(),
        phone: values.phone.trim(),
        email: values.email.trim(),
      });
      const fresh = await loadSession();
      session.setSnapshot(fresh);
      setProfileOpen(false);
      message.success('个人资料已更新');
    } catch {
      // 请求错误由统一请求层提示。
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (values: PasswordFormValues) => {
    setChangingPassword(true);
    try {
      await userApi.changePassword({ password: values.password, newPassword: values.newPassword });
      passwordForm.resetFields();
      setPasswordOpen(false);
      session.clear();
      message.success('密码已修改，请重新登录');
      window.location.assign('/login');
    } catch {
      // 请求错误由统一请求层提示。
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="profile-container">
      <Card className="profile-hero" styles={{ body: { padding: 0 } }}>
        <div className="profile-cover">
          <div className="profile-cover-pattern" aria-hidden="true" />
          <div className="profile-cover-copy">
            <span>账户中心</span>
            <small>管理个人资料、登录安全和租户信息</small>
          </div>
        </div>
        <div className="profile-summary">
          <Avatar size={112} src={user.headerImg || undefined} icon={<UserOutlined />} className="profile-avatar" />
          <div className="profile-identity">
            <div className="profile-name-row">
              <div>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {display(user.nickName || user.userName)}
                </Typography.Title>
                <Typography.Text type="secondary">{user.userName}</Typography.Text>
              </div>
              <Button type="primary" icon={<EditOutlined />} onClick={openProfile}>编辑资料</Button>
            </div>
            <Space wrap size={8} className="profile-meta">
              <Tag color="blue">{roleName(user)}</Tag>
              <Tag color={user.enable === 1 ? 'success' : 'default'}>{user.enable === 1 ? '已启用' : '已停用'}</Tag>
              <Typography.Text type="secondary">用户 ID：{user.ID}</Typography.Text>
              {tenant && <Tag className="profile-tenant-tag">租户：{tenant.name || tenant.code}</Tag>}
            </Space>
            <div className="profile-completion">
              <div className="profile-completion-label">
                <Typography.Text type="secondary">资料完整度</Typography.Text>
                <Typography.Text strong>{profileCompletion}%</Typography.Text>
              </div>
              <Progress percent={profileCompletion} showInfo={false} size="small" status={profileCompletion === 100 ? 'success' : 'active'} />
            </div>
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="基本信息" className="profile-card">
            <Descriptions column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label={<><UserOutlined /> 用户名</>}>{display(user.userName)}</Descriptions.Item>
              <Descriptions.Item label="昵称">{display(user.nickName)}</Descriptions.Item>
              <Descriptions.Item label={<><PhoneOutlined /> 手机号</>}>{display(user.phone)}</Descriptions.Item>
              <Descriptions.Item label={<><MailOutlined /> 邮箱</>}>{display(user.email)}</Descriptions.Item>
              <Descriptions.Item label="当前角色">{roleName(user)}</Descriptions.Item>
              <Descriptions.Item label="所属租户">{display(tenant?.name || tenant?.code)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title={<Space><SafetyCertificateOutlined />账号安全</Space>} className="profile-card">
            <div className="security-item">
              <div>
                <Space size={8}><CheckCircleOutlined className="security-ok" /><Typography.Text strong>登录密码</Typography.Text></Space>
                <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>定期修改密码可以提升账号安全性</Typography.Paragraph>
              </div>
              <Button type="link" icon={<LockOutlined />} onClick={() => setPasswordOpen(true)}>修改密码</Button>
            </div>
            <div className="security-item security-item-secondary">
              <div>
                <Space size={8}><ClockCircleOutlined className="security-muted" /><Typography.Text strong>当前会话</Typography.Text></Space>
                <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>当前账号正在安全地使用此租户</Typography.Paragraph>
              </div>
              <Tag color="success">正常</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Modal title="编辑个人资料" open={profileOpen} onCancel={() => setProfileOpen(false)} onOk={() => profileForm.submit()} confirmLoading={savingProfile} destroyOnHidden>
        <Form form={profileForm} layout="vertical" onFinish={(values) => void saveProfile(values)} style={{ marginTop: 16 }}>
          <Form.Item name="nickName" label="昵称" rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}>
            <Input maxLength={32} placeholder="请输入昵称" />
          </Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ pattern: /^$|^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}>
            <Input maxLength={11} placeholder="请输入手机号" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入正确的邮箱' }]}>
            <Input maxLength={64} placeholder="请输入邮箱" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="修改登录密码" open={passwordOpen} onCancel={() => { setPasswordOpen(false); passwordForm.resetFields(); }} onOk={() => passwordForm.submit()} confirmLoading={changingPassword} destroyOnHidden>
        <Form form={passwordForm} layout="vertical" onFinish={(values) => void changePassword(values)} style={{ marginTop: 16 }}>
          <Form.Item name="password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password autoComplete="current-password" placeholder="请输入当前密码" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 8, message: '密码至少需要 8 个字符' }]}>
            <Input.Password autoComplete="new-password" placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" dependencies={['newPassword']} rules={[{ required: true, message: '请再次输入新密码' }, ({ getFieldValue }) => ({ validator: (_, value) => value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')) })]}>
            <Input.Password autoComplete="new-password" placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
