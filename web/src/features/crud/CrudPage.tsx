// Internal implementation detail.
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { App, Button, Card, Form, Grid, Modal, Popconfirm, Space, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { PageInfo, PageResult } from '../../types';
import { useBtnAuth } from '../../auth/useBtnAuth';
import { translateUiText, zh } from '../../locale/zh';
import {
  renderFormControl,
  renderTableValue,
  type CrudField,
  type CrudOption,
} from './fieldRenderers';

export interface CrudPageHandle {
  // Internal implementation detail.
  reload: () => void;
}

// Internal implementation detail.
type FormValues = Record<string, string | number | boolean | null | undefined>;
type NumericKey<T> = Extract<
  { [K in keyof T]-?: T[K] extends number ? K : never }[keyof T],
  string
>;

export interface CrudPageProps<T extends object, Input extends object = Record<string, unknown>> {
  // Internal implementation detail.
  fields: CrudField<T & Input>[];
  // Internal implementation detail.
  rowKey?: NumericKey<T> | ((row: T) => number);
  // Internal implementation detail.
  actionRef?: Ref<CrudPageHandle>;
  // Internal implementation detail.
  list: (page: PageInfo) => Promise<PageResult<T>>;
  // Internal implementation detail.
  create?: (values: Input) => Promise<unknown>;
  // Internal implementation detail.
  update?: (values: Input) => Promise<unknown>;
  // Internal implementation detail.
  updateById?: (id: number, values: Input) => Promise<unknown>;
  // Internal implementation detail.
  getDetail?: (id: number) => Promise<T>;
  // Internal implementation detail.
  toFormValues?: (row: T) => Input;
  // Internal implementation detail.
  remove?: (row: T) => Promise<unknown>;
  // Internal implementation detail.
  removeBatch?: (ids: number[]) => Promise<unknown>;
  // Internal implementation detail.
  beforeSubmit?: (values: Input, mode: 'create' | 'edit', row: T | null) => Input;
  // Internal implementation detail.
  rowActions?: (row: T, reload: () => void) => ReactNode;
  // Internal implementation detail.
  auth?: { add?: string; edit?: string; delete?: string };
  // Internal implementation detail.
  extraToolbar?: ReactNode;
}

export default function CrudPage<T extends object, Input extends object = Record<string, unknown>>(
  props: CrudPageProps<T, Input>,
) {
  const {
    fields,
    list,
    create,
    update,
    updateById,
    getDetail,
    toFormValues,
    rowKey,
    actionRef,
    remove,
    removeBatch,
    beforeSubmit,
    rowActions,
    auth,
    extraToolbar,
  } = props;
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const hasBtn = useBtnAuth();

  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openingID, setOpeningID] = useState<number>();
  // Internal implementation detail.
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, CrudOption[]>>({});

  const [filterForm] = Form.useForm<FormValues>();
  const [modalForm] = Form.useForm<FormValues>();
  // Internal implementation detail.
  const seqRef = useRef(0);
  const editSeqRef = useRef(0);
  const submittingRef = useRef(false);
  const idOf = (row: T): number =>
    typeof rowKey === 'function'
      ? rowKey(row)
      : Number((row as Record<string, unknown>)[rowKey ?? 'ID']);

  useEffect(
    () => () => {
      editSeqRef.current++;
    },
    [],
  );

  const filterFields = useMemo(() => fields.filter((field) => field.inFilter), [fields]);
  const tableFields = useMemo(() => fields.filter((field) => field.inTable !== false), [fields]);

  const optionsOf = useCallback(
    (field: CrudField): CrudOption[] =>
      (dynamicOptions[field.key] ?? field.options ?? []).map((option) => ({
        ...option,
        label: translateUiText(option.label),
      })),
    [dynamicOptions],
  );

  // Internal implementation detail.
  useEffect(() => {
    let active = true;
    fields.forEach((field) => {
      if (!field.loadOptions) return;
      void field
        .loadOptions()
        .then((options) => {
          if (active) setDynamicOptions((prev) => ({ ...prev, [field.key]: options }));
        })
        .catch(() => undefined);
    });
    return () => {
      active = false;
    };
  }, [fields]);

  const loadList = useCallback(() => {
    const seq = ++seqRef.current;
    setLoading(true);
    void list({ page, pageSize, ...filters })
      .then((result) => {
        if (seq !== seqRef.current) return;
        const lastPage = Math.max(1, Math.ceil((result.total ?? 0) / pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          setSelectedIds([]);
          return;
        }
        setRows(result.list ?? []);
        setTotal(result.total ?? 0);
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setRows([]);
        setTotal(0);
        setSelectedIds([]);
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
  }, [list, page, pageSize, filters]);

  useImperativeHandle(actionRef, () => ({ reload: loadList }), [loadList]);

  useEffect(() => {
    loadList();
    return () => {
      seqRef.current++;
    };
  }, [loadList]);

  const onSearch = () => {
    const values = filterForm.getFieldsValue();
    setFilters(
      Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ),
    );
    setPage(1);
    setSelectedIds([]);
  };

  const onReset = () => {
    filterForm.resetFields();
    setFilters({});
    setPage(1);
    setSelectedIds([]);
  };

  const openCreate = () => {
    editSeqRef.current++;
    setEditing(null);
    modalForm.resetFields();
    const defaults: FormValues = {};
    fields.forEach((field) => {
      if (field.inForm !== false && field.defaultValue !== undefined)
        defaults[field.key] = field.defaultValue;
    });
    modalForm.setFieldsValue(defaults);
    setModalOpen(true);
  };

  const openEdit = async (row: T) => {
    const seq = ++editSeqRef.current;
    setOpeningID(idOf(row));
    try {
      const detail = getDetail ? await getDetail(idOf(row)) : row;
      if (seq !== editSeqRef.current) return;
      setEditing(detail);
      modalForm.resetFields();
      const rowRecord = (toFormValues ? toFormValues(detail) : detail) as unknown as FormValues;
      const values: FormValues = {};
      fields.forEach((field) => {
        if (field.inForm === false || field.formOnlyOnCreate) return;
        if (field.key in rowRecord) values[field.key] = rowRecord[field.key];
      });
      modalForm.setFieldsValue(values);
      setModalOpen(true);
    } catch {
      // Internal implementation detail.
    } finally {
      if (seq === editSeqRef.current) setOpeningID(undefined);
    }
  };

  const onSubmit = async () => {
    if (submittingRef.current) return;
    const values = (await modalForm.validateFields()) as Input;
    const payload = beforeSubmit
      ? beforeSubmit(values, editing ? 'edit' : 'create', editing)
      : values;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (editing) {
        if (updateById) await updateById(idOf(editing), payload);
        else await update?.(payload);
        message.success(zh['saved']);
      } else {
        await create?.(payload);
        message.success(zh['created']);
      }
      setModalOpen(false);
      modalForm.resetFields();
      loadList();
    } catch {
      // Internal implementation detail.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const onDelete = async (row: T) => {
    await remove?.(row);
    message.success(zh['deleted']);
    // Internal implementation detail.
    if (rows.length === 1 && page > 1) setPage(page - 1);
    else loadList();
  };

  const onDeleteBatch = async () => {
    await removeBatch?.(selectedIds);
    message.success(zh['deleted']);
    setSelectedIds([]);
    if (rows.length === selectedIds.length && page > 1) setPage(page - 1);
    else loadList();
  };

  const canAdd = Boolean(create) && (!auth?.add || hasBtn(auth.add));
  const canEdit = Boolean(update || updateById) && (!auth?.edit || hasBtn(auth.edit));
  const canDelete = Boolean(remove) && (!auth?.delete || hasBtn(auth.delete));
  const hasActions = canEdit || canDelete || Boolean(rowActions);

  const columns: TableColumnsType<T> = (() => {
    const cols: TableColumnsType<T> = tableFields.map((field) => {
      const conf = typeof field.inTable === 'object' ? field.inTable : {};
      return {
        title: translateUiText(field.title),
        dataIndex: field.key,
        width: conf.width,
        align: conf.align,
        render: (value: unknown, record: T) =>
          renderTableValue(
            value,
            { ...field, title: translateUiText(field.title), options: optionsOf(field) },
            record as unknown as Record<string, unknown>,
          ),
      };
    });
    if (hasActions) {
      cols.push({
        title: zh['actions'],
        key: 'crud-actions',
        width: screens.md === false ? 112 : 240,
        fixed: 'right',
        render: (_: unknown, row: T) => (
          <Space size={4} wrap>
            {rowActions?.(row, loadList)}
            {canEdit && (
              <Button
                type="link"
                size="small"
                loading={openingID === idOf(row)}
                disabled={openingID !== undefined && openingID !== idOf(row)}
                onClick={() => void openEdit(row)}
              >
                {zh['edit']}
              </Button>
            )}
            {canDelete && (
              <Popconfirm
                title={zh['confirmDelete']}
                onConfirm={() => onDelete(row).catch(() => undefined)}
              >
                <Button type="link" size="small" danger>
                  {zh['delete']}
                </Button>
              </Popconfirm>
            )}
          </Space>
        ),
      });
    }
    return cols;
  })();

  const modalFields = fields.filter(
    (field) => field.inForm !== false && !(editing && field.formOnlyOnCreate),
  );

  return (
    <div>
      {/* searchlabellistlabel。 */}
      {filterFields.length > 0 && (
        <Card className="filter-card">
          <Form form={filterForm} layout="inline" onFinish={onSearch}>
            {filterFields.map((field) => (
              <Form.Item
                key={field.key}
                name={String(field.key)}
                label={translateUiText(field.title)}
              >
                {renderFormControl(
                  {
                    ...field,
                    title: translateUiText(field.title),
                    placeholder: field.placeholder ? translateUiText(field.placeholder) : undefined,
                    required: false,
                  },
                  optionsOf(field),
                  false,
                )}
              </Form.Item>
            ))}
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                  {zh['query']}
                </Button>
                <Button icon={<ReloadOutlined />} onClick={onReset}>
                  {zh['reset']}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}
      <Card className="table-card">
        <div
          className="table-toolbar"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Space>
            {canAdd && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={openingID !== undefined}
                onClick={openCreate}
              >
                {zh['create']}
              </Button>
            )}
            {removeBatch && canDelete && selectedIds.length > 0 && (
              <Popconfirm
                title={`${zh['confirmDelete']} (${selectedIds.length})`}
                onConfirm={() => onDeleteBatch().catch(() => undefined)}
              >
                <Button danger>{zh['deleteSelected']}</Button>
              </Popconfirm>
            )}
            {extraToolbar}
          </Space>
          <Button aria-label={zh['refreshList']} icon={<ReloadOutlined />} onClick={loadList} />
        </div>
        <Table<T>
          rowKey={idOf}
          columns={columns}
          dataSource={rows}
          loading={loading}
          scroll={{ x: 'max-content' }}
          rowSelection={
            removeBatch && canDelete
              ? {
                  selectedRowKeys: selectedIds,
                  onChange: (keys) => setSelectedIds(keys as number[]),
                }
              : undefined
          }
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => zh['totalRecords'].replace('{count}', String(count)),
            onChange: (p, s) => {
              setPage(s === pageSize ? p : 1);
              setPageSize(s);
              setSelectedIds([]);
            },
          }}
        />
        <Modal
          title={editing ? zh['edit'] : zh['create']}
          open={modalOpen}
          onOk={() => {
            void onSubmit().catch(() => undefined);
          }}
          onCancel={() => {
            if (submittingRef.current) return;
            setModalOpen(false);
            modalForm.resetFields();
          }}
          confirmLoading={submitting}
          cancelButtonProps={{ disabled: submitting }}
          closable={!submitting}
          maskClosable={!submitting}
          forceRender
          width={560}
        >
          <Form form={modalForm} layout="vertical" style={{ marginTop: 16 }}>
            {modalFields.map((field) => (
              <Form.Item
                key={field.key}
                name={String(field.key)}
                label={translateUiText(field.title)}
                rules={[
                  ...(field.required
                    ? [
                        {
                          required: true,
                          ...(!field.type || field.type === 'input' || field.type === 'textarea'
                            ? { whitespace: true }
                            : field.type === 'number'
                              ? { type: 'number' as const }
                              : {}),
                          message: `${field.type === 'select' ? zh['select'] : zh['enter']} ${translateUiText(field.title)}${zh['required']}`,
                        },
                      ]
                    : []),
                  ...(field.rules ?? []),
                ]}
              >
                {renderFormControl(
                  {
                    ...field,
                    title: translateUiText(field.title),
                    placeholder: field.placeholder ? translateUiText(field.placeholder) : undefined,
                  },
                  optionsOf(field),
                  Boolean(editing && field.disabledInEdit),
                )}
              </Form.Item>
            ))}
          </Form>
        </Modal>
      </Card>
    </div>
  );
}
