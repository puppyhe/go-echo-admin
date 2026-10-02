import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import {
  notificationManagementApi,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationTemplate,
  type TemplateInput,
} from './managementApi';
import { categories, channels, utf8Length, validateTemplateVariables } from './managementModel';
import TemplatePreview from './TemplatePreview';
import './management.css';
function VariableRow({
  index,
  form,
  remove,
}: {
  index: number;
  form: FormInstance;
  remove: () => void;
}) {
  const type = Form.useWatch(['variables', index, 'type'], form) ?? 'string';
  return (
    <div className="notification-variable-row">
      <Form.Item
        label="变量名"
        name={[index, 'name']}
        rules={[
          { required: true, pattern: /^[A-Za-z][A-Za-z0-9_]{0,49}$/, message: '请输入变量名' },
        ]}
      >
        <Input placeholder="例如：name" maxLength={50} />
      </Form.Item>
      <Form.Item label="类型" name={[index, 'type']} rules={[{ required: true }]}>
        <Select
          options={['string', 'number', 'boolean'].map((value) => ({ value, label: value }))}
          onChange={(value) =>
            form.setFieldValue(
              ['variables', index, 'example'],
              value === 'number' ? 0 : value === 'boolean' ? false : '',
            )
          }
        />
      </Form.Item>
      <Form.Item label="必填" name={[index, 'required']} valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item label="示例" name={[index, 'example']}>
        {type === 'number' ? (
          <InputNumber style={{ width: '100%' }} />
        ) : type === 'boolean' ? (
          <Select
            options={[
              { label: 'true', value: true },
              { label: 'false', value: false },
            ]}
          />
        ) : (
          <Input />
        )}
      </Form.Item>
      <Button
        danger
        type="text"
        icon={<DeleteOutlined />}
        aria-label={`删除变量${index + 1}`}
        onClick={remove}
      />
    </div>
  );
}
export function TemplatesPanel() {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<NotificationTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{
    q?: string;
    category?: NotificationCategory;
    type?: NotificationChannel;
  }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [preview, setPreview] = useState<{ template: TemplateInput; allowTest: boolean } | null>(
    null,
  );
  const [form] = Form.useForm<TemplateInput>();
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const data = await notificationManagementApi.templates({ page, pageSize, ...filters });
      if (current !== serial.current) return;
      setRows(data.list ?? []);
      setTotal(data.total);
      if (!data.list.length && page > 1) setPage(Math.max(1, Math.ceil(data.total / pageSize)));
    } catch (e) {
      if (current === serial.current) setError(e instanceof Error ? e.message : '模板加载失败');
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [page, pageSize, filters]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  const edit = (row: NotificationTemplate | null) => {
    setEditing(row);
    setSaveError('');
    form.resetFields();
    form.setFieldsValue(
      row ?? {
        code: '',
        name: '',
        category: 'system',
        titleTemplate: '',
        bodyTemplate: '',
        variables: [],
        channels: ['inbox'],
        description: '',
        enabled: true,
        version: 0,
      },
    );
    setOpen(true);
  };
  const values = async (): Promise<TemplateInput | null> => {
    try {
      const value = await form.validateFields();
      if ((value.variables ?? []).length > 40) throw new Error('最多 40 个变量');
      validateTemplateVariables(
        value.variables ?? [],
        `${value.titleTemplate}\n${value.bodyTemplate}`,
      );
      return {
        ...value,
        code: value.code.trim(),
        name: value.name.trim(),
        variables: value.variables ?? [],
        version: editing?.version ?? 0,
        ...(editing ? { id: editing.id } : {}),
      };
    } catch (e) {
      if (e instanceof Error) setSaveError(e.message);
      return null;
    }
  };
  const save = async () => {
    const data = await values();
    if (!data) return;
    setSaving(true);
    setSaveError('');
    try {
      await notificationManagementApi.saveTemplate(data);
      message.success('模板保存成功');
      setOpen(false);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Card>
        <div className="notification-management-toolbar">
          <Space wrap>
            <Input.Search
              placeholder="搜索模板名称/编码"
              allowClear
              style={{ width: 240 }}
              onSearch={(q) => {
                setPage(1);
                setFilters((value) => ({ ...value, q }));
              }}
            />
            <Select
              placeholder="全部分类"
              allowClear
              style={{ width: 140 }}
              options={categories}
              value={filters.category}
              onChange={(category) => {
                setPage(1);
                setFilters((value) => ({ ...value, category }));
              }}
            />
            <Select
              placeholder="所有渠道"
              allowClear
              style={{ width: 140 }}
              options={channels}
              value={filters.type}
              onChange={(type) => {
                setPage(1);
                setFilters((value) => ({ ...value, type }));
              }}
            />
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>
              新建模板
            </Button>
          </Space>
        </div>
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
            style={{ marginBottom: 16 }}
          />
        )}
        <Table<NotificationTemplate>
          rowKey="id"
          dataSource={rows}
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 30, 50, 100],
            showQuickJumper: true,
            showTotal: (value) => `共 ${value} 条`,
            onChange: (next, size) => {
              setPage(size === pageSize ? next : 1);
              setPageSize(size);
            },
          }}
          columns={[
            { title: '名称', dataIndex: 'name', width: 160 },
            { title: '编码', dataIndex: 'code', width: 180 },
            {
              title: '分类',
              dataIndex: 'category',
              width: 110,
              render: (value) => categories.find((item) => item.value === value)?.label ?? value,
            },
            {
              title: '渠道',
              dataIndex: 'channels',
              width: 220,
              render: (values: NotificationChannel[]) => (
                <Space size={0} wrap>
                  {values.map((value) => (
                    <Tag key={value}>
                      {channels.find((item) => item.value === value)?.label ?? value}
                    </Tag>
                  ))}
                </Space>
              ),
            },
            {
              title: '状态',
              dataIndex: 'enabled',
              width: 80,
              render: (value) => (
                <Tag color={value ? 'success' : 'default'}>{value ? '已启用' : '已禁用'}</Tag>
              ),
            },
            { title: '版本', dataIndex: 'version', width: 70 },
            {
              title: '操作',
              key: 'actions',
              width: 220,
              fixed: 'right',
              render: (_, row) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => edit(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setPreview({ template: row, allowTest: true })}
                  >
                    预览/测试
                  </Button>
                  <Popconfirm
                    title={`确认删除模板「${row.name}」？`}
                    onConfirm={async () => {
                      await notificationManagementApi.deleteTemplate(row.id);
                      message.success('模板删除成功');
                      await load();
                    }}
                  >
                    <Button type="link" danger size="small">
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
        title={editing ? '编辑模板' : '新建模板'}
        forceRender
        width="min(840px, 100vw)"
        open={open}
        onClose={() => setOpen(false)}
        closable={false}
        keyboard={!saving}
        maskClosable={!saving}
        extra={
          <Space>
            <Button disabled={saving} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={saving}
              icon={<EyeOutlined />}
              onClick={async () => {
                const data = await values();
                if (data) setPreview({ template: data, allowTest: false });
              }}
            >
              预览
            </Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              保存
            </Button>
          </Space>
        }
        getContainer={() => document.body}
      >
        {saveError && (
          <Alert
            type="error"
            showIcon
            message={saveError}
            description="模板版本已变更，保存后将生效。"
            action={
              editing ? (
                <Button
                  disabled={saving}
                  size="small"
                  onClick={() =>
                    modal.confirm({
                      title: '确认重新编辑模板？',
                      content: '保存编辑内容后生效。',
                      onOk: async () => edit(await notificationManagementApi.template(editing.id)),
                    })
                  }
                >
                  刷新编辑
                </Button>
              ) : undefined
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={form} layout="vertical" disabled={saving}>
          <div className="notification-form-columns">
            <Form.Item
              label="模板名称"
              name="name"
              rules={[{ required: true, whitespace: true, message: '请输入模板名称' }]}
            >
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item
              label="模板编码"
              name="code"
              rules={[
                {
                  required: true,
                  pattern: /^[a-zA-Z][a-zA-Z0-9_.-]{0,99}$/,
                  message: '编码仅限字母、数字、下划线',
                },
              ]}
            >
              <Input maxLength={100} disabled={editing !== null} />
            </Form.Item>
          </div>
          <div className="notification-form-columns">
            <Form.Item label="分类" name="category" rules={[{ required: true }]}>
              <Select options={categories} />
            </Form.Item>
            <Form.Item label="启用状态" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </div>
          <Form.Item
            label="渠道"
            name="channels"
            rules={[{ required: true, type: 'array', min: 1, message: '请选择渠道' }]}
          >
            <Checkbox.Group options={channels} />
          </Form.Item>
          <Form.Item
            label="标题模板"
            name="titleTemplate"
            rules={[{ required: true, whitespace: true, message: '请输入标题模板' }]}
          >
            <Input placeholder="例如：{{.name}}，通知标题" maxLength={1000} />
          </Form.Item>
          <Form.Item
            label="模板内容"
            name="bodyTemplate"
            rules={[
              { required: true, whitespace: true, message: '请输入模板内容' },
              {
                validator: (_, value) =>
                  utf8Length(value ?? '') <= 12000
                    ? Promise.resolve()
                    : Promise.reject(new Error('模板内容超出 12000 字符')),
              },
            ]}
          >
            <Input.TextArea rows={6} placeholder="例如：{{.Details}}，详细介绍" />
          </Form.Item>
          <Typography.Title level={5}>模板标签</Typography.Title>
          <Typography.Paragraph type="secondary">
            使用 {'{{.name}}'} 进行变量替换。用于预览和测试模板。
          </Typography.Paragraph>
          <Form.List name="variables">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <VariableRow
                    key={field.key}
                    index={field.name}
                    form={form}
                    remove={() => remove(field.name)}
                  />
                ))}
                <Button
                  type="dashed"
                  block
                  disabled={fields.length >= 40}
                  icon={<PlusOutlined />}
                  onClick={() => add({ name: '', type: 'string', required: false, example: '' })}
                >
                  添加变量
                </Button>
              </>
            )}
          </Form.List>
          <Form.Item label="描述" name="description" style={{ marginTop: 20 }}>
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Drawer>
      <TemplatePreview
        template={preview?.template ?? null}
        allowTest={preview?.allowTest ?? false}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
export default TemplatesPanel;
