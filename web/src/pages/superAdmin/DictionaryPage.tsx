// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Splitter,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import type { SysDictionary } from '../../domain/dictionary';
import { clearDictionaryCache } from '../../features/dictionary/useDictionary';
import { dictionaryApi } from './dictionary/api';
import { dictionaryParentOptions } from './dictionary/model';
import DictionaryDetailsPanel from './dictionary/DictionaryDetailsPanel';
import './dictionary/dictionary.css';

export default function DictionaryPage() {
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<SysDictionary[]>([]);
  const [selectedId, setSelectedId] = useState(Number(params.get('sysDictionaryID')) || 0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SysDictionary | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<SysDictionary>();
  const importInput = useRef<HTMLInputElement>(null);
  const serial = useRef(0);
  const screens = Grid.useBreakpoint();
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await dictionaryApi.list();
      if (current !== serial.current) return;
      setItems(data);
      setSelectedId((id) => (data.some((row) => row.ID === id) ? id : (data[0]?.ID ?? 0)));
    } catch (e) {
      if (current === serial.current) setLoadError(e instanceof Error ? e.message : '字典加载失败');
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
  useEffect(() => {
    const id = Number(params.get('sysDictionaryID'));
    if (Number.isSafeInteger(id) && id > 0) setSelectedId(id);
  }, [params]);
  const selected = items.find((item) => item.ID === selectedId);
  const visible = items.filter((item) =>
    `${item.name} ${item.type}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const parentOptions = useMemo(
    () =>
      dictionaryParentOptions(items, editing?.ID).map((item) => ({
        value: item.value,
        label: item.title,
      })),
    [items, editing],
  );
  const select = (ID: number) => {
    setSelectedId(ID);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('sysDictionaryID', String(ID));
        return next;
      },
      { replace: true },
    );
  };
  const edit = (item: SysDictionary | null) => {
    setEditing(item);
    setSaveError('');
    form.resetFields();
    form.setFieldsValue(
      item ?? { name: '', type: '', description: '', status: true, parentID: null },
    );
    setOpen(true);
  };
  const save = async () => {
    let values: SysDictionary;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await dictionaryApi.save({
        ...values,
        name: values.name.trim(),
        type: values.type.trim(),
        parentID: values.parentID || null,
        ...(editing ? { ID: editing.ID } : {}),
      });
      clearDictionaryCache();
      setOpen(false);
      message.success(editing ? '字典更新成功' : '字典创建成功');
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (item: SysDictionary) => {
    await dictionaryApi.remove(item.ID);
    clearDictionaryCache(item.type);
    message.success('字典删除成功');
    await load();
  };
  const download = async (item: SysDictionary) => {
    try {
      const data = await dictionaryApi.export(item.ID);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `dictionary_${item.type.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* Request layer reports errors. */
    }
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('请选择不超过 5 MB 的字典 JSON 文件');
      const data: unknown = JSON.parse(await file.text());
      if (
        !data ||
        typeof data !== 'object' ||
        !('type' in data) ||
        typeof data.type !== 'string' ||
        !data.type.trim()
      )
        throw new Error('字典 JSON 必须包含 type 字段');
      modal.confirm({
        title: '导入字典',
        content: `确认导入 ${data.type}？同类型字典将被更新。`,
        onOk: async () => {
          await dictionaryApi.import(data);
          clearDictionaryCache();
          message.success('字典导入成功');
          await load();
        },
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : '字典文件无效');
    }
  };
  return (
    <div className="dictionary-workspace">
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button onClick={() => void load()}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Splitter layout={screens.md ? 'horizontal' : 'vertical'} className="dictionary-splitter">
        <Splitter.Panel defaultSize={320} min={240} max={screens.md ? '50%' : undefined}>
          <Card
            title="字典列表"
            className="dictionary-list-card"
            extra={
              <Space size={4}>
                <Tooltip title="导入字典">
                  <Button
                    aria-label="导入字典"
                    icon={<UploadOutlined />}
                    onClick={() => importInput.current?.click()}
                  />
                </Tooltip>
                <Tooltip title="新建字典">
                  <Button
                    type="primary"
                    aria-label="新建字典"
                    icon={<PlusOutlined />}
                    onClick={() => edit(null)}
                  />
                </Tooltip>
                <Button
                  aria-label="刷新字典"
                  icon={<ReloadOutlined />}
                  loading={loading}
                  onClick={() => void load()}
                />
              </Space>
            }
          >
            <Input.Search
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              allowClear
              placeholder="搜索字典名称或类型"
            />
            <input
              type="file"
              accept="application/json,.json"
              hidden
              ref={importInput}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
              }}
            />
            <Spin spinning={loading}>
              <div className="dictionary-list" role="list" aria-label="字典列表">
                {visible.map((item) => (
                  <div
                    key={item.ID}
                    className={`dictionary-list-item${item.ID === selectedId ? ' selected' : ''}${item.parentID ? ' child' : ''}`}
                  >
                    <button
                      className="dictionary-select"
                      title={`${item.name}（${item.type}）`}
                      onClick={() => select(item.ID)}
                      aria-pressed={item.ID === selectedId}
                    >
                      {item.name}
                      <span>（{item.type}）</span>
                      {item.status === false && <Tag>停用</Tag>}
                    </button>
                    <Space size={0}>
                      <Button
                        type="text"
                        size="small"
                        aria-label={`export${item.name}`}
                        icon={<DownloadOutlined />}
                        onClick={() => void download(item)}
                      />
                      <Button
                        type="text"
                        size="small"
                        aria-label={`edit${item.name}`}
                        icon={<EditOutlined />}
                        onClick={() => edit(item)}
                      />
                      <Popconfirm
                        title={`确认删除字典「${item.name}」吗？`}
                        onConfirm={() => remove(item)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          aria-label={`delete${item.name}`}
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </Space>
                  </div>
                ))}
                {!loading && !visible.length && (
                  <Empty description="暂无字典" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            </Spin>
          </Card>
        </Splitter.Panel>
        <Splitter.Panel min={screens.md ? 360 : undefined}>
          {selected ? (
            <DictionaryDetailsPanel key={selected.ID} dictionary={selected} />
          ) : (
            <Card>
              <Empty description="请选择或新建一个字典" />
            </Card>
          )}
        </Splitter.Panel>
      </Splitter>
      <Drawer
        title={editing ? '编辑字典' : '新建字典'}
        getContainer={() => document.body}
        width="min(640px, 100vw)"
        open={open}
        onClose={() => setOpen(false)}
        closable={false}
        maskClosable={!saving}
        keyboard={!saving}
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
          <Form.Item label="父级字典" name="parentID">
            <Select
              allowClear
              showSearch
              optionFilterProp="label="
              options={parentOptions}
              placeholder="请选择父级字典（可选）"
            />
          </Form.Item>
          <Form.Item
            label="字典名称"
            name="name"
            rules={[{ required: true, whitespace: true, message: '请输入字典名称' }]}
          >
            <Input maxLength={255} placeholder="请输入字典名称" />
          </Form.Item>
          <Form.Item
            label="字典类型"
            name="type"
            rules={[{ required: true, whitespace: true, message: '请输入字典类型' }]}
          >
            <Input maxLength={255} placeholder="请输入字典类型，例如：性别" />
          </Form.Item>
          <Form.Item label="状态" name="status" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input placeholder="请输入字典描述" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
