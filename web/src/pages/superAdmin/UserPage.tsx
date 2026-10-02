import { AuthenticatedAvatar } from '../../features/upload/AuthenticatedAsset';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// User administration, role assignment and organization memberships.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntApp,
  Alert,
  Avatar,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, UserOutlined } from '@ant-design/icons';
import CrudPage, { type CrudPageHandle } from '../../features/crud/CrudPage';
import { f } from '../../features/crud/fieldRenderers';
import type { CrudField } from '../../features/crud/fieldRenderers';
import { authorityService } from '../../services/authorityService';
import { userService } from '../../services/userService';
import type { RegisterPayload, SysUser } from '../../domain/user';
import { fileUrl } from '../../api/request';
import ImageUpload from '../../features/upload/ImageUpload';
import type { PageInfo, PageResult } from '../../types';
import { userOrganizationApi } from './userOrganization/api';
import {
  attachMemberships,
  membershipFailureState,
  type MembershipResult,
} from './userOrganization/model';
import { UserOrganizationModal } from './userOrganization/UserOrganizationModal';
import { securityApi, type PasswordRules } from '../systemTools/security/api';
import {
  generatePolicyPassword,
  passwordError,
  passwordRuleText,
  securityPreset,
} from '../systemTools/security/model';
type UserRow = SysUser & MembershipResult;

// Internal implementation detail.

// Internal implementation detail.
const ENABLE_OPTIONS = [
  { label: '启用', value: 1, color: 'success' },
  { label: '禁用', value: 2, color: 'error' },
];

// Internal implementation detail.
const ENABLE_FORM_OPTIONS = ENABLE_OPTIONS.map((item) => ({
  label: item.label,
  value: item.value,
}));

// Internal implementation detail.
const PHONE_PATTERN = /^1([38][0-9]|4[014-9]|[59][0-35-9]|6[2567]|7[0-8])\d{8}$/;
// Internal implementation detail.
const EMAIL_PATTERN = /^([0-9A-Za-z\-_.]+)@([0-9a-z]+\.[a-z]{2,3}(\.[a-z]{2})?)$/;

// Internal implementation detail.

// Internal implementation detail.
interface UserFormValues {
  userName: string;
  password?: string;
  nickName: string;
  headerImg: string;
  phone?: string;
  email?: string;
  authorityIds: number[];
  enable: number;
}

interface UserFormModalProps {
  open: boolean;
  // Internal implementation detail.
  editing: SysUser | null;
  // Internal implementation detail.
  authOptions: { label: string; value: number }[];
  onClose: () => void;
  onSuccess: () => void;
}

function UserFormModal({ open, editing, authOptions, onClose, onSuccess }: UserFormModalProps) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<UserFormValues>();
  const [submitting, setSubmitting] = useState(false);

  // Internal implementation detail.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        userName: editing.userName,
        nickName: editing.nickName,
        headerImg: editing.headerImg,
        phone: editing.phone,
        email: editing.email,
        authorityIds: (editing.authorities ?? []).map((item) => item.authorityId),
        enable: editing.enable,
      });
    } else {
      form.resetFields();
    }
  }, [open, editing, form]);

  const onOk = async () => {
    let values: UserFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // 校验失败：错误信息由表单展示
    }
    const authorityIds = values.authorityIds || [];
    setSubmitting(true);
    try {
      if (editing) {
        // Internal implementation detail.
        await userService.update({
          ID: editing.ID,
          userName: values.userName,
          nickName: values.nickName,
          headerImg: values.headerImg || '',
          phone: values.phone ?? '',
          email: values.email ?? '',
          enable: values.enable,
          authorityIds,
        });
        message.success('编辑成功');
      } else {
        // Internal implementation detail.
        const payload: RegisterPayload = {
          userName: values.userName,
          passWord: values.password ?? '',
          nickName: values.nickName,
          headerImg: values.headerImg || '',
          authorityId: authorityIds[0],
          authorityIds,
          enable: values.enable,
          phone: values.phone ?? '',
          email: values.email ?? '',
        };
        await userService.register(payload);
        message.success('创建成功');
      }
      onSuccess();
    } catch {
      // Internal implementation detail.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={editing ? '编辑用户' : '新建用户'}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={() => void onOk()}>
            确定
          </Button>
        </Space>
      }
      width="min(800px, 92vw)"
      getContainer={() => document.body}
      styles={{ body: { overflowY: 'auto' } }}
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
        initialValues={{ enable: 1, authorityIds: [], headerImg: '' }}
      >
        <Form.Item
          name="userName"
          label="用户名"
          // Internal implementation detail.
          rules={
            editing
              ? []
              : [
                  { required: true, message: '请输入用户名' },
                  { min: 5, message: '用户名至少5个字符' },
                ]
          }
        >
          <Input placeholder="请输入用户名" maxLength={64} disabled={Boolean(editing)} />
        </Form.Item>
        {!editing && (
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="请输入密码" maxLength={72} />
          </Form.Item>
        )}
        <Form.Item name="nickName" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
          <Input placeholder="请输入昵称" maxLength={64} />
        </Form.Item>
        <Form.Item
          name="phone"
          label="手机号"
          rules={[{ pattern: PHONE_PATTERN, message: '请输入正确的手机号' }]}
        >
          <Input placeholder="请输入正确的手机号" maxLength={20} />
        </Form.Item>
        <Form.Item
          name="email"
          label="邮箱"
          rules={[{ pattern: EMAIL_PATTERN, message: '请输入正确的邮箱' }]}
        >
          <Input placeholder="请输入正确的邮箱" maxLength={64} />
        </Form.Item>
        <Form.Item
          name="authorityIds"
          label="用户角色"
          rules={[{ required: true, type: 'array', message: '请选择用户角色' }]}
        >
          <Select
            mode="multiple"
            options={authOptions}
            placeholder="请选择用户角色"
            allowClear
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item name="headerImg" label="头像">
          <ImageUpload />
        </Form.Item>
        <Form.Item
          name="enable"
          label="启用状态"
          rules={[{ required: true, message: '请选择启用状态' }]}
        >
          <Select options={ENABLE_FORM_OPTIONS} placeholder="请选择启用状态" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// Internal implementation detail.

