import { AuthenticatedImage } from '../upload/AuthenticatedAsset';
import { useCallback, useEffect, useMemo, useRef, useState, type Key } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  Upload,
} from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { useBtnAuth } from '../../auth/useBtnAuth';
import { dictionaryService } from '../../services/dictionaryService';
import { fileUrl, uploadFile } from '../../api/request';
import {
  fieldValue,
  flattenGeneratedRows,
  generatedSearch,
  jsonType,
  numericType,
  prepareGeneratedRow,
  scalarValue,
  type GeneratedAPI,
  type GeneratedConfig,
  type GeneratedField,
  type GeneratedRow,
} from './generatedFields';

/** Generated modules share controls while retaining their own typed, authenticated backend routes. */
export default function GeneratedCrudPage({
  config,
  api,
}: {
  config: GeneratedConfig;
  api: GeneratedAPI;
}) {
  const { message } = App.useApp();
  const hasButton = useBtnAuth();
  const permitted = (key: string) => !config.buttonAuth || hasButton(key);
  const [rows, setRows] = useState<GeneratedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<GeneratedRow>({});
  const [order, setOrder] = useState<GeneratedRow>({});
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Key[]>([]);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GeneratedRow | null>(null);
  const [detail, setDetail] = useState<GeneratedRow | null>(null);
  const [options, setOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [parents, setParents] = useState<GeneratedRow[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [form] = Form.useForm();
  const [searchForm] = Form.useForm();
  const sequence = useRef(0);
  const editorSequence = useRef(0);
  const detailSequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
      editorSequence.current++;
      detailSequence.current++;
    },
    [],
  );
  const params = useMemo(
    () => ({ ...filters, ...order, page, pageSize }),
    [filters, order, page, pageSize],
  );
  useEffect(() => {
    const current = ++sequence.current;
    setLoading(true);
    setSelection([]);
    void api
      .list(params)
      .then((result) => {
        if (current === sequence.current) {
          setRows(result.list ?? []);
          setTotal(result.total ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (current === sequence.current) setLoading(false);
      });
  }, [api, params, revision]);
  useEffect(() => {
    let live = true;
    for (const field of config.fields) {
      const source = field.dataSource
        ? api.options?.(field.key)
        : field.dictType
          ? dictionaryService
              .getDict(field.dictType)
              .then((nodes) =>
                nodes
                  .filter((node) => !node.disabled)
                  .map((node) => ({ label: node.label, value: String(node.value) })),
              )
          : undefined;
      if (source)
        void source
          .then((items) => {
            if (live)
              setOptions((previous) => ({
                ...previous,
                [field.key]: items.map((item) => ({
                  ...item,
                  value: String(scalarValue(field, item.value)),
                })),
              }));
          })
          .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [api, config]);
  const reload = () => setRevision((value) => value + 1);
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await operation();
      message.success('操作成功');
      reload();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const loadParents = useCallback(async () => {
    if (!config.tree) return;
    setParentLoading(true);
    try {
      const items: GeneratedRow[] = [];
      for (let current = 1; current <= 100; current++) {
        const result = await api.list({ page: current, pageSize: 100 });
        items.push(...flattenGeneratedRows(result.list ?? []));
        if (current * 100 >= result.total) break;
      }
      setParents(items);
    } catch {
    } finally {
      setParentLoading(false);
    }
  }, [api, config.tree]);
  const startEdit = async (row?: GeneratedRow) => {
    const current = ++editorSequence.current;
    try {
      const entity = row ? await api.find(String(row[config.primaryKey])) : null;
      if (current !== editorSequence.current) return;
      setEditing(entity);
      form.resetFields();
      const values: GeneratedRow = { ...entity };
      for (const field of config.fields) {
        let value = entity ? entity[field.key] : field.defaultValue;
        if (field.type === 'time.Time')
          value =
            value === 'CURRENT_TIMESTAMP' ? dayjs() : value ? dayjs(String(value)) : undefined;
        else if (field.dataSource)
          value = Array.isArray(value)
            ? value.map(String)
            : value === null || value === undefined
              ? undefined
              : String(value);
        else if (field.dictType)
          value = value === null || value === undefined ? undefined : String(value);
        else if (jsonType(field)) value = value == null ? '' : JSON.stringify(value, null, 2);
        values[field.key] = value;
      }
      form.setFieldsValue(values);
      setOpen(true);
      void loadParents();
    } catch {}
  };
  const controls = (field: GeneratedField, search = false) => {
    if (search && ['IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN'].includes(field.search))
      return (
        <Input
          placeholder={field.search.includes('BETWEEN') ? '起始时间,结束时间' : '请输入'}
          allowClear
        />
      );
    if (field.dataSource || field.dictType)
      return (
        <Select
          style={{ minWidth: 180 }}
          allowClear={search || field.clearable}
          showSearch
          optionFilterProp="label"
          mode={!search && field.dataSource?.association === 2 ? 'multiple' : undefined}
          options={options[field.key] ?? []}
        />
      );
    if (field.type === 'bool')
      return search || field.nullable ? (
        <Select
          style={{ width: 140 }}
          allowClear
          options={[
            { label: '是', value: true },
            { label: '否', value: false },
          ]}
        />
      ) : (
        <Switch />
      );
    if (numericType(field.type))
      return (
        <InputNumber
          style={{ width: '100%', minWidth: 140 }}
          min={field.type.startsWith('uint') ? 0 : undefined}
          precision={field.type === 'float64' ? undefined : 0}
        />
      );
    if (field.type === 'time.Time') return <DatePicker showTime style={{ width: '100%' }} />;
    if (!search && (jsonType(field) || field.type === 'richtext'))
      return (
        <Input.TextArea
          rows={5}
          placeholder={jsonType(field) ? 'JSON 格式内容' : 'HTML 内容；列表数据；详情内容'}
        />
      );
    return (
      <Input
        allowClear={search || field.clearable}
        maxLength={
          field.type === 'string' && /^\d+$/.test(field.length) ? Number(field.length) : undefined
        }
      />
    );
  };
  const renderValue = (field: GeneratedField, value: unknown) => {
    if (value == null) return '—';
    if (options[field.key])
      return (Array.isArray(value) ? value : [value])
        .map(
          (item) =>
            options[field.key].find((option) => option.value === String(item))?.label ??
            String(item),
        )
        .join('、');
    if (field.type === 'bool') return value ? '是' : '否';
    if (field.type === 'picture' && typeof value === 'string' && value)
      return (
        <AuthenticatedImage src={value} width={56} height={40} style={{ objectFit: 'cover' }} />
      );
    if (field.type === 'time.Time')
      return dayjs(String(value)).isValid()
        ? dayjs(String(value)).format('YYYY-MM-DD HH:mm:ss')
        : String(value);
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };
  const columns: TableColumnsType<GeneratedRow> = config.fields
    .filter((field) => field.table)
    .map((field) => ({
      title: field.title,
      dataIndex: field.key,
      key: field.key,
      sorter: field.sort,
      ellipsis: true,
      render: (value) => renderValue(field, value),
    }));
  if (config.defaultModel)
    columns.unshift({ title: 'ID', dataIndex: config.primaryKey, width: 90 });
  columns.push({
    title: '操作',
    key: 'actions',
    fixed: 'right',
    width: 200,
    render: (_, row) => (
      <Space>
        {permitted('info') && (
          <Button
            size="small"
            type="link"
            onClick={() => {
              const current = ++detailSequence.current;
              void api
                .find(String(row[config.primaryKey]))
                .then((result) => {
                  if (current === detailSequence.current) setDetail(result);
                })
                .catch(() => {});
            }}
          >
            详情
          </Button>
        )}
        {permitted('edit') && (
          <Button size="small" type="link" disabled={busy} onClick={() => void startEdit(row)}>
            编辑
          </Button>
        )}
        {permitted('delete') && (
          <Popconfirm
            title="删除记录？"
            onConfirm={() => mutate(() => api.remove(String(row[config.primaryKey])))}
          >
            <Button type="link" size="small" danger disabled={busy}>
              删除
            </Button>
          </Popconfirm>
        )}
      </Space>
    ),
  });
  const save = async () => {
    try {
      const values = await form.validateFields();
      const data = prepareGeneratedRow(config, values, editing);
      setBusy(true);
      await (editing ? api.update(data) : api.create(data));
      message.success('保存成功');
      setOpen(false);
      reload();
    } catch (error) {
      if (error instanceof Error && !('code' in error)) message.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  const searched = config.fields.filter(
    (field) => field.search && (expanded || !field.searchHidden),
  );
  const currentTreeNode = editing
    ? parents.find((row) => row[config.primaryKey] === editing[config.primaryKey])
    : undefined;
  const blockedParents = new Set(
    currentTreeNode
      ? flattenGeneratedRows([currentTreeNode]).map((row) => row[config.primaryKey])
      : [],
  );
  const parentOptions = parents
    .filter((row) => !editing || row[config.primaryKey] !== editing[config.primaryKey])
    .map((row) => ({
      value: row[config.primaryKey] as number,
      disabled: blockedParents.has(row[config.primaryKey]),
      label: `${String(row[config.treeLabel] ?? '')} (${String(row[config.primaryKey])})`,
    }));
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title={config.title}>
        <Form
          form={searchForm}
          layout="inline"
          onFinish={(values) => {
            try {
              setFilters(
                generatedSearch(
                  config.fields.filter((field) => field.search),
                  values,
                ),
              );
              setPage(1);
            } catch (error) {
              message.error((error as Error).message);
            }
          }}
        >
          {searched.map((field) => (
            <Form.Item key={field.key} name={field.key} label={field.title}>
              {controls(field, true)}
            </Form.Item>
          ))}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                onClick={() => {
                  searchForm.resetFields();
                  setFilters({});
                  setPage(1);
                }}
              >
                重置
              </Button>
              {config.fields.some((field) => field.searchHidden) && (
                <Button type="link" onClick={() => setExpanded((value) => !value)}>
                  {expanded ? '收起' : '展开'}
                </Button>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card
        extra={
          <Button onClick={reload} loading={loading}>
            刷新
          </Button>
        }
        title={
          <Space wrap>
            {permitted('add') && (
              <Button type="primary" onClick={() => void startEdit()}>
                新增
              </Button>
            )}
            {permitted('batchDelete') && (
              <Popconfirm
                title={`删除选中的 ${selection.length} 条记录？`}
                onConfirm={() => mutate(() => api.removeBatch(selection.map(String)))}
              >
                <Button danger disabled={!selection.length || busy}>
                  批量删除
                </Button>
              </Popconfirm>
            )}
            {api.exportExcel && permitted('exportExcel') && (
              <Button loading={busy} onClick={() => void mutate(() => api.exportExcel!(params))}>
                导出 Excel
              </Button>
            )}
            {api.exportExcel && permitted('exportTemplate') && (
              <Button
                loading={busy}
                onClick={() => void mutate(() => api.exportExcel!(params, true))}
              >
                下载导入模板
              </Button>
            )}
            {api.importExcel && permitted('importExcel') && (
              <Upload
                accept=".xlsx"
                showUploadList={false}
                beforeUpload={(file) => {
                  if (file.size > 10 * 1024 * 1024) {
                    message.error('文件大小不能超过 10MB');
                    return false;
                  }
                  void mutate(async () => {
                    const result = await api.importExcel!(file);
                    message.success(`已导入 ${result.count} 条记录`);
                  });
                  return false;
                }}
              >
                <Button disabled={busy}>导入 Excel</Button>
              </Upload>
            )}
          </Space>
        }
      >
        <Table<GeneratedRow>
          rowKey={(row) => String(row[config.primaryKey])}
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 'max-content' }}
          rowSelection={
            permitted('batchDelete')
              ? { selectedRowKeys: selection, onChange: setSelection }
              : undefined
          }
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 条`,
          }}
          onChange={(pagination, _, sorter) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? 10);
            const selected = Array.isArray(sorter) ? sorter[0] : sorter;
            setOrder(
              selected.order
                ? { orderKey: String(selected.field), desc: selected.order === 'descend' }
                : {},
            );
          }}
        />
      </Card>
      <Drawer
        title={editing ? `编辑${config.title}` : `新建${config.title}`}
        open={open}
        width={640}
        onClose={() => {
          if (!busy) {
            editorSequence.current++;
            setOpen(false);
          }
        }}
        extra={
          <Button type="primary" loading={busy} disabled={uploading} onClick={() => void save()}>
            保存
          </Button>
        }
        getContainer={() => document.body}
      >
        <Form form={form} layout="vertical" disabled={busy}>
          {config.tree && (
            <Form.Item name="parentID" label="Details node">
              <Select
                showSearch
                allowClear
                optionFilterProp="label="
                placeholder="Details node"
                loading={parentLoading}
                options={parentOptions}
              />
            </Form.Item>
          )}
          {config.fields
            .filter((field) => field.form)
            .map((field) => (
              <div key={field.key}>
                <Form.Item
                  name={field.key}
                  label={field.title}
                  valuePropName={
                    field.type === 'bool' && !field.nullable && !field.dictType && !field.dataSource
                      ? 'checked'
                      : 'value'
                  }
                  rules={[
                    {
                      required:
                        field.required ||
                        (field.primaryKey &&
                          config.primaryType === 'string' &&
                          !field.databaseDefault),
                      message: field.errorText || `message${field.title}`,
                    },
                    {
                      validator: (_, value) => {
                        try {
                          fieldValue(field, value);
                          return Promise.resolve();
                        } catch (error) {
                          return Promise.reject(error);
                        }
                      },
                    },
                  ]}
                >
                  {field.primaryKey && editing ? <Input disabled /> : controls(field)}
                </Form.Item>
                {['picture', 'video', 'file', 'pictures'].includes(field.type) && (
                  <Upload
                    showUploadList={false}
                    accept={
                      field.type === 'picture' || field.type === 'pictures'
                        ? 'image/*'
                        : field.type === 'video'
                          ? 'video/*'
                          : undefined
                    }
                    beforeUpload={(file) => {
                      const current = editorSequence.current;
                      setUploading(true);
                      void (async () => {
                        try {
                          const result = await uploadFile(file);
                          if (current !== editorSequence.current) return;
                          const url = result.file.url;
                          if (field.type === 'file' || field.type === 'pictures') {
                            let old: unknown;
                            try {
                              old = JSON.parse(String(form.getFieldValue(field.key) || '[]'));
                            } catch {
                              old = [];
                            }
                            form.setFieldValue(
                              field.key,
                              JSON.stringify([...(Array.isArray(old) ? old : []), url], null, 2),
                            );
                          } else form.setFieldValue(field.key, url);
                        } catch {
                        } finally {
                          setUploading(false);
                        }
                      })();
                      return false;
                    }}
                  >
                    <Button size="small" disabled={busy || uploading}>
                      label={field.title}
                    </Button>
                  </Upload>
                )}
              </div>
            ))}
        </Form>
      </Drawer>
      <Drawer
        title={`${config.title}details`}
        open={!!detail}
        width={640}
        onClose={() => {
          detailSequence.current++;
          setDetail(null);
        }}
        getContainer={() => document.body}
      >
        <Descriptions
          column={1}
          bordered
          items={config.fields
            .filter((field) => field.detail)
            .map((field) => ({
              key: field.key,
              label: field.title,
              children: (
                <Typography.Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {renderValue(field, detail?.[field.key])}
                </Typography.Text>
              ),
            }))}
        />
      </Drawer>
    </Space>
  );
}
