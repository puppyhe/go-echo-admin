import { session } from '../../api/request';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Database-driven code generation with field configuration and generated-source preview.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tooltip,
  Upload,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useParams, useSearchParams } from 'react-router-dom';
import { autoCodeApi } from '../../api/endpoints';
import {
  defaultAutoCodeForm,
  fieldFromColumn,
  lowerFirst,
  parseHistoryForm,
  toHump,
  toSQLLine,
  upperFirst,
  type AutoCodeColumn,
  type AutoCodeField,
  type AutoCodeForm,
  type AutoCodeSwitchKey,
} from '../../domain/autoCode';

const DRAFT_KEY = 'gea:auto-code:draft:v1';

// Internal implementation detail.
const FIELD_TYPE_OPTIONS = [
  { label: '字符串', value: 'string' },
  { label: '整数', value: 'int' },
  { label: '无符号整数', value: 'uint' },
  { label: '64位整数', value: 'int64' },
  { label: 'JSON', value: 'json' },
  { label: '数组', value: 'array' },
  { label: '富文本', value: 'richtext' },
  { label: '图片', value: 'picture' },
  { label: '图片集合', value: 'pictures' },
  { label: '附件', value: 'file' },
  { label: '布尔', value: 'bool' },
  { label: '浮点数', value: 'float64' },
  { label: '时间', value: 'time.Time' },
];

// Internal implementation detail.
const SEARCH_TYPE_OPTIONS = [
  { label: '请选择', value: '' },
  { label: '=', value: '=' },
  { label: '>', value: '>' },
  { label: '<', value: '<' },
  { label: 'LIKE', value: 'LIKE' },
  { label: 'BETWEEN', value: 'BETWEEN' },
  { label: 'IN', value: 'IN' },
  { label: '!=', value: '!=' },
  { label: '>=', value: '>=' },
  { label: '<=', value: '<=' },
];

// Internal implementation detail.
const SWITCH_ITEMS: { key: AutoCodeSwitchKey; label: string; tip: string }[] = [
  {
    key: 'geaModel',
    label: 'GEA 基础模型',
    tip: '删除配置',
  },
  {
    key: 'disableDataScope',
    label: '禁用数据范围（兼容模式）',
    tip: '默认关闭数据范围限制；生成结果会保留 API 权限和租户字段。',
  },
  { key: 'autoCreateApiToSql', label: '创建 API', tip: '生成 API 数据库配置' },
  { key: 'autoCreateMenuToSql', label: '创建菜单', tip: '菜单数据库' },
  {
    key: 'autoCreateBtnAuth',
    label: '创建权限',
    tip: '同时生成新增、编辑、删除按钮权限。',
  },
  { key: 'hasExcel', label: '导入/导出 Excel', tip: '生成 Excel 导入导出能力。' },
  { key: 'autoMigrate', label: '自动迁移', tip: '生成数据库迁移；不需要时可以关闭。' },
  {
    key: 'onlyTemplate',
    label: '仅模板',
    tip: '仅下载 CRUD 模板，不保存生成记录。',
  },
];

// Internal implementation detail.
interface FieldRow extends AutoCodeField {
  uid: number;
}

// Internal implementation detail.
let uidSeq = 0;

// Internal implementation detail.
function blankRow(base?: Partial<AutoCodeField>): FieldRow {
  return {
    uid: ++uidSeq,
    fieldName: '',
    fieldType: 'string',
    fieldJson: '',
    columnName: '',
    fieldDesc: '',
    fieldSearchType: '',
    digitSearch: false,
    digitList: true,
    digitSort: false,
    require: false,
    clearable: true,
    errorText: '',
    form: true,
    table: true,
    desc: true,
    excel: false,
    primaryKey: false,
    fieldIndexType: '',
    defaultValue: '',
    dataTypeLong: '',
    dictType: '',
    dataSource: null,
    fieldSearchHide: false,
    ...base,
  };
}

// Internal implementation detail.
function rowFromColumn(col: AutoCodeColumn): FieldRow {
  return blankRow(fieldFromColumn(col));
}

