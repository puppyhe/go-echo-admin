// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Spin,
  Table,
  Tag,
  Tree,
  Typography,
  Upload,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  CloudDownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { menuApi, sysApiApi, sysDictionaryApi, sysVersionApi } from '../../api/endpoints';
import type { SysVersion, VersionImportResult } from '../../domain/systemTools';
import type { MenuNode } from '../../domain/menu';
import type { SysApi } from '../../domain/api';
import type { SysDictionary } from '../../domain/dictionary';
import {
  parseVersionPackage,
  countVersionMenus,
  versionImportBody,
  type VersionMode,
} from './logs/versionImport';

function formattedSnapshot(raw?: string) {
  if (!raw) return '保存版本 JSON 数据';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// Internal implementation detail.
interface CheckTreeNode {
  title: string;
  key: number | string;
  children?: CheckTreeNode[];
}

// Internal implementation detail.
interface ExportFormValues {
  versionName: string;
  versionCode: string;
  description?: string;
}

// Internal implementation detail.
function checkedNumbers(checked: unknown): number[] {
  const list = Array.isArray(checked)
    ? checked
    : ((checked as { checked?: unknown } | null)?.checked ?? []);
  if (!Array.isArray(list)) return [];
  return list.filter((key): key is number => typeof key === 'number');
}

// Internal implementation detail.
function menuNodes(menus: MenuNode[]): CheckTreeNode[] {
  return menus.map((menu) => ({
    title: menu.meta?.title || menu.name || menu.path,
    key: menu.ID,
    children: menu.children?.length ? menuNodes(menu.children) : undefined,
  }));
}

// Internal implementation detail.
function apiNodes(apis: SysApi[]): CheckTreeNode[] {
  const groups = new Map<string, SysApi[]>();
  apis.forEach((api) => {
    const list = groups.get(api.apiGroup) ?? [];
    list.push(api);
    groups.set(api.apiGroup, list);
  });
  return [...groups.entries()].map(([group, list]) => ({
    title: `${group} 接口（${list.length}）`,
    key: `group:${group}`,
    children: list.map((api) => ({ title: `${api.path} [${api.method}]`, key: api.ID })),
  }));
}

// Internal implementation detail.
function dictNodes(dicts: SysDictionary[]): CheckTreeNode[] {
  return dicts.map((dict) => ({
    title: `${dict.name}（${dict.type}）`,
    key: dict.ID,
    children: dict.children?.length ? dictNodes(dict.children) : undefined,
  }));
}

// Internal implementation detail.
function countMenus(menus: unknown[]): number {
  return countVersionMenus(menus);
}

export default function VersionPage() {
  const { message } = App.useApp();
  const [exportForm] = Form.useForm<ExportFormValues>();
  const [filterForm] = Form.useForm();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SysVersion | null>(null);
  const [paste, setPaste] = useState('');
  const [importMode, setImportMode] = useState<VersionMode>('record');
  const [checkedImport, setCheckedImport] = useState<VersionImportResult | null>(null);

  // ===== versionlist =====
  const [rows, setRows] = useState<SysVersion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Internal implementation detail.
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [menuTree, setMenuTree] = useState<CheckTreeNode[]>([]);
  const [apiTree, setApiTree] = useState<CheckTreeNode[]>([]);
  const [dictTree, setDictTree] = useState<CheckTreeNode[]>([]);
  const [menuIds, setMenuIds] = useState<number[]>([]);
  const [apiIds, setApiIds] = useState<number[]>([]);
  const [dictIds, setDictIds] = useState<number[]>([]);

  // ===== importversion =====
  const [importData, setImportData] = useState<Record<string, unknown> | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const previewSerial = useRef(0);
  useEffect(() => {
    previewSerial.current++;
    setCheckedImport(null);
  }, [importData, importMode]);

  const loadList = useCallback(() => {
    setLoading(true);
    void sysVersionApi
      .getSysVersionList({ page, pageSize, ...filters })
      .then((res) => {
        setRows(res.list ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [page, pageSize, filters]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Internal implementation detail.
  const openExport = async () => {
    setExportOpen(true);
    setTreeLoading(true);
    try {
      const [menus, apis, dicts] = await Promise.all([
        menuApi
          .getBaseMenuTree()
          .then((res) => res.menus ?? [])
          .catch(() => [] as MenuNode[]),
        sysApiApi
          .getAllApis()
          .then((res) => res.apis ?? [])
          .catch(() => [] as SysApi[]),
        sysDictionaryApi
          .getSysDictionaryList({ page: 1, pageSize: 999 })
          .then((res) => res.list ?? [])
          .catch(() => [] as SysDictionary[]),
      ]);
      setMenuTree(menuNodes(menus));
      setApiTree(apiNodes(apis));
      setDictTree(dictNodes(dicts));
    } finally {
      setTreeLoading(false);
    }
  };

  const closeExport = () => {
    setExportOpen(false);
    exportForm.resetFields();
    setMenuIds([]);
    setApiIds([]);
    setDictIds([]);
  };

  // Internal implementation detail.
  const onExport = async () => {
    const values = await exportForm.validateFields();
    setExporting(true);
    try {
      await sysVersionApi.exportVersion({
        versionName: values.versionName,
        versionCode: values.versionCode,
        description: values.description ?? '',
        menus: menuIds,
        apis: apiIds,
        dictionaries: dictIds,
      });
      message.success('创建成功');
      closeExport();
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setExporting(false);
    }
  };

  // Internal implementation detail.
  const onImportFile = (file: File) => {
    if (file.size > 128000) {
      message.error('版本文件大小不能超过 128000 字符');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      message.error('请选择 JSON 格式文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseVersionPackage(String(e.target?.result ?? ''));
        setImportData(parsed);
        setCheckedImport(null);
        setImportFileName(file.name);
        message.success('JSON 解析成功，即将预览');
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'JSON 文件解析失败');
      }
    };
    reader.readAsText(file);
  };

  const previewImport = async () => {
    if (!importData) return;
    const serial = ++previewSerial.current;
    setImporting(true);
    try {
      const result = await sysVersionApi.importVersion(
        versionImportBody(importData, importMode, true),
      );
      if (serial === previewSerial.current) setCheckedImport(result);
    } finally {
      setImporting(false);
    }
  };

  /** importversion */
  const onImport = async () => {
    if (
      !importData ||
      !checkedImport ||
      checkedImport.items.some((item) => item.action === 'conflict')
    )
      return;
    setImporting(true);
    try {
      await sysVersionApi.importVersion(versionImportBody(importData, importMode, false));
      message.success(importMode === 'record' ? '版本导入成功' : '配置导入成功');
      setCheckedImport(null);
      setImportData(null);
      setImportFileName('');
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      setImporting(false);
    }
  };

  // Internal implementation detail.
  const onDelete = async (ids: number[]) => {
    if (ids.length === 1) await sysVersionApi.deleteSysVersion(ids[0]);
    else await sysVersionApi.deleteSysVersionByIds(ids);
    message.success('删除成功');
    setSelectedIds([]);
    if (rows.length === ids.length && page > 1) setPage(page - 1);
    else loadList();
  };

  // Internal implementation detail.
  const onDownload = async (row: SysVersion) => {
    try {
      await sysVersionApi.downloadVersionJson(
        { ID: row.ID },
        `${row.versionName || 'version'}_${row.versionCode || row.ID}.json`,
      );
      message.success('下载成功');
    } catch {
      // Internal implementation detail.
    }
  };

  const columns: TableColumnsType<SysVersion> = [
    {
      title: '创建时间',
      key: 'CreatedAt',
      width: 170,
      render: (_: unknown, row: SysVersion) =>
        row.CreatedAt ? dayjs(row.CreatedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    { title: '版本名称', dataIndex: 'versionName', width: 160 },
    { title: '版本编号', dataIndex: 'versionCode', width: 120 },
    {
      title: '导入模式',
      dataIndex: 'importMode',
      width: 120,
      render: (value: string) =>
        ({ record: '版本导入', resources: '配置导入', export: '新建导出' })[value] || '未知',
    },
    {
      title: '版本描述',
      dataIndex: 'description',
      render: (value: unknown) => {
        const text = value === null || value === undefined ? '' : String(value);
        return text ? (
          <Typography.Text style={{ maxWidth: 320 }} ellipsis={{ tooltip: text }}>
            {text}
          </Typography.Text>
        ) : (
          '-'
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_: unknown, row: SysVersion) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => void sysVersionApi.findSysVersion({ ID: row.ID }).then(setDetail)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloudDownloadOutlined />}
            onClick={() => void onDownload(row)}
          >
            下载 JSON
          </Button>
          <Popconfirm title="确认删除该版本？" onConfirm={() => void onDelete([row.ID])}>
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Internal implementation detail.
  const importPreview = useMemo(() => {
    if (!importData) return null;
    const menus = Array.isArray(importData.menus) ? (importData.menus as unknown[]) : [];
    const apis = Array.isArray(importData.apis) ? (importData.apis as unknown[]) : [];
    const dictionaries = Array.isArray(importData.dictionaries)
      ? (importData.dictionaries as unknown[])
      : [];
    return {
      versionName: String((importData.version as Record<string, unknown>)?.name ?? ''),
      versionCode: String((importData.version as Record<string, unknown>)?.code ?? ''),
      menus: countMenus(menus),
      apis: apis.length,
      dictionaries: dictionaries.length,
    };
  }, [importData]);

  return (
    <div>
      <Card title="版本列表" className="table-card" styles={{ body: { padding: '16px 16px 0' } }}>
        <Form
          form={filterForm}
          layout="inline"
          style={{ marginBottom: 16 }}
          onFinish={(values) => {
            setFilters({
              versionName: values.versionName ?? '',
              versionCode: values.versionCode ?? '',
              startCreatedAt: values.range?.[0]?.toISOString() ?? '',
              endCreatedAt: values.range?.[1]?.toISOString() ?? '',
            });
            setPage(1);
          }}
        >
          <Form.Item name="versionName" label="版本名称">
            <Input allowClear />
          </Form.Item>
          <Form.Item name="versionCode" label="版本编号">
            <Input allowClear />
          </Form.Item>
          <Form.Item name="range" label="创建时间">
            <DatePicker.RangePicker showTime />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            查询
          </Button>
          <Button
            onClick={() => {
              filterForm.resetFields();
              setFilters({});
              setPage(1);
            }}
          >
            重置
          </Button>
        </Form>
        <div
          className="table-toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 0 14px',
          }}
        >
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void openExport()}>
              新建版本
            </Button>
            {selectedIds.length > 0 && (
              <Popconfirm
                title={`确认删除选中的 ${selectedIds.length} 个版本？`}
                onConfirm={() => void onDelete(selectedIds)}
              >
                <Button danger>批量删除</Button>
              </Popconfirm>
            )}
          </Space>
          <Button icon={<ReloadOutlined />} onClick={loadList} />
        </div>
        <Table<SysVersion>
          rowKey={(row) => row.ID}
          columns={columns}
          dataSource={rows}
          loading={loading}
          scroll={{ x: 'max-content' }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as number[]),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
        />
      </Card>

      {/* createlabel：form + menu/API/dictionary labeltree */}
      <Modal
        title="新建版本"
        open={exportOpen}
        onOk={() => void onExport()}
        onCancel={closeExport}
        confirmLoading={exporting}
        destroyOnHidden
        width={960}
      >
        <Form<ExportFormValues> form={exportForm} layout="vertical" style={{ marginTop: 16 }}>
          <Space size={16} style={{ display: 'flex' }} align="start">
            <Form.Item
              name="versionName"
              label="版本名称"
              rules={[{ required: true, message: '请输入版本名称' }]}
              style={{ width: 240, flex: 1 }}
            >
              <Input placeholder="请输入版本名称" maxLength={64} />
            </Form.Item>
            <Form.Item
              name="versionCode"
              label="版本编号"
              rules={[{ required: true, message: '请输入版本编号' }]}
              style={{ width: 240, flex: 1 }}
            >
              <Input placeholder="示例 v1.0.0" maxLength={32} />
            </Form.Item>
            <Form.Item name="description" label="版本描述" style={{ width: 360, flex: 1 }}>
              <Input placeholder="请输入描述" maxLength={255} />
            </Form.Item>
          </Space>
        </Form>
        <Typography.Text type="secondary">详情：版本 / 菜单 / API / 字典：</Typography.Text>
        {treeLoading ? (
          <div style={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
            <Spin />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 12,
              marginTop: 8,
              maxHeight: 380,
              overflow: 'auto',
            }}
          >
            <div style={{ border: '1px solid #e9edf3', borderRadius: 6, padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>选择菜单（{menuIds.length}）</div>
              <Tree
                checkable
                defaultExpandAll
                treeData={menuTree}
                checkedKeys={menuIds}
                onCheck={(checked) => setMenuIds(checkedNumbers(checked))}
                height={280}
              />
            </div>
            <div style={{ border: '1px solid #e9edf3', borderRadius: 6, padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>选择 API（{apiIds.length}）</div>
              <Tree
                checkable
                defaultExpandAll
                treeData={apiTree}
                checkedKeys={apiIds}
                onCheck={(checked) => setApiIds(checkedNumbers(checked))}
                height={280}
              />
            </div>
            <div style={{ border: '1px solid #e9edf3', borderRadius: 6, padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>选择字典（{dictIds.length}）</div>
              <Tree
                checkable
                defaultExpandAll
                treeData={dictTree}
                checkedKeys={dictIds}
                onCheck={(checked) => setDictIds(checkedNumbers(checked))}
                height={280}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* importversion：label JSON -> labelpreview -> import */}
      <Card title="导入版本" className="table-card" style={{ marginTop: 12 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="默认保存版本详情。选择「导入配置详情」可创建菜单、API、字典进行管理。配置导入说明。"
        />
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Radio.Group
            value={importMode}
            onChange={(event) => {
              setImportMode(event.target.value);
              setCheckedImport(null);
            }}
            options={[
              { label: '版本导入', value: 'record' },
              { label: '配置导入', value: 'resources' },
            ]}
          />
          <Space>
            <Upload
              accept=".json"
              showUploadList={false}
              beforeUpload={(file) => {
                onImportFile(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>选择版本 JSON 文件</Button>
            </Upload>
            {importFileName && <Typography.Text type="secondary">{importFileName}</Typography.Text>}
          </Space>
          <Input.TextArea
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value);
              setCheckedImport(null);
            }}
            rows={4}
            maxLength={128000}
            placeholder="粘贴版本 JSON，最大 128000 字符"
          />
          <Button
            onClick={() => {
              try {
                setImportData(parseVersionPackage(paste));
                setImportFileName('导入的 JSON 文件');
                setCheckedImport(null);
              } catch (error) {
                message.error(error instanceof Error ? error.message : 'JSON 解析失败');
              }
            }}
          >
            解析
          </Button>
          {importPreview && (
            <>
              <Descriptions
                size="small"
                bordered
                column={2}
                items={[
                  {
                    key: 'versionName',
                    label: '版本名称',
                    children: importPreview.versionName || '-',
                  },
                  {
                    key: 'versionCode',
                    label: '版本编号',
                    children: importPreview.versionCode || '-',
                  },
                  {
                    key: 'menus',
                    label: '菜单',
                    children: <Tag color="blue">{importPreview.menus} 个</Tag>,
                  },
                  {
                    key: 'apis',
                    label: 'API',
                    children: <Tag color="blue">{importPreview.apis} 个</Tag>,
                  },
                  {
                    key: 'dicts',
                    label: '字典',
                    span: 2,
                    children: <Tag color="blue">{importPreview.dictionaries} 个</Tag>,
                  },
                ]}
              />
              <Space>
                <Button loading={importing} onClick={() => void previewImport()}>
                  预览验证
                </Button>
                <Button
                  type="primary"
                  disabled={
                    !checkedImport || checkedImport.items.some((item) => item.action === 'conflict')
                  }
                  loading={importing}
                  onClick={() => void onImport()}
                >
                  {importMode === 'record' ? '导入版本' : '导入配置'}
                </Button>
                <Button
                  onClick={() => {
                    setImportData(null);
                    setImportFileName('');
                    setCheckedImport(null);
                  }}
                >
                  清空
                </Button>
              </Space>
              {checkedImport &&
                (checkedImport.mode === 'record' ? (
                  <Alert showIcon type="success" message="校验通过，可以保存版本详情。" />
                ) : (
                  <Table
                    size="small"
                    rowKey={(row) => `${row.kind}:${row.key}`}
                    dataSource={checkedImport.items}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      { title: '类型', dataIndex: 'kind' },
                      { title: '键', dataIndex: 'key' },
                      {
                        title: '操作',
                        dataIndex: 'action',
                        render: (value: string) => (
                          <Tag
                            color={
                              value === 'conflict'
                                ? 'error'
                                : value === 'create'
                                  ? 'success'
                                  : 'default'
                            }
                          >
                            {
                              (
                                {
                                  conflict: '冲突',
                                  create: '创建',
                                  unchanged: '无变化',
                                } as Record<string, string>
                              )[value]
                            }
                          </Tag>
                        ),
                      },
                      { title: '原因', dataIndex: 'reason' },
                    ]}
                  />
                ))}
            </>
          )}
        </Space>
      </Card>
      <Drawer
        title="版本详情"
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        width={800}
        getContainer={() => document.body}
      >
        {detail && (
          <>
            <Descriptions
              column={1}
              items={[
                { key: 'name', label: '版本名称', children: detail.versionName },
                { key: 'code', label: '版本编号', children: detail.versionCode },
                { key: 'desc', label: '描述', children: detail.description },
              ]}
            />
            <Typography.Paragraph copyable={{ text: detail.versionData ?? '' }}>
              版本 JSON 数据
            </Typography.Paragraph>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                background: 'var(--ant-color-fill-quaternary)',
                padding: 12,
              }}
            >
              {formattedSnapshot(detail.versionData)}
            </pre>
          </>
        )}
      </Drawer>
    </div>
  );
}
