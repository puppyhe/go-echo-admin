import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tree,
  TreeSelect,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { orgApi } from './api';
import { departmentParentOptions, filterDepartments, flattenDepartments } from './model';
import type { Department, OrgUser } from './types';
import LeaderSelect from './LeaderSelect';
import MembersPanel from './MembersPanel';
import './org.css';

export default function DepartmentPage() {
  const { message, modal } = App.useApp();
  const [tree, setTree] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [leader, setLeader] = useState<OrgUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<Department>();
  const serial = useRef(0);
  const all = useMemo(() => flattenDepartments(tree), [tree]);
  const selected = all.find((row) => row.id === selectedId);
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await orgApi.departments();
      if (current !== serial.current) return;
      setTree(result.list ?? []);
      const flat = flattenDepartments(result.list ?? []);
      setSelectedId((id) => (flat.some((item) => item.id === id) ? id : flat[0]?.id));
    } catch (e) {
      if (current === serial.current) setLoadError(e instanceof Error ? e.message : '部门加载失败');
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  const select = (id: number) => {
    if (id === selectedId) return;
    const run = () => {
      setSelectedId(id);
      setDirty(false);
    };
    if (dirty)
      modal.confirm({
        title: '切换部门？',
        content: '当前部门的修改尚未保存，切换后将丢失。',
        okText: '放弃修改',
        onOk: run,
      });
    else run();
  };
  const edit = (row: Department | null, parentId = 0) => {
    setEditing(row);
    setLeader(row?.leader ?? null);
    setSaveError('');
    form.resetFields();
    form.setFieldsValue(
      row
        ? { ...row, parentId: row.parentId ?? 0 }
        : { name: '', parentId, leaderId: null, sort: 0, status: true },
    );
    setOpen(true);
  };
  const save = async () => {
    let values: Department;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const result = await orgApi.saveDepartment({
        ...(editing ? { id: editing.id } : {}),
        name: values.name.trim(),
        parentId: values.parentId || null,
        leaderId: values.leaderId || null,
        sort: values.sort ?? 0,
        status: values.status,
      });
      message.success(editing ? '部门更新成功' : '部门新建成功');
      setOpen(false);
      await load();
      if (!dirty) setSelectedId(result.id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (row: Department) => {
    await orgApi.remove('departments', row.id);
    if (selectedId === row.id) setDirty(false);
    message.success('部门删除成功');
    await load();
  };
  const nodes = (items: Department[]): DataNode[] =>
    items.map((item) => ({
      key: item.id,
      title: (
        <div className="org-tree-title">
          <span className={item.status ? '' : 'org-disabled'}>
            {item.name}
            {!item.status && <small> 已禁用</small>}
          </span>
          <Space className="org-tree-actions" size={0} onClick={(event) => event.stopPropagation()}>
            <Button
              type="text"
              size="small"
              aria-label={`新增「${item.name}」的子部门`}
              icon={<PlusOutlined />}
              onClick={() => edit(null, item.id)}
            />
            <Button
              type="text"
              size="small"
              aria-label={`编辑「${item.name}」`}
              icon={<EditOutlined />}
              onClick={() => edit(item)}
            />
            <Popconfirm
              title={`删除部门「${item.name}」？`}
              description="该部门及其子部门将一并删除。"
              onConfirm={() => remove(item)}
            >
              <Button
                type="text"
                size="small"
                danger
                aria-label={`删除「${item.name}」`}
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Space>
        </div>
      ),
      children: nodes(item.children ?? []),
    }));
  return (
    <div className="org-workspace">
      <Card
        title="部门列表"
        className="org-list-card"
        extra={
          <Space size={4}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
              新建部门
            </Button>
            <Button
              icon={<ReloadOutlined />}
              aria-label="刷新部门"
              loading={loading}
              onClick={() => void load()}
            />
          </Space>
        }
      >
        <Input.Search
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          placeholder="搜索部门"
        />
        {loadError && (
          <Alert
            type="error"
            showIcon
            message={loadError}
            action={
              <Button size="small" onClick={() => void load()}>
                重试
              </Button>
            }
            style={{ marginTop: 16 }}
          />
        )}
        <Spin spinning={loading}>
          <div className="org-tree">
            {tree.length ? (
              <Tree
                blockNode
                showLine
                defaultExpandAll
                key={`${all.map((item) => item.id).join(',')}:${query}`}
                treeData={nodes(filterDepartments(tree, query))}
                selectedKeys={selectedId ? [selectedId] : []}
                onSelect={(keys) => {
                  if (keys[0]) select(Number(keys[0]));
                }}
              />
            ) : (
              !loading && <Empty description="暂无部门" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        </Spin>
      </Card>
      {selected ? (
        <MembersPanel
          key={`departments:${selected.id}`}
          kind="departments"
          target={selected}
          onDirtyChange={setDirty}
        />
      ) : (
        <Card>
          <Empty description="请选择或新建部门" />
        </Card>
      )}
      <Drawer
        title={editing ? '编辑部门' : '新建部门'}
        getContainer={() => document.body}
        width="min(640px, 100vw)"
        open={open}
        closable={false}
        maskClosable={!saving}
        keyboard={!saving}
        onClose={() => setOpen(false)}
        extra={
          <Space>
            <Button disabled={saving} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              确定
            </Button>
          </Space>
        }
      >
        {saveError && (
          <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} />
        )}
        <Form
          form={form}
          labelCol={{ style: { width: 100 } }}
          wrapperCol={{ flex: 1 }}
          disabled={saving}
        >
          <Form.Item
            label="上级部门"
            name="parentId"
            rules={[{ required: true, message: '请选择部门' }]}
          >
            <TreeSelect
              showSearch
              treeNodeFilterProp="title"
              treeDefaultExpandAll
              treeData={[
                { value: 0, title: '根部门' },
                ...departmentParentOptions(tree, editing?.id),
              ]}
              placeholder="请选择部门"
            />
          </Form.Item>
          <Form.Item
            label="部门名称"
            name="name"
            rules={[{ required: true, whitespace: true, message: '请输入部门名称' }]}
          >
            <Input maxLength={100} placeholder="请输入部门名称" />
          </Form.Item>
          <Form.Item label="负责人" name="leaderId">
            <LeaderSelect
              key={open ? `leader:${editing?.id ?? 'new'}` : 'closed'}
              selected={leader}
              onUserChange={setLeader}
              disabled={saving}
            />
          </Form.Item>
          <Form.Item label="手机号">
            <Input value={leader?.phone ?? ''} disabled placeholder="请选择负责人" />
          </Form.Item>
          <Form.Item label="邮箱">
            <Input value={leader?.email ?? ''} disabled placeholder="请选择负责人" />
          </Form.Item>
          <Form.Item label="排序" name="sort">
            <InputNumber precision={0} />
          </Form.Item>
          <Form.Item label="状态" name="status" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
