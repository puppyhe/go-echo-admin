// Independently implemented structured export builder; see docs/enterprise/EXPORT_BUILDER.md.
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { DownloadOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { sysExportTemplateApi } from '../../api/endpoints';
import { downloadByUrl } from '../../api/download';
import type { SysExportTemplate } from '../../domain/systemTools';
import type { BuilderCatalog, BuilderPreview, ExportQuery } from './exportBuilder/model';
import {
  canImportAPI,
  emptyQuery,
  filterValue,
  legacyQuery,
  prepareQuery,
} from './exportBuilder/model';
import { exportBuilderApi } from './exportBuilder/api';
import QueryEditor, { ConditionValue } from './exportBuilder/QueryEditor';

const blankCatalog: BuilderCatalog = { tables: [], relations: [], limit: 10000 };

/**
 * Older deployments returned only `sql` from previewSQL. Keep the preview
 * dialog usable against those responses by filling the optional builder
 * fields before any renderer reads them.
 */
function normalizeBuilderPreview(
  result: Partial<BuilderPreview>,
  tableName: string,
): BuilderPreview {
  const query =
    result.query && typeof result.query === 'object' ? result.query : emptyQuery(tableName);
  return {
    sql: typeof result.sql === 'string' ? result.sql : '',
    code: typeof result.code === 'string' ? result.code : '',
    columns: Array.isArray(result.columns) ? result.columns : [],
    parameters: Array.isArray(result.parameters) ? result.parameters : [],
    query,
    canImport: result.canImport === true,
  };
}

function PreviewContent({ value }: { value: BuilderPreview }) {
  const style = {
    maxHeight: 420,
    overflow: 'auto',
    padding: 16,
    background: 'var(--gea-bg-layout, #f5f5f5)',
    borderRadius: 8,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
  };
  return (
    <Tabs
      items={[
        {
          key: 'sql',
          label: 'SQL 预览',
          children: (
            <>
              <Alert
                type="info"
                showIcon
                message="SQL 服务仅在后台执行，数据用于导出/预览；下载数据时请确保有权限。"
              />
              <pre style={style}>{value.sql}</pre>
            </>
          ),
        },
        { key: 'code', label: 'React 调用方式', children: <pre style={style}>{value.code}</pre> },
        {
          key: 'mapping',
          label: '模板名称',
          children: (
            <Table
              pagination={false}
              size="small"
              rowKey="key"
              dataSource={value.columns}
              columns={[
                { title: '字段键', dataIndex: 'key' },
                { title: '字段名', dataIndex: 'field' },
                { title: 'Excel 表头', dataIndex: 'header' },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
function TemplateEditor({
  row,
  catalog,
  onClose,
  onSaved,
}: {
  row: SysExportTemplate | 'new';
  catalog: BuilderCatalog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [query, setQuery] = useState<ExportQuery>(() => {
    if (row === 'new') return emptyQuery();
    try {
      return legacyQuery(row);
    } catch {
      return emptyQuery(row.tableName);
    }
  });
  const [legacyMessage] = useState(() => {
    if (row === 'new') return '';
    try {
      legacyQuery(row);
      return '';
    } catch (error) {
      return String((error as Error).message);
    }
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BuilderPreview>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tab, setTab] = useState('query');
  const changed = (next: ExportQuery) => {
    setQuery(next);
    setPreview(undefined);
  };
  const save = async () => {
    try {
      const fields = await form.validateFields();
      const prepared = prepareQuery(query, catalog);
      setBusy(true);
      const payload = {
        ...fields,
        query: prepared,
        tableName: prepared.table,
        fieldList: JSON.stringify(
          prepared.fields.map((field) => ({ name: field.field, header: field.header })),
        ),
        limit: prepared.limit,
        sql: '',
        whereCond: '',
        orderCond: '',
        ...(row === 'new' || row.ID === 0 ? {} : { ID: row.ID, revision: row.revision ?? 0 }),
      };
      if (row === 'new' || row.ID === 0)
        await sysExportTemplateApi.createSysExportTemplate(payload);
      else await sysExportTemplateApi.updateSysExportTemplate(payload);
      message.success('保存成功');
      onSaved();
    } catch (error) {
      if (error instanceof Error && !('code' in error)) message.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  const loadPreview = async () => {
    try {
      const prepared = prepareQuery(query, catalog);
      setPreviewBusy(true);
      setPreview(await exportBuilderApi.preview(prepared, form.getFieldValue('templateID') || ''));
      setTab('preview');
    } catch (error) {
      if (error instanceof Error && !('code' in error)) message.error(error.message);
    } finally {
      setPreviewBusy(false);
    }
  };
  return (
    <Drawer
      open
      width="min(1120px, 96vw)"
      title={row === 'new' ? '新建导出模板' : `编辑导出模板 · 版本 ${row.revision ?? 0}`}
      onClose={onClose}
      maskClosable={!busy}
      extra={
        <Space>
          <Button onClick={() => void loadPreview()} loading={previewBusy}>
            SQL / 预览
          </Button>
          <Button type="primary" loading={busy} onClick={() => void save()}>
            保存模板
          </Button>
        </Space>
      }
      getContainer={() => document.body}
    >
      {legacyMessage && (
        <Alert type="warning" showIcon message={legacyMessage} style={{ marginBottom: 16 }} />
      )}
      <Form form={form} layout="vertical" initialValues={row === 'new' ? {} : row}>
        <Space align="start" wrap style={{ width: '100%' }}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={120} style={{ width: 280 }} />
          </Form.Item>
          <Form.Item
            name="templateID"
            label="模板标识"
            rules={[
              { required: true },
              {
                pattern: /^[A-Za-z_][A-Za-z0-9_]{0,99}$/,
                message: '下划线、字母、数字',
              },
            ]}
          >
            <Input maxLength={100} style={{ width: 280 }} onChange={() => setPreview(undefined)} />
          </Form.Item>
        </Space>
        <Form.Item name="info" label="描述">
          <Input.TextArea rows={2} maxLength={600} showCount />
        </Form.Item>
      </Form>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'query',
            label: '查询配置',
            children: <QueryEditor value={query} catalog={catalog} onChange={changed} />,
          },
          {
            key: 'preview',
            label: '预览',
            children: preview ? (
              <PreviewContent value={preview} />
            ) : (
              <Alert
                message="请在“查询配置”中点击“SQL / 预览”生成参数化查询，导出将使用该查询。"
                type="info"
              />
            ),
          },
        ]}
      />
    </Drawer>
  );
}
function ExportDialog({ row, onClose }: { row: SysExportTemplate; onClose: () => void }) {
  const { message } = App.useApp();
  const [preview, setPreview] = useState<BuilderPreview>();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [limit, setLimit] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void sysExportTemplateApi
      .previewSQL({ templateID: row.templateID })
      .then((result) => {
        if (active) {
          const value = normalizeBuilderPreview(result as Partial<BuilderPreview>, row.tableName);
          const query = value.query;
          setPreview(value);
          setLimit(query.limit);
        }
      })
      .catch(() => {
        if (active) setError('模板配置或权限问题，请检查后重试。');
      });
    return () => {
      active = false;
    };
  }, [row.templateID]);
  const download = async () => {
    if (!preview) return;
    try {
      const params: Record<string, unknown> = {};
      for (const parameter of preview.parameters)
        params[parameter.name] = filterValue(
          values[parameter.name],
          parameter.type,
          parameter.operator,
        );
      setBusy(true);
      const { url } = await exportBuilderApi.export(row.templateID, params, limit);
      await downloadByUrl(url);
      message.success('文件下载成功');
      onClose();
    } catch (err) {
      if (err instanceof Error && !('code' in err)) message.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={`导出 Excel · ${row.name}`}
      width={850}
      onCancel={onClose}
      okText="下载"
      onOk={() => void download()}
      confirmLoading={busy}
      okButtonProps={{ disabled: !preview }}
    >
      {error && <Alert type="error" message={error} />}
      {!preview && !error && <Typography.Paragraph>请选择模板配置权限…</Typography.Paragraph>}
      {preview && (
        <>
          <Form layout="vertical">
            {preview.parameters.map((parameter, index) => (
              <Form.Item
                required
                key={`${parameter.name}:${index}`}
                label={`${parameter.name} · ${parameter.type} / ${parameter.operator}`}
              >
                <ConditionValue
                  type={parameter.type}
                  operator={parameter.operator}
                  value={values[parameter.name]}
                  onChange={(value) => setValues((old) => ({ ...old, [parameter.name]: value }))}
                />
              </Form.Item>
            ))}
            <Form.Item label={`导出条数（模板上限 ${preview.query.limit}）`}>
              <InputNumber
                min={1}
                max={preview.query.limit}
                precision={0}
                value={limit}
                onChange={(value) => setLimit(value ?? preview.query.limit)}
              />
            </Form.Item>
          </Form>
          <PreviewContent value={preview} />
        </>
      )}
    </Modal>
  );
}
export default function ExportTemplatePage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<SysExportTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState(blankCatalog);
  const [catalogError, setCatalogError] = useState('');
  const [filters, setFilters] = useState({ name: '', tableName: '', templateID: '' });
  const [search, setSearch] = useState(filters);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [editor, setEditor] = useState<SysExportTemplate | 'new' | null>(null);
  const [exportRow, setExportRow] = useState<SysExportTemplate | null>(null);
  const [preview, setPreview] = useState<BuilderPreview>();
  const [importRow, setImportRow] = useState<SysExportTemplate | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const result = await sysExportTemplateApi.getSysExportTemplateList({
        page,
        pageSize,
        ...search,
      });
      if (current === sequence.current) {
        setRows(result.list);
        setTotal(result.total);
      }
    } catch {
      /* request reports errors */
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [page, pageSize, search]);
  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await exportBuilderApi.catalog());
      setCatalogError('');
    } catch {
      setCatalogError('目录加载失败，请检查模板查询权限。');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);
  const edit = async (row: SysExportTemplate, copy = false) => {
    setActionBusy(`edit:${row.ID}`);
    try {
      const latest = await sysExportTemplateApi.findSysExportTemplate({ ID: row.ID });
      if (copy) {
        setEditor({
          ...latest,
          ID: 0,
          revision: 0,
          name: `${latest.name} (副本)`,
          templateID: `${latest.templateID}_copy`,
        });
      } else setEditor(latest);
    } finally {
      setActionBusy('');
    }
  };
  const remove = async (ids: number[]) => {
    await sysExportTemplateApi.deleteSysExportTemplateByIds(ids);
    setSelected([]);
    message.success('模板删除成功');
    if (rows.length === ids.length && page > 1) setPage(page - 1);
    else await load();
  };
  const importable = (row: SysExportTemplate) => {
    try {
      return canImportAPI(legacyQuery(row));
    } catch {
      return false;
    }
  };
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card>
        <Space wrap>
          <Input
            placeholder="模板名称"
            style={{ width: 190 }}
            value={filters.name}
            onChange={(event) => setFilters({ ...filters, name: event.target.value })}
            onPressEnter={() => {
              setSearch(filters);
              setPage(1);
              setSelected([]);
            }}
          />
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="业务表"
            value={filters.tableName || undefined}
            options={catalog.tables.map((table) => ({ value: table.key, label: table.label }))}
            onChange={(tableName) => setFilters({ ...filters, tableName: tableName || '' })}
          />
          <Input
            placeholder="模板标识"
            style={{ width: 200 }}
            value={filters.templateID}
            onChange={(event) => setFilters({ ...filters, templateID: event.target.value })}
          />
          <Button
            type="primary"
            onClick={() => {
              setSearch(filters);
              setPage(1);
              setSelected([]);
            }}
          >
            查询
          </Button>
          <Button
            onClick={() => {
              const empty = { name: '', tableName: '', templateID: '' };
              setFilters(empty);
              setSearch(empty);
              setPage(1);
              setSelected([]);
            }}
          >
            重置
          </Button>
        </Space>
      </Card>
      {catalogError && (
        <Alert
          type="warning"
          showIcon
          message={catalogError}
          action={<Button onClick={() => void loadCatalog()}>重试</Button>}
        />
      )}
      <Card
        title="导出模板"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
            <Popconfirm
              title={`确认删除这 ${selected.length} 个模板？`}
              onConfirm={() => remove(selected.map(Number))}
            >
              <Button danger disabled={!selected.length}>
                删除
              </Button>
            </Popconfirm>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!catalog.tables.length}
              onClick={() => setEditor('new')}
            >
              创建模板
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="ID"
          loading={loading}
          dataSource={rows}
          scroll={{ x: 1150 }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (next, size) => {
              setPage(next);
              setPageSize(size);
              setSelected([]);
            },
          }}
          columns={[
            { title: '模板名称', dataIndex: 'name', width: 180 },
            { title: '模板标识', dataIndex: 'templateID', width: 170 },
            { title: '业务表', dataIndex: 'tableName', width: 170 },
            {
              title: '查询',
              width: 130,
              render: (_, row) => (
                <Space direction="vertical" size={0}>
                  <Tag color={row.query ? 'blue' : 'default'}>
                    {row.query ? `查询 · v${row.revision}` : '无查询'}
                  </Tag>
                  <Typography.Text type="secondary">
                    {row.query?.joins.length || 0} 个标签
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: '限制',
              render: (_, row) => row.query?.limit ?? (row.limit || 10000),
              width: 100,
            },
            {
              title: '操作',
              fixed: 'right',
              width: 400,
              render: (_, row) => (
                <Space size={0} wrap>
                  <Button
                    type="link"
                    size="small"
                    loading={actionBusy === `edit:${row.ID}`}
                    onClick={() => void edit(row)}
                  >
                    编辑
                  </Button>
                  <Button type="link" size="small" onClick={() => void edit(row, true)}>
                    复制
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={async () => {
                      setActionBusy(`preview:${row.ID}`);
                      try {
                        const result = await sysExportTemplateApi.previewSQL({
                          templateID: row.templateID,
                        });
                        setPreview(
                          normalizeBuilderPreview(result as Partial<BuilderPreview>, row.tableName),
                        );
                      } finally {
                        setActionBusy('');
                      }
                    }}
                    loading={actionBusy === `preview:${row.ID}`}
                  >
                    SQL / 预览
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => setExportRow(row)}
                  >
                    导出
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={async () => {
                      const { url } = await sysExportTemplateApi.exportTemplate({
                        templateID: row.templateID,
                      });
                      await downloadByUrl(url);
                    }}
                  >
                    导出模板
                  </Button>
                  {importable(row) && (
                    <Button type="link" size="small" onClick={() => setImportRow(row)}>
                      导入 API
                    </Button>
                  )}
                  <Popconfirm title="确认删除该模板？" onConfirm={() => remove([row.ID])}>
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
      {editor && (
        <TemplateEditor
          key={editor === 'new' ? 'new' : `${editor.ID}-${editor.UpdatedAt}`}
          row={editor}
          catalog={catalog}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {exportRow && <ExportDialog row={exportRow} onClose={() => setExportRow(null)} />}
      <Modal
        open={Boolean(preview)}
        title="SQL / 调用代码 / 模板配置"
        width={950}
        footer={null}
        onCancel={() => setPreview(undefined)}
      >
        {preview && <PreviewContent value={preview} />}
      </Modal>
      <Modal
        open={Boolean(importRow)}
        title={`导入 API · ${importRow?.name ?? ''}`}
        footer={null}
        onCancel={() => {
          if (!uploading) setImportRow(null);
        }}
      >
        <Alert
          type="info"
          showIcon
          message="导入 Excel 前请确保：模板存在、权限正确、API 方法完整、分组无重复。若导入失败，请检查配置权限。"
          style={{ marginBottom: 16 }}
        />
        <Upload
          accept=".xlsx"
          showUploadList={false}
          disabled={uploading}
          beforeUpload={(file) => {
            if (!importRow) return false;
            if (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024) {
              message.error('请选择 8MB 以内的 .xlsx 文件');
              return false;
            }
            setUploading(true);
            void sysExportTemplateApi
              .importExcel(file, importRow.templateID)
              .then(() => {
                message.success('API 导入成功');
                setImportRow(null);
              })
              .finally(() => setUploading(false));
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>
            选择 Excel 文件
          </Button>
        </Upload>
      </Modal>
    </Space>
  );
}
