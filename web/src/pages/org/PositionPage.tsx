import { useCallback, useEffect, useRef, useState } from 'react';
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
  Pagination,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tag,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { orgApi } from './api';
import type { Position } from './types';
import MembersPanel from './MembersPanel';
import './org.css';
export default function PositionPage() {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<Position[]>([]);
  const [selected, setSelected] = useState<Position | null>(null);
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<Position>();
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await orgApi.positions({ page, pageSize: 20, keyword });
      if (current !== serial.current) return;
      setItems(data.list ?? []);
      setTotal(data.total);
      setSelected(
        (previous) =>
          data.list.find((row) => row.id === previous?.id) ?? previous ?? data.list[0] ?? null,
      );
      if (!data.list.length && page > 1) setPage(Math.max(1, Math.ceil(data.total / 20)));
    } catch (e) {
      if (current === serial.current) setLoadError(e instanceof Error ? e.message : '数据加载失败');
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [page, keyword]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  const select = (row: Position) => {
    if (row.id === selected?.id) return;
    const run = () => {
      setSelected(row);
      setDirty(false);
    };
    if (dirty)
      modal.confirm({
        title: '切换岗位？',
        content: '当前岗位的修改尚未保存，切换后将丢失。',
        okText: '放弃修改',
        onOk: run,
      });
    else run();
  };
  const edit = (row: Position | null) => {
    setEditing(row);
    setSaveError('');
    form.resetFields();
    form.setFieldsValue(row ?? { name: '', code: '', sort: 0, status: true, remark: '' });
    setOpen(true);
  };
  const save = async () => {
    let values: Position;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const row = await orgApi.savePosition({
        ...(editing ? { id: editing.id } : {}),
        name: values.name.trim(),
        code: values.code?.trim() ?? '',
        sort: values.sort ?? 0,
        status: values.status,
        remark: values.remark ?? '',
      });
      setOpen(false);
      message.success(editing ? '岗位更新成功' : '岗位新建成功');
      setSelected((previous) => (previous?.id === row.id || !dirty ? row : previous));
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (row: Position) => {
    await orgApi.remove('positions', row.id);
    if (selected?.id === row.id) {
      setSelected(null);
      setDirty(false);
    }
    message.success('删除成功');
    await load();
  };
  return (
    <div className="org-workspace">
      <Card
        title="岗位列表"
        className="org-list-card"
        extra={
          <Space size={4}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
              新建岗位
            </Button>
            <Button
              icon={<ReloadOutlined />}
              aria-label="刷新岗位"
              loading={loading}
              onClick={() => void load()}
            />
          </Space>
        }
      >
        <Input.Search
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) {
              setKeyword('');
              setPage(1);
            }
          }}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
          allowClear
          placeholder="搜索名称或编码"
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
          <div className="org-position-list" role="list" aria-label="岗位列表">
            {items.map((row) => (
              <div
                key={row.id}
                className={`org-position-item${row.id === selected?.id ? ' selected' : ''}`}
              >
                <button
                  className="org-position-select"
                  onClick={() => select(row)}
                  title={`${row.name}（${row.code}）`}
                  aria-pressed={row.id === selected?.id}
                >
                  {row.name}
                  {row.code && <span>（{row.code}）</span>}
                  {!row.status && <Tag>禁用</Tag>}
                </button>
                <Space size={0}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label={`编辑${row.name}`}
                    onClick={() => edit(row)}
                  />
                  <Popconfirm title={`删除岗位「${row.name}」？`} onConfirm={() => remove(row)}>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除${row.name}`}
                    />
                  </Popconfirm>
                </Space>
              </div>
            ))}
            {!loading && !items.length && (
              <Empty description="暂无岗位" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        </Spin>
        {total > 20 && (
          <Pagination
            size="small"
            simple
            current={page}
            total={total}
            pageSize={20}
            onChange={setPage}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>
      {selected ? (
        <MembersPanel
          key={`positions:${selected.id}`}
          kind="positions"
          target={selected}
          onDirtyChange={setDirty}
        />
      ) : (
        <Card>
          <Empty description="请选择或新建岗位" />
        </Card>
      )}
      <Drawer
        title={editing ? '编辑岗位' : '新建岗位'}
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
            label="名称"
            name="name"
            rules={[{ required: true, whitespace: true, message: '请输入名称' }]}
          >
            <Input maxLength={100} placeholder="请输入名称" />
          </Form.Item>
          <Form.Item label="编码" name="code">
            <Input maxLength={100} placeholder="请输入编码" />
          </Form.Item>
          <Form.Item label="排序" name="sort">
            <InputNumber precision={0} />
          </Form.Item>
          <Form.Item label="状态" name="status" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
