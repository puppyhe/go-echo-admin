import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { orgApi } from './api';
import { canChooseMember, sameMembers, updateMemberSelection } from './model';
import type { MemberTarget, OrgKind, OrgUser } from './types';

/** Mount with key=kind:id. Candidate paging must never reload the saved membership. */
export default function MembersPanel({
  kind,
  target,
  onDirtyChange,
}: {
  kind: OrgKind;
  target: MemberTarget;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({ username: '', nickName: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [usersError, setUsersError] = useState('');
  const memberSerial = useRef(0);
  const userSerial = useRef(0);
  const dirty = !sameMembers(selected, saved);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  const loadMembers = useCallback(async () => {
    const current = ++memberSerial.current;
    setLoadingMembers(true);
    setReady(false);
    setMembersError('');
    try {
      const data = await orgApi.members(kind, target.id);
      if (current !== memberSerial.current) return;
      setSelected(data.userIds ?? []);
      setSaved(data.userIds ?? []);
      setReady(true);
    } catch (e) {
      if (current === memberSerial.current)
        setMembersError(e instanceof Error ? e.message : '数据加载失败');
    } finally {
      if (current === memberSerial.current) setLoadingMembers(false);
    }
  }, [kind, target.id]);
  const loadUsers = useCallback(async () => {
    const current = ++userSerial.current;
    setLoadingUsers(true);
    setUsersError('');
    try {
      const data = await orgApi.users({ page, pageSize, ...filters });
      if (current !== userSerial.current) return;
      setUsers(data.list ?? []);
      setTotal(data.total);
      if (!data.list.length && page > 1) setPage(Math.max(1, Math.ceil(data.total / pageSize)));
    } catch (e) {
      if (current === userSerial.current)
        setUsersError(e instanceof Error ? e.message : '用户加载失败');
    } finally {
      if (current === userSerial.current) setLoadingUsers(false);
    }
  }, [page, pageSize, filters]);
  useEffect(() => {
    void loadMembers();
    return () => {
      memberSerial.current++;
    };
  }, [loadMembers]);
  useEffect(() => {
    void loadUsers();
    return () => {
      userSerial.current++;
    };
  }, [loadUsers]);
  const save = async () => {
    if (!ready || saving) return;
    const ids = [...selected];
    setSaving(true);
    setMembersError('');
    try {
      await orgApi.saveMembers(kind, target.id, ids);
      setSaved(ids);
      message.success(`「${target.name}」已保存`);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  const refresh = () => {
    const run = () => {
      void loadMembers();
      void loadUsers();
    };
    if (dirty)
      modal.confirm({
        title: '确认刷新？',
        content: '未保存的修改将会丢失。',
        onOk: run,
      });
    else run();
  };
  return (
    <Card
      title={`「${target.name}」成员管理`}
      className="org-member-card"
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            aria-label="刷新"
            disabled={saving}
            onClick={refresh}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!ready || loadingMembers || !dirty}
            onClick={() => void save()}
          >
            保存
          </Button>
        </Space>
      }
    >
      {!target.status && (
        <Alert
          type="warning"
          showIcon
          message={`该${kind === 'departments' ? '部门' : '岗位'}已禁用，无法编辑成员。`}
          style={{ marginBottom: 16 }}
        />
      )}
      {membersError && (
        <Alert
          type="error"
          showIcon
          message={membersError}
          action={
            !ready ? (
              <Button size="small" onClick={() => void loadMembers()}>
                重试
              </Button>
            ) : undefined
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Form
        form={form}
        layout="inline"
        className="org-member-search"
        onFinish={(values) => {
          setPage(1);
          setFilters({
            username: values.username?.trim() ?? '',
            nickName: values.nickName?.trim() ?? '',
          });
        }}
      >
        <Form.Item label="用户名" name="username">
          <Input allowClear placeholder="请输入用户名" />
        </Form.Item>
        <Form.Item label="昵称" name="nickName">
          <Input allowClear placeholder="请输入昵称" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
              查询
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                form.resetFields();
                setPage(1);
                setFilters({ username: '', nickName: '' });
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
      <div className="org-members-summary">
        <Typography.Text type="secondary">
          已选择 {selected.length} 项 · 翻页保留选中
        </Typography.Text>
        {dirty && <Tag color="processing">未保存</Tag>}
      </div>
      {usersError && (
        <Alert
          type="error"
          showIcon
          message={usersError}
          action={
            <Button size="small" onClick={() => void loadUsers()}>
              重试
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Table<OrgUser>
        rowKey="id"
        dataSource={users}
        loading={loadingMembers || loadingUsers}
        scroll={{ x: 520 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 90 },
          {
            title: '用户名',
            dataIndex: 'username',
            render: (value, row) => (
              <>
                {value}
                {row.enable !== 1 && <Tag style={{ marginLeft: 8 }}>已禁用</Tag>}
              </>
            ),
          },
          { title: '昵称', dataIndex: 'nickName' },
        ]}
        rowSelection={{
          selectedRowKeys: selected,
          preserveSelectedRowKeys: true,
          getCheckboxProps: (row) => ({
            disabled: !ready || saving || loadingMembers || !canChooseMember(row, selected),
          }),
          onSelect: (row, checked) =>
            setSelected((current) => updateMemberSelection(current, [row.id], checked)),
          onSelectAll: (checked, _rows, changedRows) =>
            setSelected((current) =>
              updateMemberSelection(
                current,
                changedRows.map((row) => row.id),
                checked,
              ),
            ),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 30, 50, 100],
          showQuickJumper: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (next, size) => {
            setPage(size !== pageSize ? 1 : next);
            setPageSize(size);
          },
        }}
      />
    </Card>
  );
}
