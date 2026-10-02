import { useSuperAdmin } from '../../auth/useSuperAdmin';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Role management, resource permissions and customer data-scope configuration.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { authorityService } from '../../services/authorityService';
import type { SysAuthority } from '../../domain/authority';
import AuthorityMenusDrawer from './AuthorityMenusDrawer';
import AuthorityApisDrawer from './AuthorityApisDrawer';
import AuthorityUsersDrawer from './AuthorityUsersDrawer';
import AuthorityDataDrawer from './AuthorityDataDrawer';
import { DataScopePanel } from './dataScope/DataScopePanel';

// Internal implementation detail.
type DialogMode = 'create' | 'child' | 'edit' | 'copy';

interface AuthorityFormValues {
  authorityId?: number;
  authorityName?: string;
  defaultRouter?: string;
}

// Internal implementation detail.
function validateAuthorityId(_: unknown, value: number | null | undefined): Promise<void> {
  if (value === null || value === undefined || !Number.isInteger(value) || value <= 0) {
    return Promise.reject(new Error('请输入角色 ID'));
  }
  return Promise.resolve();
}

export default function AuthorityPage() {
  const { message } = App.useApp();
  const canWrite = useSuperAdmin();

  const [treeData, setTreeData] = useState<SysAuthority[]>([]);
  // Internal implementation detail.
  const [flatList, setFlatList] = useState<SysAuthority[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [modalRow, setModalRow] = useState<SysAuthority | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<AuthorityFormValues>();

  const [menusOpen, setMenusOpen] = useState(false);
  const [configTab, setConfigTab] = useState('menus');
  const [usersOpen, setUsersOpen] = useState(false);
  const [drawerAuthority, setDrawerAuthority] = useState<SysAuthority | null>(null);

  // Internal implementation detail.
  const loadList = useCallback(() => {
    setLoading(true);
    authorityService
      .listAll()
      .then((list) => {
        const flat: SysAuthority[] = [];
        const walk = (items: SysAuthority[]) => {
          items.forEach((item) => {
            flat.push(item);
            if (item.children?.length) walk(item.children);
          });
        };
        walk(list ?? []);
        // Internal implementation detail.
        const seen = new Set<number>();
        const copies: SysAuthority[] = [];
        flat.forEach((item) => {
          if (seen.has(item.authorityId)) return;
          seen.add(item.authorityId);
          copies.push({ ...item, children: [] });
        });
        const byId = new Map<number, SysAuthority>(copies.map((item) => [item.authorityId, item]));
        const roots: SysAuthority[] = [];
        copies.forEach((copy) => {
          const parentId = copy.parentId ?? 0;
          const parent = parentId !== 0 ? byId.get(parentId) : undefined;
          if (parent && parent !== copy) parent.children.push(copy);
          else roots.push(copy);
        });
        setFlatList(copies);
        setDrawerAuthority((current) =>
          current
            ? (copies.find((item) => item.authorityId === current.authorityId) ?? current)
            : null,
        );
        setTreeData(roots);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Internal implementation detail.
  const openDialog = (mode: DialogMode, row: SysAuthority | null) => {
    setDialogMode(mode);
    setModalRow(row);
    setModalOpen(true);
  };

  // Initialize the form after the modal has mounted. Calling Form methods while
  // the destroy-on-hidden modal is still closed produces an Ant Design warning
  // and can leave the instance disconnected from its Form element.
  useEffect(() => {
    if (!modalOpen) return;
    form.resetFields();
    if (dialogMode === 'create') {
      form.setFieldsValue({ authorityId: undefined, authorityName: '', defaultRouter: '' });
    } else if (dialogMode === 'child') {
      form.setFieldsValue({ authorityId: undefined, authorityName: '' });
    } else if (modalRow) {
      if (dialogMode === 'edit') {
        form.setFieldsValue({
          authorityId: modalRow.authorityId,
          authorityName: modalRow.authorityName,
          defaultRouter: modalRow.defaultRouter ?? '',
        });
      } else {
        form.setFieldsValue({ authorityId: modalRow.authorityId, authorityName: modalRow.authorityName });
      }
    }
  }, [dialogMode, form, modalOpen, modalRow]);

  const submitForm = async () => {
    if (!canWrite) return;
    let values: AuthorityFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validationerrordocumentationformdocumentation
    }
    const newAuthorityId = Number(values.authorityId ?? 0);
    setSubmitting(true);
    try {
      if (dialogMode === 'create') {
        await authorityService.create({
          authorityId: newAuthorityId,
          authorityName: values.authorityName ?? '',
          parentId: 0,
        });
        message.success('添加成功！');
      } else if (dialogMode === 'child' && modalRow) {
        await authorityService.create({
          authorityId: newAuthorityId,
          authorityName: values.authorityName ?? '',
          parentId: modalRow.authorityId,
        });
        message.success('添加成功！');
      } else if (dialogMode === 'edit' && modalRow) {
        await authorityService.update({
          ...modalRow,
          children: [],
          dataAuthorityId: modalRow.dataAuthorityId ?? [],
          authorityName: values.authorityName ?? '',
          defaultRouter: values.defaultRouter ?? '',
        });
        message.success('编辑成功');
      } else if (dialogMode === 'copy' && modalRow) {
        // Internal implementation detail.
        await authorityService.copy({
          authority: {
            ...modalRow,
            authorityId: newAuthorityId,
            authorityName: values.authorityName ?? '',
            children: [],
            dataAuthorityId: modalRow.dataAuthorityId ?? [],
          },
          oldAuthorityId: modalRow.authorityId,
        });
        message.success('复制成功！');
      }
      setModalOpen(false);
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setSubmitting(false);
    }
  };

  // Internal implementation detail.
  const onDelete = async (row: SysAuthority) => {
    if (!canWrite) return;
    setSubmitting(true);
    try {
      await authorityService.remove(row.authorityId);
      message.success('删除成功！');
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setSubmitting(false);
    }
  };

  const openMenusDrawer = (row: SysAuthority) => {
    setDrawerAuthority(row);
    setConfigTab('menus');
    setMenusOpen(true);
  };

  const modalTitle = {
    create: '新建角色',
    child: '新建子角色',
    edit: '编辑角色',
    copy: '复制角色',
  }[dialogMode];

  const parentLabel = useMemo(() => {
    if (dialogMode === 'create') return '根角色（0）';
    if (dialogMode === 'child' && modalRow)
      return `${modalRow.authorityName}（${modalRow.authorityId}）`;
    const parentId = modalRow?.parentId ?? 0;
    if (parentId === 0) return '根角色（0）';
    const parent = flatList.find((item) => item.authorityId === parentId);
    return parent ? `${parent.authorityName}（${parentId}）` : `角色（${parentId}）`;
  }, [dialogMode, modalRow, flatList]);

  const columns: TableColumnsType<SysAuthority> = [
    { title: '角色 ID', dataIndex: 'authorityId', width: 180 },
    { title: '角色名称', dataIndex: 'authorityName' },
    {
      title: '数据权限',
      width: 130,
      render: (_: unknown, row: SysAuthority) => (
        <Button
          type="link"
          size="small"
          onClick={() => {
            setDrawerAuthority(row);
            setConfigTab('scope');
            setMenusOpen(true);
          }}
        >
          查看 / 配置
        </Button>
      ),
    },
    {
      title: '默认路由',
      dataIndex: 'defaultRouter',
      width: 220,
      render: (value: string) => value || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 460,
      fixed: 'right',
      render: (_: unknown, row: SysAuthority) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => openMenusDrawer(row)}
          >
            菜单权限
          </Button>
          <Button
            type="link"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => {
              setDrawerAuthority(row);
              setUsersOpen(true);
            }}
          >
            用户
          </Button>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            disabled={!canWrite}
            onClick={() => openDialog('child', row)}
          >
            新建子角色
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            disabled={!canWrite}
            onClick={() => openDialog('copy', row)}
          >
            复制
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            disabled={!canWrite}
            onClick={() => openDialog('edit', row)}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除此角色吗？" onConfirm={() => void onDelete(row)}>
            <Button type="link" size="small" danger disabled={!canWrite} icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Alert
        type="info"
        showIcon
        message={
          canWrite
            ? '角色管理支持创建、编辑角色，并配置菜单、API 和数据权限。'
            : '当前账号仅可查看角色，不能编辑角色。'
        }
        style={{ marginBottom: 16 }}
      />
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canWrite}
          onClick={() => openDialog('create', null)}
        >
          新建角色
        </Button>
        <Button icon={<ReloadOutlined />} onClick={loadList} />
      </div>
      <Table<SysAuthority>
        rowKey="authorityId"
        columns={columns}
        dataSource={treeData}
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={modalTitle}
        open={modalOpen}
        onOk={() => void submitForm()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okButtonProps={{ disabled: !canWrite }}
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="上级角色">
            <Input disabled value={parentLabel} />
          </Form.Item>
          <Form.Item
            name="authorityId"
            label="角色 ID"
            rules={[
              { required: true, message: '请输入角色 ID' },
              { validator: validateAuthorityId },
            ]}
          >
            <InputNumber
              min={1}
              precision={0}
              style={{ width: '100%' }}
              disabled={dialogMode === 'edit'}
              placeholder="请输入角色 ID"
            />
          </Form.Item>
          <Form.Item
            name="authorityName"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input maxLength={20} placeholder="请输入角色名称" />
          </Form.Item>
          {dialogMode === 'edit' && (
            <Form.Item
              name="defaultRouter"
              label="默认路由"
              extra="登录后进入的路由名称，通常选择仪表盘。"
            >
              <Input placeholder="请输入默认路由名称" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer
        title={`角色配置 · ${drawerAuthority?.authorityName ?? ''}`}
        getContainer={() => document.body}
        open={menusOpen}
        onClose={() => setMenusOpen(false)}
        width={800}
        destroyOnHidden
      >
        <Tabs
          activeKey={configTab}
          onChange={setConfigTab}
          destroyOnHidden
          items={[
            {
              key: 'menus',
              label: '菜单权限',
              children: (
                <AuthorityMenusDrawer
                  embedded
                  open={menusOpen && configTab === 'menus'}
                  authority={drawerAuthority}
                  onClose={() => setMenusOpen(false)}
                  onSuccess={loadList}
                />
              ),
            },
            {
              key: 'apis',
              label: 'API 权限',
              children: (
                <AuthorityApisDrawer
                  embedded
                  open={menusOpen && configTab === 'apis'}
                  authority={drawerAuthority}
                  onClose={() => setMenusOpen(false)}
                />
              ),
            },
            {
              key: 'scope',
              label: '数据权限',
              children: drawerAuthority && (
                <DataScopePanel
                  key={drawerAuthority.authorityId}
                  authorityId={drawerAuthority.authorityId}
                />
              ),
            },
            {
              key: 'data',
              label: '角色数据权限',
              children: (
                <AuthorityDataDrawer
                  embedded
                  open={menusOpen && configTab === 'data'}
                  authority={drawerAuthority}
                  onClose={() => setMenusOpen(false)}
                  onSuccess={loadList}
                />
              ),
            },
          ]}
        />
      </Drawer>
      <AuthorityUsersDrawer
        open={usersOpen}
        authority={drawerAuthority}
        onClose={() => setUsersOpen(false)}
      />
    </Card>
  );
}
