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
  Switch,
  Table,
  Tag,
  TreeSelect,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { SysDictionary, SysDictionaryDetail } from '../../../domain/dictionary';
import { clearDictionaryCache } from '../../../features/dictionary/useDictionary';
import { dictionaryApi } from './api';
import { detailParentOptions, detailPayload, filterDetailTree } from './model';

export default function DictionaryDetailsPanel({ dictionary }: { dictionary: SysDictionary }) {
  const { message } = App.useApp();
  const [tree, setTree] = useState<SysDictionaryDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SysDictionaryDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form] = Form.useForm<SysDictionaryDetail>();
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const data = await dictionaryApi.tree(dictionary.ID);
      if (current === serial.current) setTree(data);
    } catch (e) {
      if (current === serial.current) setError(e instanceof Error ? e.message : '加载字典失败');
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [dictionary.ID]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  const visible = useMemo(() => filterDetailTree(tree, query), [tree, query]);
  const options = useMemo(
    () => [{ value: 0, title: '根节点（无父级）' }, ...detailParentOptions(tree, editing?.ID)],
    [tree, editing],
  );
  const edit = (row: SysDictionaryDetail | null, parentID = 0) => {
    setEditing(row);
    setSaveError('');
    form.resetFields();
    form.setFieldsValue(
      row
        ? { ...row, parentID: row.parentID || 0 }
        : { parentID, status: true, sort: 0, label: '', value: '', extend: '' },
    );
    setOpen(true);
  };
  const save = async () => {
    let values: SysDictionaryDetail;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await dictionaryApi.saveDetail(detailPayload(values, dictionary.ID, editing?.ID));
      clearDictionaryCache(dictionary.type);
      message.success(editing ? '字典项更新成功' : '字典项新增成功');
      setOpen(false);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (row: SysDictionaryDetail) => {
    await dictionaryApi.removeDetail(row.ID);
    clearDictionaryCache(dictionary.type);
    message.success('字典项删除成功');
    await load();
  };
  return (
    <>
      <Card
        className="dictionary-detail-card"
        title="字典项列表"
        extra={
          <Space wrap>
            <Input.Search
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标签"
              allowClear
              style={{ width: 220 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
              新增字典项
            </Button>
            <Button
              icon={<ReloadOutlined />}
              aria-label="刷新字典项"
              loading={loading}
              onClick={() => void load()}
            />
          </Space>
        }
      >
        <div className="dictionary-current">
          {dictionary.name}（{dictionary.type}）
          {dictionary.description && <span> · {dictionary.description}</span>}
        </div>
        {dictionary.status === false && (
          <Alert
            type="warning"
            showIcon
            message="该字典已停用，启用后才会生效。"
            style={{ marginBottom: 12 }}
          />
        )}
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            action={
              <Button size="small" onClick={() => void load()}>
                重试
              </Button>
            }
            style={{ marginBottom: 12 }}
          />
        )}
        <Table<SysDictionaryDetail>
          rowKey="ID"
          loading={loading}
          dataSource={visible}
          pagination={false}
          scroll={{ x: 840 }}
          expandable={{ defaultExpandAllRows: true }}
          key={`${dictionary.ID}:${query}:${tree.map((n) => n.ID).join(',')}`}
          locale={{ emptyText: <Empty description={query ? '未找到匹配的字典项' : '暂无数据'} /> }}
          columns={[
            { title: '标签', dataIndex: 'label', width: 170 },
            { title: '字典值', dataIndex: 'value', width: 110 },
            { title: '扩展值', dataIndex: 'extend', width: 110, ellipsis: true },
            { title: '层级', dataIndex: 'level', width: 70 },
            {
              title: '启用状态',
              dataIndex: 'status',
              width: 100,
              render: (status, row) => (
                <Tag color={status && !row.disabled ? 'success' : 'default'}>
                  {status ? (row.disabled ? '禁用' : '启用') : '禁用'}
                </Tag>
              ),
            },
            { title: '排序', dataIndex: 'sort', width: 90 },
            {
              title: '操作',
              key: 'actions',
              fixed: 'right',
              width: 255,
              render: (_, row) => (
                <Space size={0}>
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => edit(null, row.ID)}
                  >
                    新增子项
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => edit(row)}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除该字典项吗？"
                    description="删除后不可恢复。"
                    onConfirm={() => remove(row)}
                  >
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Drawer
        title={editing ? '编辑字典项' : '新增字典项'}
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
          labelCol={{ style: { width: 110 } }}
          wrapperCol={{ flex: 1 }}
          disabled={saving}
        >
          <Form.Item label="父级节点" name="parentID">
            <TreeSelect
              treeData={options}
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
              placeholder="请选择父级节点"
            />
          </Form.Item>
          <Form.Item
            label="标签"
            name="label"
            rules={[{ required: true, whitespace: true, message: '请输入标签' }]}
          >
            <Input maxLength={255} placeholder="请输入标签" />
          </Form.Item>
          <Form.Item
            label="字典值"
            name="value"
            rules={[{ required: true, message: '请输入字典值' }]}
          >
            <Input maxLength={255} placeholder="文本、数字或编码" />
          </Form.Item>
          <Form.Item label="扩展值" name="extend">
            <Input placeholder="请输入扩展值" />
          </Form.Item>
          <Form.Item label="启用状态" name="status" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item label="排序" name="sort" rules={[{ required: true, message: '请输入排序' }]}>
            <InputNumber precision={0} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
