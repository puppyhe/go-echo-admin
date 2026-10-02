import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Form, Modal, Select, Space, Spin, TreeSelect, Typography } from 'antd';
import type { SysUser } from '../../../domain/user';
import type { Department, Position } from '../../org/types';
import { userOrganizationApi, type UserMemberships } from './api';
import { canAssignOrganization, membershipDepartmentTree, membershipInput } from './model';

export function UserOrganizationModal({
  user,
  initial,
  onClose,
  onSaved,
}: {
  user: SysUser;
  initial: UserMemberships;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ departmentIds: number[]; positionIds: number[] }>();
  const [current, setCurrent] = useState(initial);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [positionLoading, setPositionLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const positionRequest = useRef(0);
  const loadRequest = useRef(0);
  const readPositions = useCallback(async (query: string, nextPage: number) => {
    const requestId = ++positionRequest.current;
    setPositionLoading(true);
    try {
      const result = await userOrganizationApi.positions({
        page: nextPage,
        pageSize: 50,
        keyword: query,
      });
      if (requestId !== positionRequest.current) return;
      setPositions((previous) => (nextPage === 1 ? result.list : [...previous, ...result.list]));
      setPage(nextPage);
      setTotal(result.total);
    } catch (cause) {
      if (requestId === positionRequest.current)
        setError(cause instanceof Error ? cause.message : '请求失败');
      throw cause;
    } finally {
      if (requestId === positionRequest.current) setPositionLoading(false);
    }
  }, []);
  const load = useCallback(async () => {
    const sequence = ++loadRequest.current;
    setLoading(true);
    setReady(false);
    setError('');
    try {
      const [memberships, tree] = await Promise.all([
        userOrganizationApi.list([user.ID]),
        userOrganizationApi.departments(),
        readPositions('', 1),
      ]);
      if (sequence !== loadRequest.current) return;
      const row = memberships.list.find((item) => item.userId === user.ID);
      if (!row) throw new Error('用户信息加载失败');
      setCurrent(row);
      form.setFieldsValue(membershipInput(row.departmentIds, row.positionIds));
      setDepartments(tree.list);
      setKeyword('');
      if (!row.canManage) throw new Error('权限不足');
      setReady(true);
    } catch (cause) {
      if (sequence === loadRequest.current)
        setError(cause instanceof Error ? cause.message : '用户组织信息加载失败');
    } finally {
      if (sequence === loadRequest.current) setLoading(false);
    }
  }, [form, readPositions, user.ID]);
  useEffect(() => {
    void load();
    return () => {
      positionRequest.current++;
      loadRequest.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!keyword) return;
    const timer = window.setTimeout(() => {
      void readPositions(keyword, 1).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keyword, readPositions]);
  const options = new Map([...current.positions, ...positions].map((item) => [item.id, item]));
  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    setError('');
    try {
      await userOrganizationApi.save(
        user.ID,
        membershipInput(values.departmentIds ?? [], values.positionIds ?? []),
      );
      message.success('用户组织信息保存成功');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={`组织信息 · ${user.nickName || user.userName}`}
      width={640}
      maskClosable={false}
      confirmLoading={saving}
      okText="保存信息"
      onOk={() => void save()}
      okButtonProps={{ disabled: loading || !ready || !current.canManage }}
      onCancel={() => {
        if (!saving) onClose();
      }}
      cancelButtonProps={{ disabled: saving }}
    >
      <Spin spinning={loading}>
        <Alert
          type="info"
          showIcon
          message="更新用户部门信息"
          description="禁用的用户仅可保留或移除已有部门与岗位，新建需先启用用户。请选择用户信息。"
          style={{ marginBottom: 16 }}
        />
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            action={
              <Button size="small" onClick={() => void load()} disabled={saving || loading}>
                重试
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          disabled={loading || saving}
          initialValues={membershipInput(initial.departmentIds, initial.positionIds)}
        >
          <Form.Item label="所属部门" name="departmentIds">
            <TreeSelect
              multiple
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder="请选择部门，可多选"
              treeData={membershipDepartmentTree(
                departments,
                current.departmentIds,
                user.enable === 1,
              )}
              treeDefaultExpandAll
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="所属岗位" name="positionIds">
            <Select
              mode="multiple"
              allowClear
              showSearch
              filterOption={false}
              placeholder="搜索名称或编码"
              loading={positionLoading}
              onSearch={(value) => {
                setKeyword(value);
                if (!value) void readPositions('', 1).catch(() => undefined);
              }}
              options={[...options.values()].map((item) => ({
                value: item.id,
                label: `${item.name}${item.code ? `（${item.code}）` : ''}${item.status ? '' : ' · 已禁用'}`,
                disabled: !canAssignOrganization(item, current.positionIds, user.enable === 1),
              }))}
              popupRender={(menu) => (
                <>
                  {menu}
                  {positions.length < total && (
                    <Button
                      block
                      type="text"
                      loading={positionLoading}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void readPositions(keyword, page + 1).catch(() => undefined)}
                    >
                      加载更多
                    </Button>
                  )}
                </>
              )}
            />
          </Form.Item>
        </Form>
        <Space>
          <Typography.Text type="secondary">用户 ID：{user.ID}</Typography.Text>
          {user.enable !== 1 && <Typography.Text type="warning">已禁用</Typography.Text>}
        </Space>
      </Spin>
    </Modal>
  );
}