interface ResetPasswordModalProps {
  open: boolean;
  user: SysUser | null;
  onClose: () => void;
}

function ResetPasswordModal({ open, user, onClose }: ResetPasswordModalProps) {
  const { message } = AntApp.useApp();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordRules, setPasswordRules] = useState<PasswordRules>(
    () => securityPreset(0).password,
  );

  // Internal implementation detail.
  useEffect(() => {
    if (open) {
      setPassword('');
      void securityApi
        .status()
        .then((status) => setPasswordRules(status.rules))
        .catch(() => undefined);
    }
  }, [open]);

  // Internal implementation detail.
  const generateRandomPassword = () => {
    const next = generatePolicyPassword(passwordRules);
    setPassword(next);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(next)
        .then(() => message.success('复制成功'))
        .catch(() => message.error('复制失败，请手动复制'));
    }
  };

  const onOk = async () => {
    // Internal implementation detail.
    const issue = passwordError(password, passwordRules);
    if (issue) {
      message.warning(issue);
      return;
    }
    if (password.length < 6) {
      message.warning('请输入至少 6 位密码');
      return;
    }
    if (!user) return;
    setSubmitting(true);
    try {
      await userService.resetPassword(user.ID, password);
      message.success('重置成功');
      onClose();
    } catch {
      // Internal implementation detail.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="重置密码"
      open={open}
      onOk={() => void onOk()}
      onCancel={onClose}
      confirmLoading={submitting}
      okText="确定"
      cancelText="取消"
      width={480}
      maskClosable={false}
      keyboard={false}
    >
      <Form layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="用户名">
          <Input value={user?.userName ?? ''} disabled />
        </Form.Item>
        <Form.Item label="用户昵称">
          <Input value={user?.nickName ?? ''} disabled />
        </Form.Item>
        <Form.Item label="密码" required extra={passwordRuleText(passwordRules)}>
          <Space.Compact style={{ width: '100%' }}>
            <Input.Password
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              maxLength={72}
            />
            <Button onClick={generateRandomPassword}>复制</Button>
          </Space.Compact>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Internal implementation detail.

export default function UserPage() {
  const { message } = AntApp.useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SysUser | null>(null);
  const [resetUser, setResetUser] = useState<SysUser | null>(null);
  // Internal implementation detail.
  const [authOptions, setAuthOptions] = useState<{ label: string; value: number }[]>([]);
  const crud = useRef<CrudPageHandle>(null);
  const [pendingRows, setPendingRows] = useState<number[]>([]);
  const [organizationUser, setOrganizationUser] = useState<UserRow | null>(null);

  useEffect(() => {
    void authorityService
      .listAll()
      .then((list) =>
        setAuthOptions(
          list.map((item) => ({ label: item.authorityName, value: item.authorityId })),
        ),
      )
      .catch(() => undefined);
  }, []);

  const list = useCallback(async (pageInfo: PageInfo): Promise<PageResult<UserRow>> => {
    // Internal implementation detail.
    const query: Record<string, unknown> = { orderKey: 'id', desc: true };
    if (pageInfo.userName) query.username = pageInfo.userName;
    if (pageInfo.nickName) query.nickname = pageInfo.nickName;
    if (pageInfo.phone) query.phone = pageInfo.phone;
    if (pageInfo.email) query.email = pageInfo.email;
    const users = await userService.page({
      page: pageInfo.page,
      pageSize: pageInfo.pageSize,
      ...query,
    });
    if (!users.list.length) return { ...users, list: [] };
    try {
      const organizations = await userOrganizationApi.list(users.list.map((row) => row.ID));
      return { ...users, list: attachMemberships(users.list, organizations.list) };
    } catch (error) {
      return { ...users, list: attachMemberships(users.list, [], membershipFailureState(error)) };
    }
  }, []);

  const openCreateUser = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEditUser = (row: SysUser) => {
    setEditing(row);
    setFormOpen(true);
  };

  // Internal implementation detail.
  const toggleEnable = async (row: SysUser) => {
    setPendingRows((ids) => [...ids, row.ID]);
    const enable = row.enable === 2 ? 1 : 2;
    try {
      await userService.update({
        ID: row.ID,
        nickName: row.nickName,
        headerImg: row.headerImg || '',
        phone: row.phone,
        email: row.email,
        enable,
      });
      message.success(`${enable === 2 ? '禁用' : '启用'}成功`);
      crud.current?.reload();
    } catch {
      // Internal implementation detail.
    } finally {
      setPendingRows((ids) => ids.filter((id) => id !== row.ID));
    }
  };

  const setRowAuthorities = async (row: SysUser, authorityIds: number[]) => {
    if (!authorityIds.length) {
      message.warning('请至少保留一个用户角色');
      return;
    }
    setPendingRows((ids) => [...ids, row.ID]);
    try {
      await userService.setAuthorities(row.ID, authorityIds);
      message.success('角色更新成功');
      crud.current?.reload();
    } catch {
      // Internal implementation detail.
    } finally {
      setPendingRows((ids) => ids.filter((id) => id !== row.ID));
    }
  };

  const fields = useMemo<CrudField[]>(
    () => [
      f('headerImg', '头像', {
        inForm: false,
        inTable: { width: 75 },
        render: (value) => (
          <AuthenticatedAvatar src={String(value ?? '')} icon={<UserOutlined />} />
        ),
      }),
      f('ID', 'ID', { inForm: false, inTable: { width: 70 } }),
      f('userName', '用户名', { inFilter: true, inForm: false, inTable: { width: 150 } }),
      f('nickName', '昵称', { inFilter: true, inForm: false, inTable: { width: 150 } }),
      ...(['departments', 'positions'] as const).map((key) =>
        f(key, key === 'departments' ? '部门' : '职位', {
          inForm: false,
          inTable: { width: 190 },
          render: (_value, record) => {
            const row = record as unknown as UserRow;
            if (row.organizationState !== 'ready')
              return (
                <Typography.Text type="secondary">
                  {row.organizationState === 'forbidden' ? '无权限' : '加载失败'}
                </Typography.Text>
              );
            const items = row.organization?.[key] ?? [];
            return items.length ? (
              <Space size={[0, 4]} wrap>
                {items.map((item) => (
                  <Tag key={item.id} color={item.status ? 'blue' : undefined}>
                    {item.name}
                    {item.status ? '' : '（已禁用）'}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">暂无数据</Typography.Text>
            );
          },
        }),
      ),
      f('phone', '手机号', { inFilter: true, inForm: false, inTable: { width: 160 } }),
      f('email', '邮箱', { inFilter: true, inForm: false, inTable: { width: 190 } }),
      f('authorities', '用户角色', {
        inForm: false,
        inTable: { width: 240 },
        render: (_value, record) => {
          const row = record as unknown as SysUser;
          return (
            <Select
              mode="multiple"
              maxTagCount={1}
              style={{ width: 220 }}
              optionFilterProp="label"
              options={authOptions}
              value={row.authorities.map((role) => role.authorityId)}
              disabled={pendingRows.includes(row.ID)}
              onChange={(ids) => void setRowAuthorities(row, ids)}
            />
          );
        },
      }),
      f('enable', '启用状态', {
        inForm: false,
        inTable: { width: 100 },
        render: (_value, record) => {
          const row = record as unknown as SysUser;
          return (
            <Switch
              checked={row.enable === 1}
              loading={pendingRows.includes(row.ID)}
              onChange={() => void toggleEnable(row)}
            />
          );
        },
      }),
    ],
    [authOptions, pendingRows],
  );

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="说明：角色可在列表中直接调整"
        style={{ marginBottom: 16 }}
      />
      <CrudPage<UserRow>
        actionRef={crud}
        fields={fields}
        list={list}
        remove={(row) => userService.remove(row.ID)}
        rowActions={(row) => (
          <>
            <Button type="link" size="small" onClick={() => openEditUser(row)}>
              编辑
            </Button>
            {row.organization?.canManage && (
              <Button type="link" size="small" onClick={() => setOrganizationUser(row)}>
                组织
              </Button>
            )}
            <Button type="link" size="small" onClick={() => setResetUser(row)}>
              重置密码
            </Button>
          </>
        )}
        extraToolbar={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateUser}>
            新建用户
          </Button>
        }
      />
      <UserFormModal
        open={formOpen}
        editing={editing}
        authOptions={authOptions}
        onClose={() => setFormOpen(false)}
        onSuccess={() => {
          setFormOpen(false);
          crud.current?.reload();
        }}
      />
      {organizationUser?.organization && (
        <UserOrganizationModal
          key={organizationUser.ID}
          user={organizationUser}
          initial={organizationUser.organization}
          onClose={() => setOrganizationUser(null)}
          onSaved={() => {
            setOrganizationUser(null);
            crud.current?.reload();
          }}
        />
      )}
      <ResetPasswordModal
        open={resetUser !== null}
        user={resetUser}
        onClose={() => setResetUser(null)}
      />
    </>
  );
}