export default function AutoCodePage() {
  const draftKey = session.storageKey(DRAFT_KEY);
  const { message, modal } = App.useApp();
  const [searchParams] = useSearchParams();
  const routeParams = useParams<{ id: string }>();
  const editIdParam = routeParams.id || searchParams.get('id');

  const [form, setForm] = useState<AutoCodeForm>(() => defaultAutoCodeForm());
  const [fieldRows, setFieldRows] = useState<FieldRow[]>([]);
  const [fieldEditor, setFieldEditor] = useState<FieldRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [hasDraft, setHasDraft] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem(draftKey));
    } catch {
      return false;
    }
  });
  const draftLoaded = useRef(false);
  const dbRequest = useRef(0);
  const columnRequest = useRef(0);

  // Internal implementation detail.
  const [dbOptions, setDbOptions] = useState<string[]>([]);
  const [dbName, setDbName] = useState('');
  const [tableOptions, setTableOptions] = useState<string[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [pkgOptions, setPkgOptions] = useState<string[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);

  // Internal implementation detail.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<[string, string][]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);

  const applyForm = useCallback((value: AutoCodeForm) => {
    setForm({ ...value, fields: [] });
    setFieldRows(value.fields.map((field) => blankRow(field)));
    setFieldEditor(null);
  }, []);

  const readForm = (text: string): AutoCodeForm => {
    const raw: unknown = JSON.parse(text);
    const parsed = parseHistoryForm(raw);
    if (!parsed) throw new Error('草稿文件格式错误');
    return parsed;
  };

  // Restore a saved draft on return, but let a selected history record take precedence.
  useEffect(() => {
    if (draftLoaded.current) return;
    draftLoaded.current = true;
    if (editIdParam) return;
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) applyForm(readForm(saved));
    } catch {
      message.warning('加载草稿失败');
    }
  }, [applyForm, editIdParam, message]);

  const patchForm = useCallback((patch: Partial<AutoCodeForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  // Internal implementation detail.
  const updateRow = useCallback((uid: number, patch: Partial<AutoCodeField>) => {
    setFieldRows((prev) =>
      prev.map((row) => {
        if (row.uid !== uid) return row;
        const next: FieldRow = { ...row, ...patch };
        if (patch.fieldName !== undefined && patch.fieldName !== row.fieldName) {
          const jsonOf = (name: string) => lowerFirst(upperFirst(name.trim()));
          const columnOf = (name: string) => toSQLLine(upperFirst(name.trim()));
          if (!next.fieldJson || next.fieldJson === jsonOf(row.fieldName))
            next.fieldJson = jsonOf(next.fieldName);
          if (!next.columnName || next.columnName === columnOf(row.fieldName))
            next.columnName = columnOf(next.fieldName);
        }
        return next;
      }),
    );
  }, []);

  // Internal implementation detail.
  const loadPackages = useCallback(async () => {
    try {
      const list = await autoCodeApi.getPackage();
      setPkgOptions(list.map((item) => item.packageName).filter(Boolean));
    } catch {
      // Internal implementation detail.
    }
  }, []);

  // Internal implementation detail.
  useEffect(() => {
    void autoCodeApi
      .getDB()
      .then((list) => setDbOptions(Array.isArray(list) ? list : []))
      .catch(() => undefined);
    void loadPackages();
  }, [loadPackages]);

  // Internal implementation detail.
  useEffect(() => {
    if (!editIdParam || !/^\d+$/.test(editIdParam)) return;
    const id = Number(editIdParam);
    setMetaLoading(true);
    void autoCodeApi
      .getMeta({ ID: id })
      .then((raw) => {
        const parsed = parseHistoryForm(raw);
        if (!parsed) {
          message.warning('请求失败');
          return;
        }
        applyForm(parsed);
        message.success(`预览成功 #${id}`);
      })
      .catch(() => undefined)
      .finally(() => setMetaLoading(false));
  }, [applyForm, editIdParam, message]);

  // Internal implementation detail.
  const onDbChange = (value: string) => {
    const request = ++dbRequest.current;
    columnRequest.current += 1;
    setColumnsLoading(false);
    setDbName(value);
    setTableOptions([]);
    if (!value) return;
    void autoCodeApi
      .getTables({ dbName: value })
      .then((list) => {
        if (request === dbRequest.current) setTableOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => undefined);
  };

  // Internal implementation detail.
  const loadColumns = async (tableName: string) => {
    if (!dbName || !tableName) {
      message.warning('请选择数据库');
      return;
    }
    const request = ++columnRequest.current;
    setColumnsLoading(true);
    try {
      const columns = await autoCodeApi.getColumn({ dbName, tableName });
      if (request !== columnRequest.current) return;
      const rows = (Array.isArray(columns) ? columns : []).map(rowFromColumn);
      const hump = toHump(tableName);
      patchForm({
        structName: upperFirst(hump),
        packageName: lowerFirst(hump),
        humpPackageName: lowerFirst(hump),
        businessDB: dbName,
        abbreviation: lowerFirst(hump),
        description: `${hump}表名`,
        tableName,
        // Internal implementation detail.
        geaModel: false,
        disableDataScope: true,
        autoMigrate: false,
      });
      setFieldRows(rows);
      message.success(`已导入表 ${tableName}，包含 ${rows.length} 个字段；保留数据已关闭`);
    } catch {
      // Internal implementation detail.
    } finally {
      if (request === columnRequest.current) setColumnsLoading(false);
    }
  };

  // Internal implementation detail.
  const onSwitchChange = (key: AutoCodeSwitchKey, checked: boolean) => {
    if (key === 'onlyTemplate' && checked) {
      modal.confirm({
        title: '确定仅使用模板？',
        content: '仅使用模板不生成字段列表和 CRUD 代码。请点击添加字段按钮手动配置字段。',
        onOk: () => {
          patchForm({ onlyTemplate: true });
          setFieldRows([]);
        },
      });
      return;
    }
    if (key === 'hasExcel') setFieldRows((rows) => rows.map((row) => ({ ...row, excel: checked })));
    patchForm({ [key]: checked } as Partial<AutoCodeForm>);
  };

  // Internal implementation detail.
  const validate = (): string | null => {
    const structName = upperFirst(form.structName.trim());
    const abbreviation = form.abbreviation.trim();
    const packageName = form.package.trim();
    if (!structName) return '请输入模型名称';
    if (!abbreviation) return '请输入简称';
    if (!form.description.trim()) return '请输入中文名称';
    if (!packageName) return '请选择创建模板';
    if (!form.packageName.trim()) return '请输入前端文件名';
    if (
      !form.geaModel &&
      !form.onlyTemplate &&
      fieldRows.filter((row) => row.primaryKey).length !== 1
    )
      return '请选择主键字段';
    if (form.isTree && !form.treeJson) return '请选择树节点字段';
    if (structName === abbreviation) return '模型名称与简称不能相同';
    if (packageName === abbreviation) return '包名与简称不能相同';
    if (!form.onlyTemplate) {
      if (fieldRows.length === 0) return '请先导入字段';
      if (
        fieldRows.some(
          (row) => !row.fieldName.trim() || !row.fieldJson.trim() || !row.columnName.trim(),
        )
      ) {
        return '字段名称、JSON 表达式、数据库字段名不能为空';
      }
      if (fieldRows.some((row) => !row.fieldType)) return '请选择字段类型';
      for (const key of ['fieldName', 'fieldJson', 'columnName'] as const) {
        const names = fieldRows.map((row) =>
          key === 'fieldName' ? upperFirst(row[key].trim()) : row[key].trim(),
        );
        if (new Set(names).size !== names.length)
          return '字段名称、JSON 名称、数据库字段名不能重复';
      }
      if (fieldRows.some((row) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.fieldName.trim())))
        return '字段名称只能包含字母、下划线和数字，且以字母或下划线开头';
      if (fieldRows.some((row) => upperFirst(row.fieldName.trim()) === structName))
        return '字段名称不能与模型名称相同';
      if (fieldRows.some((row) => row.fieldJson.trim() === packageName))
        return 'JSON 表达式不能与包名相同';
    }
    return null;
  };

  // Internal implementation detail.
  const buildPayload = (): AutoCodeForm => {
    const structName = upperFirst(form.structName.trim());
    const packageName = form.packageName.trim();
    return {
      abbreviation: form.abbreviation.trim(),
      structName,
      description: form.description.trim(),
      tableName: form.tableName.replace(/\s+/g, '') || toSQLLine(lowerFirst(structName)),
      packageName,
      package: form.package.trim(),
      humpPackageName: form.humpPackageName?.trim() || lowerFirst(structName),
      treeJson: form.treeJson,
      generateWeb: form.generateWeb ?? true,
      generateServer: form.generateServer ?? true,
      businessDB: form.businessDB,
      geaModel: form.geaModel,
      disableDataScope: form.disableDataScope ?? false,
      autoCreateApiToSql: form.autoCreateApiToSql,
      autoCreateMenuToSql: form.autoCreateMenuToSql,
      autoCreateBtnAuth: form.autoCreateBtnAuth,
      hasExcel: form.hasExcel,
      autoMigrate: form.autoMigrate,
      onlyTemplate: form.onlyTemplate,
      isTree: form.isTree,
      fields: fieldRows.map(({ uid: _uid, ...row }) => ({
        ...row,
        fieldName: upperFirst(row.fieldName.trim()),
        fieldType: row.fieldType,
        fieldJson: row.fieldJson.trim(),
        columnName: row.columnName.trim(),
        fieldDesc: row.fieldDesc.trim(),
        fieldSearchType: row.fieldSearchType,
        digitSearch: row.fieldSearchType !== '',
        digitList: row.digitList,
        digitSort: row.digitSort,
        require: row.require,
        clearable: row.clearable,
        errorText: row.errorText,
      })),
    };
  };

  const snapshot = (): AutoCodeForm => ({
    ...form,
    fields: fieldRows.map(({ uid: _uid, ...field }) => field),
  });

  const saveDraft = () => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(snapshot()));
      setHasDraft(true);
      message.success('已返回生成页面');
    } catch {
      message.error('请求失败，导出 JSON 配置保存出错');
    }
  };

  const restoreDraft = () => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (!saved) {
        setHasDraft(false);
        message.info('配置已保存');
        return;
      }
      const parsed = readForm(saved);
      modal.confirm({
        title: '恢复草稿配置',
        content: '发现已保存的表单草稿，是否恢复？',
        onOk: () => applyForm(parsed),
      });
    } catch {
      message.error('导入 JSON 配置失败，请重新导出文件');
    }
  };

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(draftKey);
      setHasDraft(false);
      applyForm(defaultAutoCodeForm());
      message.success('重置表单');
    } catch {
      message.error('清除草稿失败');
    }
  };

  const exportJSON = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.structName.trim().replace(/[^A-Za-z0-9_-]/g, '_') || 'form_data'}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const importJSON = async (file: File) => {
    if (!/\.json$/i.test(file.name)) {
      message.warning('请选择 JSON 配置文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.warning('配置文件大小不能超过 5MB');
      return;
    }
    setImporting(true);
    try {
      const parsed = readForm(await file.text());
      modal.confirm({
        title: '导入 JSON 配置',
        content: `将导入 ${parsed.fields.length} 个字段配置，是否继续？`,
        onOk: () => {
          applyForm(parsed);
          message.success('JSON 文件导入成功');
        },
      });
    } catch {
      message.error('JSON 配置导入失败，请重新选择导出文件');
    } finally {
      setImporting(false);
    }
  };

  const moveField = (uid: number, direction: -1 | 1) => {
    setFieldRows((previous) => {
      const index = previous.findIndex((row) => row.uid === uid);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= previous.length) return previous;
      const ordered = [...previous];
      [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
      return ordered;
    });
  };

  // Internal implementation detail.
  const onPreview = async () => {
    const error = validate();
    if (error) {
      message.warning(error);
      return;
    }
    setPreviewing(true);
    try {
      const files = await autoCodeApi.preview(buildPayload());
      const entries = Object.entries(files ?? {});
      if (entries.length === 0) {
        message.warning('预览未返回任何文件');
        return;
      }
      setPreviewFiles(entries);
      setPreviewOpen(true);
    } catch {
      // Internal implementation detail.
    } finally {
      setPreviewing(false);
    }
  };

  // Internal implementation detail.
  const onCreate = async () => {
    const error = validate();
    if (error) {
      message.warning(error);
      return;
    }
    setCreating(true);
    try {
      await autoCodeApi.createTemp(buildPayload());
      message.success(form.onlyTemplate ? '仅模板下载' : '生成记录保存成功');
    } catch {
      // Internal implementation detail.
    } finally {
      setCreating(false);
    }
  };

  // Internal implementation detail.
  const fieldColumns: TableColumnsType<FieldRow> = [
    {
      title: '#',
      key: 'idx',
      width: 56,
      align: 'center',
      render: (_v, _row, index) => index + 1,
    },
    {
      title: '主键',
      width: 64,
      render: (_, row) => (
        <Checkbox
          disabled={form.geaModel}
          checked={row.primaryKey}
          onChange={(event) => updateRow(row.uid, { primaryKey: event.target.checked })}
        />
      ),
    },
    {
      title: '默认值',
      width: 140,
      render: (_, row) => (
        <Input
          size="small"
          value={row.defaultValue}
          onChange={(event) => updateRow(row.uid, { defaultValue: event.target.value })}
        />
      ),
    },
    ...(
      [
        { key: 'form', label: '新增/编辑' },
        { key: 'table', label: '列表' },
        { key: 'desc', label: '详情' },
        { key: 'excel', label: '导入/导出' },
      ] as const
    ).map((item) => ({
      title: item.label,
      width: 82,
      render: (_: unknown, row: FieldRow) => (
        <Checkbox
          checked={row[item.key]}
          onChange={(event) =>
            updateRow(row.uid, {
              [item.key]: event.target.checked,
              ...(item.key === 'table' ? { digitList: event.target.checked } : {}),
            })
          }
        />
      ),
    })),
    {
      title: '索引',
      width: 125,
      render: (_, row) => (
        <Select
          size="small"
          allowClear
          style={{ width: '100%' }}
          value={row.fieldIndexType || undefined}
          options={[
            { value: 'index', label: '普通索引' },
            { value: 'uniqueIndex', label: '唯一索引' },
          ]}
          onChange={(value) => updateRow(row.uid, { fieldIndexType: value || '' })}
        />
      ),
    },
    {
      title: '长度/精度',
      width: 115,
      render: (_, row) => (
        <Input
          size="small"
          value={row.dataTypeLong}
          onChange={(event) => updateRow(row.uid, { dataTypeLong: event.target.value })}
        />
      ),
    },
    {
      title: '字段名',
      dataIndex: 'fieldName',
      width: 150,
      render: (_v, row) => (
        <Input
          size="small"
          value={row.fieldName}
          placeholder="请输入"
          onChange={(e) => updateRow(row.uid, { fieldName: e.target.value })}
        />
      ),
    },
    {
      title: '字段类型',
      dataIndex: 'fieldType',
      width: 150,
      render: (_v, row) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={row.fieldType || undefined}
          options={FIELD_TYPE_OPTIONS}
          placeholder="请选择字段类型"
          onChange={(value) => updateRow(row.uid, { fieldType: value ?? 'string' })}
        />
      ),
    },
    {
      title: 'JSON 表达式',
      dataIndex: 'fieldJson',
      width: 150,
      render: (_v, row) => (
        <Input
          size="small"
          value={row.fieldJson}
          placeholder="请输入"
          onChange={(e) => updateRow(row.uid, { fieldJson: e.target.value })}
        />
      ),
    },
    {
      title: '数据库字段',
      dataIndex: 'columnName',
      width: 150,
      render: (_v, row) => (
        <Input
          size="small"
          value={row.columnName}
          placeholder="下划线命名"
          onChange={(e) => updateRow(row.uid, { columnName: e.target.value })}
        />
      ),
    },
    {
      title: '字段说明',
      dataIndex: 'fieldDesc',
      width: 170,
      render: (_v, row) => (
        <Input
          size="small"
          value={row.fieldDesc}
          placeholder="例如用户名称"
          onChange={(e) => updateRow(row.uid, { fieldDesc: e.target.value })}
        />
      ),
    },
    {
      title: '搜索条件',
      dataIndex: 'fieldSearchType',
      width: 120,
      render: (_v, row) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={row.fieldSearchType}
          options={SEARCH_TYPE_OPTIONS}
          placeholder="请选择"
          onChange={(value) => updateRow(row.uid, { fieldSearchType: value ?? '' })}
        />
      ),
    },
    {
      title: '列表展示',
      dataIndex: 'digitList',
      width: 80,
      align: 'center',
      render: (_v, row) => (
        <Checkbox
          checked={row.digitList}
          onChange={(e) =>
            updateRow(row.uid, { digitList: e.target.checked, table: e.target.checked })
          }
        />
      ),
    },
    {
      title: '排序',
      dataIndex: 'digitSort',
      width: 64,
      align: 'center',
      render: (_v, row) => (
        <Checkbox
          checked={row.digitSort}
          onChange={(e) => updateRow(row.uid, { digitSort: e.target.checked })}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_v, row, index) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setFieldEditor({ ...row })}
          >
            编辑
          </Button>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            title="上移字段"
            disabled={index === 0}
            onClick={() => moveField(row.uid, -1)}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            title="下移字段"
            disabled={index === fieldRows.length - 1}
            onClick={() => moveField(row.uid, 1)}
          />
          <Popconfirm
            title="确认删除字段？"
            onConfirm={() => setFieldRows((prev) => prev.filter((item) => item.uid !== row.uid))}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} title="删除字段" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {editIdParam && /^\d+$/.test(editIdParam) && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`编辑生成记录 #${editIdParam}${metaLoading ? '（加载中…）' : ''}`}
          description="可加载历史配置并继续调整生成参数。"
        />
      )}

      {/* label */}
      <Card className="filter-card">
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="名称" required>
                <Input
                  value={form.structName}
                  placeholder="请输入"
                  onChange={(e) => patchForm({ structName: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="路由" required tooltip="对象路由分组">
                <Input
                  value={form.abbreviation}
                  placeholder="请输入结构体名称"
                  onBlur={() => patchForm({ abbreviation: form.abbreviation.trim() })}
                  onChange={(e) => patchForm({ abbreviation: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="中文名称" required tooltip="中文 API 说明">
                <Input
                  value={form.description}
                  placeholder="中文 API 说明"
                  onChange={(e) => patchForm({ description: e.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
                <Form.Item label="数据库" tooltip="选择数据库后导入字段">
                <Select
                  showSearch
                  allowClear
                  placeholder="请选择数据库"
                  value={dbName || undefined}
                  options={dbOptions.map((db) => ({ label: db, value: db }))}
                  optionFilterProp="label"
                  onChange={(value) => onDbChange(value ?? '')}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
                <Form.Item label="表名" tooltip="选择表并读取字段信息">
                <AutoComplete
                  value={form.tableName}
                  options={tableOptions.map((table) => ({ value: table }))}
                  disabled={!dbName}
                  placeholder={dbName ? '请选择表名（导入字段）' : '请选择数据库'}
                  filterOption={(input, option) =>
                    String(option?.value ?? '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  onChange={(value) => patchForm({ tableName: value })}
                  onSelect={(value) => {
                    const table = String(value);
                    patchForm({ tableName: table });
                    void loadColumns(table);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="模板" required tooltip="管理创建选中">
                <Space.Compact style={{ width: '100%' }}>
                  <AutoComplete
                    style={{ flex: 1 }}
                    value={form.package}
                    options={pkgOptions.map((pkg) => ({ value: pkg }))}
                    placeholder="选择创建模板"
                    filterOption={(input, option) =>
                      String(option?.value ?? '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    onChange={(value) => patchForm({ package: value })}
                  />
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => void loadPackages()}
                    title="刷新模板列表"
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="前端文件名" required>
                <Input
                  value={form.packageName}
                  placeholder="例如 customer"
                  onChange={(event) => patchForm({ packageName: event.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Go 文件名">
                <Input
                  value={form.humpPackageName}
                  placeholder="命名"
                  onChange={(event) => patchForm({ humpPackageName: event.target.value })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="数据库" tooltip="选择业务数据库，默认使用当前数据库">
                <Select
                  allowClear
                  showSearch
                  value={form.businessDB || undefined}
                  options={dbOptions.map((value) => ({ value, label: value }))}
                  onChange={(value) => patchForm({ businessDB: value || '' })}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="树形结构" tooltip="创建 parentID 字段，类型为 int">
                <Switch
                  checked={form.isTree}
                  onChange={(checked) => patchForm({ isTree: checked })}
                />
                {form.isTree && (
                  <Select
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder="树形节点字段"
                    value={form.treeJson || undefined}
                    options={fieldRows.map((row) => ({
                      value: row.fieldJson,
                      label: row.fieldDesc || row.fieldJson,
                    }))}
                    onChange={(treeJson) => patchForm({ treeJson })}
                  />
                )}
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* label */}
      <Card className="filter-card" title="替换图片">
        <Row gutter={[16, 12]}>
          {SWITCH_ITEMS.map((item) => (
            <Col key={item.key} span={6}>
              <Space size={8}>
                <Tooltip title={item.tip}>
                  <span>{item.label}</span>
                </Tooltip>
                <Switch
                  size="small"
                  checked={form[item.key]}
                  onChange={(checked) => onSwitchChange(item.key, checked)}
                />
              </Space>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 字段编辑标签 */}
      <Card className="table-card" styles={{ body: { padding: '16px 16px 0' } }}>
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={form.onlyTemplate}
              onClick={() => setFieldRows((prev) => [...prev, blankRow()])}
            >
              添加字段
            </Button>
            <span style={{ color: '#999', fontSize: 12 }}>
              {columnsLoading ? '导入中…' : '导入字段；字段 JSON 表达式'}
            </span>
          </Space>
        </div>
        <Table<FieldRow>
          rowKey="uid"
          columns={fieldColumns}
          dataSource={form.onlyTemplate ? [] : fieldRows}
          loading={columnsLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          size="small"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 0 16px' }}>
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={exportJSON}>
              导出 JSON
            </Button>
            <Upload
              accept=".json,application/json"
              showUploadList={false}
              beforeUpload={(file) => {
                void importJSON(file);
                return false;
              }}
              disabled={importing}
            >
              <Button icon={<UploadOutlined />} loading={importing}>
                导入 JSON
              </Button>
            </Upload>
            <Button icon={<SaveOutlined />} onClick={saveDraft}>
              保存草稿
            </Button>
            <Button disabled={!hasDraft} onClick={restoreDraft}>
              恢复草稿
            </Button>
            <Popconfirm title="重置表单？" onConfirm={clearDraft}>
              <Button>重置</Button>
            </Popconfirm>
            <Popconfirm
              title="后端文件路由/API 菜单，后端服务详情，详情？"
              onConfirm={() => void onCreate()}
            >
              <Button type="primary" icon={<CodeOutlined />} loading={creating}>
                创建
              </Button>
            </Popconfirm>
            <Button icon={<EyeOutlined />} loading={previewing} onClick={() => void onPreview()}>
              预览
            </Button>
          </Space>
        </div>
      </Card>

      <Drawer
        title={`编辑：${fieldEditor?.fieldName || '字段'}`}
        open={fieldEditor !== null}
        onClose={() => setFieldEditor(null)}
        width={520}
        extra={
          <Space>
            <Button onClick={() => setFieldEditor(null)}>取消</Button>
            <Button
              type="primary"
              onClick={() => {
                if (fieldEditor) updateRow(fieldEditor.uid, fieldEditor);
                setFieldEditor(null);
              }}
            >
              确认
            </Button>
          </Space>
        }
        getContainer={() => document.body}
      >
        {fieldEditor && (
          <Form layout="vertical">
            {fieldEditor.databaseDefault && (
              <Alert
                type="info"
                showIcon
                message="数据库保留默认值"
                description="数据库保留默认值；编辑默认值。"
              />
            )}
            <Form.Item label="字段默认值">
              <Input
                value={fieldEditor.defaultValue}
                placeholder="字段类型详情，如 0、false、默认详情"
                onChange={(event) =>
                  setFieldEditor({
                    ...fieldEditor,
                    defaultValue: event.target.value,
                    databaseDefault: false,
                    hasDefault: event.target.value !== '',
                  })
                }
              />
            </Form.Item>
            <Form.Item label="数据库字段">
              <Space wrap>
                <Checkbox
                  checked={fieldEditor.hasDefault}
                  onChange={(event) =>
                    setFieldEditor({
                      ...fieldEditor,
                      hasDefault: event.target.checked,
                      ...(!event.target.checked ? { defaultValue: '' } : {}),
                    })
                  }
                >
                  是否默认值（标签）
                </Checkbox>
                <Checkbox
                  disabled={fieldEditor.primaryKey}
                  checked={fieldEditor.nullable}
                  onChange={(event) =>
                    setFieldEditor({
                      ...fieldEditor,
                      nullable: event.target.checked,
                      notNull: !event.target.checked,
                      clearable: event.target.checked,
                    })
                  }
                >
                  允许 NULL
                </Checkbox>
                <Checkbox
                  disabled={
                    !fieldEditor.primaryKey || !/^(u?int(64)?)$/.test(fieldEditor.fieldType)
                  }
                  checked={fieldEditor.autoIncrement}
                  onChange={(event) =>
                    setFieldEditor({
                      ...fieldEditor,
                      autoIncrement: event.target.checked,
                      form: !event.target.checked,
                      require: !event.target.checked,
                    })
                  }
                >
                  自动增长
                </Checkbox>
              </Space>
            </Form.Item>
            <Form.Item label="数据库长度/精度">
              <Input
                value={fieldEditor.dataTypeLong}
                placeholder="例如 255 或 10,2"
                onChange={(event) =>
                  setFieldEditor({ ...fieldEditor, dataTypeLong: event.target.value })
                }
              />
            </Form.Item>
            <Form.Item label="索引">
              <Select
                allowClear
                value={fieldEditor.fieldIndexType || undefined}
                options={[
                  { value: 'index', label: '普通索引' },
                  { value: 'uniqueIndex', label: '唯一索引' },
                ]}
                onChange={(value) =>
                  setFieldEditor({ ...fieldEditor, fieldIndexType: value || '' })
                }
              />
            </Form.Item>
            <Form.Item label="主键">
              <Switch
                disabled={form.geaModel}
                checked={fieldEditor.primaryKey}
                onChange={(primaryKey) =>
                  setFieldEditor({
                    ...fieldEditor,
                    primaryKey,
                    ...(primaryKey ? { nullable: false } : { autoIncrement: false }),
                  })
                }
              />
            </Form.Item>
            <Form.Item label="字典类型">
              <Input
                value={fieldEditor.dictType}
                placeholder="例如 status"
                onChange={(event) =>
                  setFieldEditor({ ...fieldEditor, dictType: event.target.value })
                }
              />
            </Form.Item>
            <Form.Item label="显示位置">
              <Space wrap>
                {(
                  [
                    { key: 'form', label: '表单' },
                    { key: 'table', label: '列表' },
                    { key: 'desc', label: '详情' },
                    { key: 'excel', label: '导入/导出' },
                  ] as const
                ).map((item) => (
                  <Checkbox
                    key={item.key}
                    checked={fieldEditor[item.key]}
                    onChange={(event) =>
                      setFieldEditor({
                        ...fieldEditor,
                        [item.key]: event.target.checked,
                        ...(item.key === 'table' ? { digitList: event.target.checked } : {}),
                      })
                    }
                  >
                    {item.label}
                  </Checkbox>
                ))}
              </Space>
            </Form.Item>
            <Form.Item label="搜索隐藏">
              <Switch
                checked={fieldEditor.fieldSearchHide}
                onChange={(fieldSearchHide) => setFieldEditor({ ...fieldEditor, fieldSearchHide })}
              />
            </Form.Item>
            <Form.Item label="数据来源">
              <Switch
                checked={Boolean(fieldEditor.dataSource)}
                onChange={(enabled) =>
                  setFieldEditor({
                    ...fieldEditor,
                    dataSource: enabled
                      ? {
                          dbName: form.businessDB,
                          table: '',
                          label: '',
                          value: '',
                          association: 1,
                          hasDeletedAt: true,
                        }
                      : null,
                  })
                }
              />
            </Form.Item>
            {fieldEditor.dataSource && (
              <>
                {(['dbName', 'table', 'label', 'value'] as const).map((key, index) => (
                  <Form.Item key={key} label={['数据库（默认值）', '表名', '字段', '值'][index]}>
                    <Input
                      value={fieldEditor.dataSource![key]}
                      onChange={(event) =>
                        setFieldEditor({
                          ...fieldEditor,
                          dataSource: { ...fieldEditor.dataSource!, [key]: event.target.value },
                        })
                      }
                    />
                  </Form.Item>
                ))}
                <Form.Item label="关联方式">
                  <Select
                    value={fieldEditor.dataSource.association}
                    options={[
                      { value: 1, label: '单选（下拉框）' },
                      { value: 2, label: '多选（复选框）' },
                    ]}
                    onChange={(association) =>
                      setFieldEditor({
                        ...fieldEditor,
                        dataSource: { ...fieldEditor.dataSource!, association },
                      })
                    }
                  />
                </Form.Item>
                <Form.Item label="软删除字段">
                  <Switch
                    checked={fieldEditor.dataSource.hasDeletedAt}
                    onChange={(hasDeletedAt) =>
                      setFieldEditor({
                        ...fieldEditor,
                        dataSource: { ...fieldEditor.dataSource!, hasDeletedAt },
                      })
                    }
                  />
                </Form.Item>
              </>
            )}
            <Form.Item label="必填">
              <Switch
                checked={fieldEditor.require}
                onChange={(checked) => setFieldEditor({ ...fieldEditor, require: checked })}
              />
            </Form.Item>
            <Form.Item label="可清空">
              <Switch
                checked={fieldEditor.clearable}
                onChange={(checked) => setFieldEditor({ ...fieldEditor, clearable: checked })}
              />
            </Form.Item>
            <Form.Item label="校验失败消息">
              <Input
                value={fieldEditor.errorText}
                placeholder="请输入字段校验提示"
                onChange={(event) =>
                  setFieldEditor({ ...fieldEditor, errorText: event.target.value })
                }
              />
            </Form.Item>
            <Form.Item label="显示在列表">
              <Switch
                checked={fieldEditor.digitList}
                onChange={(checked) =>
                  setFieldEditor({ ...fieldEditor, digitList: checked, table: checked })
                }
              />
            </Form.Item>
            <Form.Item label="是否排序">
              <Switch
                checked={fieldEditor.digitSort}
                onChange={(checked) => setFieldEditor({ ...fieldEditor, digitSort: checked })}
              />
            </Form.Item>
          </Form>
        )}
      </Drawer>

      {/* 预览代码：预览 Modal + 预览文件 Tabs + 代码块 */}
      <Modal
        title="预览"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="100%"
        style={{ top: 16, maxWidth: '100vw', paddingBottom: 0 }}
        styles={{ body: { height: 'calc(100vh - 110px)', overflow: 'hidden' } }}
        destroyOnHidden
      >
        <Tabs
          tabPosition="left"
          style={{ height: '100%' }}
          items={previewFiles.map(([name, code]) => ({
            key: name,
            label: <span title={name}>{name.split('/').pop() || name}</span>,
            children: (
              <pre
                style={{
                  margin: 0,
                  height: '100%',
                  overflow: 'auto',
                  padding: 12,
                  fontSize: 12,
                  lineHeight: 1.6,
                  background: '#f6f8fa',
                  borderRadius: 6,
                  fontFamily: 'Menlo, Consolas, "Courier New", monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {code}
              </pre>
            ),
          }))}
        />
      </Modal>
    </div>
  );
}
