import { session } from '../../api/request';
// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  blankDesign,
  CONTROL_LABELS,
  ALL_CONTROL_TYPES,
  flattenFields,
  isContainer,
  isAuxiliary,
  patchFieldTree,
  removeFieldTree,
  moveFieldTree,
  generateReactForm,
  initialValues,
  newFieldID,
  parseDesign,
  usesOptions,
  validateDesign,
  type ControlType,
  type DesignField,
  type FormDesign,
} from './formDesign';

import { FormFields, renderFieldControl } from './formRuntime';
import { AdvancedFieldSettings } from './formDesignerSettings';
import { serializeSubmission } from '../enterprise/collab/model';

const DRAFT_KEY = 'gea:form-designer:v1';

export default function FormCreatePage() {
  return <FormDesigner />;
}

export { renderFieldControl } from './formRuntime';
function PreviewForm({ design }: { design: FormDesign }) {
  const [form] = Form.useForm();
  const [result, setResult] = useState<string>();
  const [submitError, setSubmitError] = useState('');
  return (
    <>
      <Form
        form={form}
        layout={design.layout}
        initialValues={initialValues(design)}
        onFinish={(values) => {
          setSubmitError('');
          try {
            setResult(JSON.stringify(serializeSubmission(design, values), null, 2));
          } catch (error) {
            setResult(undefined);
            setSubmitError(error instanceof Error ? error.message : '请求失败');
          }
        }}
        onFinishFailed={() => {
          setResult(undefined);
          setSubmitError('');
        }}
      >
        <Typography.Title level={4}>{design.title}</Typography.Title>
        <FormFields fields={design.fields} />
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              提交
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                setResult(undefined);
                setSubmitError('');
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
      {submitError && <Alert type="error" showIcon message={submitError} />}
      {result !== undefined && (
        <>
          <Alert type="success" showIcon message="表单验证通过" />
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 12 }} copyable>
            {result}
          </Typography.Paragraph>
        </>
      )}
    </>
  );
}

export function FormDesigner({
  value,
  onChange,
}: {
  value?: FormDesign;
  onChange?: (design: FormDesign) => void;
}) {
  const { message, modal } = App.useApp();
  const draftKey = session.storageKey(DRAFT_KEY);
  const controlled = value !== undefined;
  const [localDesign, setLocalDesign] = useState<FormDesign>(() => {
    if (value) return value;
    try {
      const saved = localStorage.getItem(draftKey);
      return saved ? parseDesign(saved, false) : blankDesign();
    } catch {
      return blankDesign();
    }
  });
  const design = value ?? localDesign;
  const setDesign = (next: SetStateAction<FormDesign>) => {
    const updated = typeof next === 'function' ? next(design) : next;
    if (controlled) onChange?.(updated);
    else setLocalDesign(updated);
  };
  const [selectedID, setSelectedID] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [code, setCode] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const latest = useRef(design);
  const allFields = flattenFields(design.fields);
  const selected = allFields.find((field) => field.id === selectedID);
  const [targetID, setTargetID] = useState<string>();
  const designError = validateDesign(design);
  useEffect(() => {
    if (
      targetID &&
      !flattenFields(design.fields).some(
        (field) => field.id === targetID && isContainer(field.type),
      )
    )
      setTargetID(undefined);
  }, [design.fields, targetID]);

  useEffect(() => {
    latest.current = design;
    if (controlled) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(design));
        setSaveState('saved');
      } catch {
        setSaveState('failed');
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [design, controlled]);
  useEffect(() => {
    if (controlled) return;
    const save = () => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(latest.current));
      } catch {
        /* Browser storage can be disabled. */
      }
    };
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [controlled]);

  const patchField = (patch: Partial<DesignField>) =>
    setDesign((previous) => ({
      ...previous,
      fields: patchFieldTree(previous.fields, selectedID ?? '', patch),
    }));
  const treeDepth = (fields: DesignField[], depth = 0): number =>
    Math.max(
      depth,
      ...fields.map((field) =>
        field.children?.length ? treeDepth(field.children, depth + 1) : depth,
      ),
    );
  const appendTo = (fields: DesignField[], field: DesignField, target?: string) =>
    target
      ? patchFieldTree(fields, target, {
          children: [
            ...(flattenFields(fields).find((item) => item.id === target)?.children ?? []),
            field,
          ],
        })
      : [...fields, field];
  const addField = (type: ControlType) => {
    if (allFields.length >= 200) {
      message.warning('最多添加200个字段');
      return;
    }
    let number = allFields.length + 1;
    while (allFields.some((field) => field.name === `field${number}`)) number++;
    const field: DesignField = {
      id: newFieldID(),
      type,
      name: `field${number}`,
      label: CONTROL_LABELS[type],
      placeholder: '',
      required: false,
      disabled: false,
      options: usesOptions(type)
        ? [
            { label: '选项1', value: 'option1' },
            { label: '选项2', value: 'option2' },
          ]
        : [],
      ...(isContainer(type) ? { children: [] } : {}),
      ...(type === 'subform' ? { maxRows: 20, initialRows: 0 } : {}),
      ...(isAuxiliary(type) ? { content: CONTROL_LABELS[type] } : {}),
    };
    const fields = appendTo(
      design.fields,
      field,
      allFields.some((item) => item.id === targetID && isContainer(item.type))
        ? targetID
        : undefined,
    );
    if (treeDepth(fields) > 4) {
      message.warning('字段层级不能超过4层');
      return;
    }
    setDesign({ ...design, fields });
    setSelectedID(field.id);
  };
  const remove = (id: string) => {
    const removed = allFields.find((field) => field.id === id);
    if (removed && flattenFields([removed]).some((field) => field.id === targetID))
      setTargetID(undefined);
    setDesign((previous) => ({ ...previous, fields: removeFieldTree(previous.fields, id) }));
    if (
      selectedID === id ||
      (removed && flattenFields([removed]).some((field) => field.id === selectedID))
    )
      setSelectedID(undefined);
  };
  const move = (id: string, offset: -1 | 1) =>
    setDesign((previous) => ({ ...previous, fields: moveFieldTree(previous.fields, id, offset) }));
  const moveInto = (id: string, target?: string) => {
    const field = allFields.find((item) => item.id === id);
    if (!field) return;
    if (target && flattenFields([field]).some((item) => item.id === target)) {
      message.warning('不能将字段移动到自身内部');
      return;
    }
    const fields = appendTo(removeFieldTree(design.fields, id), field, target);
    if (treeDepth(fields) > 4) {
      message.warning('字段层级不能超过4层');
      return;
    }
    setDesign({ ...design, fields });
  };
  const parentOf = (fields: DesignField[], id: string, parent?: string): string | undefined => {
    for (const field of fields) {
      if (field.id === id) return parent;
      const found = parentOf(field.children ?? [], id, field.id);
      if (found) return found;
    }
    return undefined;
  };
  const renderCanvas = (fields: DesignField[]) =>
    fields.map((field, index) => (
      <Col key={field.id} xs={24} sm={field.span ?? 24}>
        <div
          tabIndex={0}
          role="button"
          aria-label={`配置${field.label}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedID(field.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.stopPropagation();
              setSelectedID(field.id);
            }
          }}
          style={{
            border: `1px solid ${selectedID === field.id ? 'var(--brand-primary)' : 'var(--ant-color-border, #d9d9d9)'}`,
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
            cursor: 'pointer',
          }}
        >
          <Space wrap style={{ justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
            <Space>
              <Typography.Text strong>
                {field.required ? '* ' : ''}
                {field.label || '未命名字段'}
              </Typography.Text>
              <Tag>{CONTROL_LABELS[field.type]}</Tag>
            </Space>
            <Space size={0} onClick={(event) => event.stopPropagation()}>
              <Button
                size="small"
                type="text"
                title="上移"
                disabled={index === 0}
                icon={<ArrowUpOutlined />}
                onClick={() => move(field.id, -1)}
              />
              <Button
                size="small"
                type="text"
                title="下移"
                disabled={index === fields.length - 1}
                icon={<ArrowDownOutlined />}
                onClick={() => move(field.id, 1)}
              />
              <Button
                size="small"
                danger
                type="text"
                title="删除字段"
                icon={<DeleteOutlined />}
                onClick={() => remove(field.id)}
              />
            </Space>
          </Space>
          {isContainer(field.type) ? (
            <>
              <Button
                size="small"
                type={targetID === field.id ? 'primary' : 'dashed'}
                onClick={(event) => {
                  event.stopPropagation();
                  setTargetID(field.id);
                  setSelectedID(field.id);
                }}
              >
                {field.type === 'subform' ? '添加子表单' : '添加字段'}
              </Button>
              <div style={{ paddingTop: 12 }}>
                {field.children?.length ? (
                  <Row gutter={12}>{renderCanvas(field.children)}</Row>
                ) : (
                  <Typography.Text type="secondary">
                    点击添加字段，点击选择容器。
                  </Typography.Text>
                )}
              </div>
            </>
          ) : (
            <div style={{ pointerEvents: 'none' }}>{renderFieldControl(field)}</div>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {field.name}
          </Typography.Text>
        </div>
      </Col>
    ));
  const check = () => {
    if (designError) {
      message.warning(designError);
      return false;
    }
    return true;
  };
  const download = (contents: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const importJSON = async (file: File) => {
    if (!/\.json$/i.test(file.name) || file.size > 1024 * 1024) {
      message.warning('请选择不超过1MB的JSON文件');
      return;
    }
    setImporting(true);
    try {
      const imported = parseDesign(await file.text());
      modal.confirm({
        title: '导入表单配置',
        content: `导入的表单包含${imported.fields.length}个字段，是否替换当前设计？`,
        onOk: () => {
          setDesign(imported);
          setSelectedID(imported.fields[0]?.id);
          message.success('表单配置已导入');
        },
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '表单配置');
    } finally {
      setImporting(false);
    }
  };
  const save = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(design));
      setSaveState('saved');
      message.success('保存成功');
    } catch {
      setSaveState('failed');
      message.error('保存失败，无法导出JSON');
    }
  };

  return (
    <>
      <Card className="filter-card">
        <Space wrap>
          <Button
            icon={<EyeOutlined />}
            type="primary"
            onClick={() => {
              if (check()) setPreviewOpen(true);
            }}
          >
            预览表单
          </Button>
          <Button
            icon={<CodeOutlined />}
            onClick={() => {
              if (check()) setCode(generateReactForm(design));
            }}
          >
            导出React组件
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              if (check())
                download(JSON.stringify(design, null, 2), 'form-design.json', 'application/json');
            }}
          >
            导出JSON
          </Button>
          <Upload
            accept=".json,application/json"
            showUploadList={false}
            disabled={importing}
            beforeUpload={(file) => {
              void importJSON(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={importing}>
              导入JSON
            </Button>
          </Upload>
          {!controlled && (
            <Button icon={<SaveOutlined />} onClick={save}>
              保存
            </Button>
          )}
          <Popconfirm
            title={controlled ? '确认清空表单？' : '确认清空表单？'}
            onConfirm={() => {
              setDesign(blankDesign());
              setSelectedID(undefined);
            }}
          >
            <Button danger icon={<DeleteOutlined />}>
              清空
            </Button>
          </Popconfirm>
          {!controlled && (
            <Tag
              color={
                saveState === 'failed' ? 'error' : saveState === 'saved' ? 'success' : 'default'
              }
            >
              {saveState === 'saved'
                ? '已保存'
                : saveState === 'saving'
                  ? '保存中…'
                  : '保存失败'}
            </Tag>
          )}
        </Space>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={5}>
          <Card title="添加字段">
            <Form layout="vertical">
              <Form.Item label="添加位置">
                <Select
                  value={targetID ?? ''}
                  options={[
                    { label: '表单根级', value: '' },
                    ...allFields
                      .filter((field) => isContainer(field.type))
                      .map((field) => ({
                        label: `${field.label} (${field.name})`,
                        value: field.id,
                      })),
                  ]}
                  onChange={(value) => setTargetID(value || undefined)}
                />
              </Form.Item>
            </Form>
            <Collapse
              defaultActiveKey={['basic']}
              items={[
                {
                  key: 'basic',
                  label: '基础字段',
                  types: [
                    'input',
                    'textarea',
                    'password',
                    'number',
                    'select',
                    'radio',
                    'checkbox',
                    'switch',
                    'date',
                    'time',
                  ],
                },
                {
                  key: 'advanced',
                  label: '高级字段',
                  types: ['numberRange', 'dateRange', 'slider', 'rate', 'color'],
                },
                { key: 'subform', label: '子表单', types: ['subform'] },
                { key: 'auxiliary', label: '辅助元素', types: ['text', 'divider'] },
                { key: 'layout', label: '布局', types: ['group', 'grid'] },
              ].map((group) => ({
                key: group.key,
                label: group.label,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {group.types.map((type) => (
                      <Button
                        key={type}
                        block
                        icon={<PlusOutlined />}
                        onClick={() => addField(type as ControlType)}
                      >
                        {CONTROL_LABELS[type as ControlType]}
                      </Button>
                    ))}
                  </Space>
                ),
              }))}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="表单设计"
            extra={<Typography.Text type="secondary">{allFields.length}个字段</Typography.Text>}
          >
            <Form layout="vertical">
              <Form.Item label="表单标题">
                <Input
                  aria-label="表单标题"
                  value={design.title}
                  maxLength={100}
                  onChange={(event) =>
                    setDesign((previous) => ({ ...previous, title: event.target.value }))
                  }
                />
              </Form.Item>
              <Form.Item label="布局方式">
                <Radio.Group
                  value={design.layout}
                  options={[
                    { label: '垂直', value: 'vertical' },
                    { label: '水平', value: 'horizontal' },
                  ]}
                  onChange={(event) =>
                    setDesign((previous) => ({ ...previous, layout: event.target.value }))
                  }
                />
              </Form.Item>
            </Form>
            {!design.fields.length && (
              <Empty description="点击添加字段开始设计" style={{ padding: '48px 0' }} />
            )}
            <Row gutter={12}>{renderCanvas(design.fields)}</Row>
            {design.fields.length > 0 && designError && (
              <Alert type="warning" showIcon message={designError} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="字段配置">
            {selected ? (
              <Form layout="vertical" key={selected.id}>
                <Form.Item label="类型">
                  <Select
                    aria-label="类型"
                    value={selected.type}
                    options={ALL_CONTROL_TYPES.map((type) => ({
                      label: CONTROL_LABELS[type],
                      value: type,
                    }))}
                    onChange={(type) => {
                      if (selected.children?.length && !isContainer(type)) {
                        message.warning('请先删除所有子字段后再更改类型');
                        return;
                      }
                      patchField({
                        type,
                        options:
                          usesOptions(type) && !selected.options.length
                            ? [{ label: '选项 1', value: 'option1' }]
                            : selected.options,
                        children: isContainer(type) ? (selected.children ?? []) : undefined,
                        defaultValue: undefined,
                        min: undefined,
                        max: undefined,
                        step: undefined,
                        minLength: undefined,
                        maxLength: undefined,
                        minRows: undefined,
                        maxRows: undefined,
                        initialRows: undefined,
                        allowHalf: undefined,
                        content: isAuxiliary(type) ? (selected.content ?? '') : undefined,
                      });
                    }}
                  />
                </Form.Item>
                <Form.Item label="父级容器">
                  <Select
                    value={parentOf(design.fields, selected.id) ?? ''}
                    options={[
                      { label: '表单根级', value: '' },
                      ...allFields
                        .filter(
                          (field) =>
                            isContainer(field.type) &&
                            !flattenFields([selected]).some((item) => item.id === field.id),
                        )
                        .map((field) => ({ label: field.label, value: field.id })),
                    ]}
                    onChange={(value) => moveInto(selected.id, value || undefined)}
                  />
                </Form.Item>
                <Form.Item label="字段标签" required>
                  <Input
                    aria-label="字段标签"
                    value={selected.label}
                    maxLength={100}
                    onChange={(event) => patchField({ label: event.target.value })}
                  />
                </Form.Item>
                <Form.Item label="字段名称" required extra="字段名只能包含英文字母、数字和下划线">
                  <Input
                    aria-label="字段名称"
                    value={selected.name}
                    maxLength={64}
                    onChange={(event) => patchField({ name: event.target.value })}
                  />
                </Form.Item>
                {['input', 'textarea', 'password', 'number', 'select', 'date', 'time'].includes(
                  selected.type,
                ) && (
                  <>
                    <Form.Item label="占位提示">
                      <Input
                        aria-label="占位提示"
                        value={selected.placeholder}
                        maxLength={200}
                        onChange={(event) => patchField({ placeholder: event.target.value })}
                      />
                    </Form.Item>
                  </>
                )}
                {(!isAuxiliary(selected.type) && !isContainer(selected.type)) ||
                selected.type === 'subform' ? (
                  <Form.Item label="必填项">
                    <Switch
                      aria-label="必填项"
                      checked={selected.required}
                      onChange={(required) => patchField({ required })}
                    />
                  </Form.Item>
                ) : null}
                {!isAuxiliary(selected.type) && (
                  <>
                    <Form.Item label="禁用状态">
                      <Switch
                        aria-label="禁用状态"
                        checked={selected.disabled}
                        onChange={(disabled) => patchField({ disabled })}
                      />
                    </Form.Item>
                  </>
                )}
                <AdvancedFieldSettings field={selected} patch={patchField} />
                {usesOptions(selected.type) && (
                  <Form.Item label="选项配置" required>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {selected.options.map((option, index) => (
                        <Space.Compact key={index} style={{ width: '100%' }}>
                          <Input
                            aria-label={`选项${index + 1} 标签`}
                            value={option.label}
                            placeholder="选项值"
                            onChange={(event) =>
                              patchField({
                                options: selected.options.map((item, i) =>
                                  i === index ? { ...item, label: event.target.value } : item,
                                ),
                              })
                            }
                          />
                          <Input
                            aria-label={`选项${index + 1} 值`}
                            value={option.value}
                            placeholder="请选择"
                            onChange={(event) =>
                              patchField({
                                options: selected.options.map((item, i) =>
                                  i === index ? { ...item, value: event.target.value } : item,
                                ),
                              })
                            }
                          />
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            title="删除选项"
                            onClick={() =>
                              patchField({
                                options: selected.options.filter((_, i) => i !== index),
                              })
                            }
                          />
                        </Space.Compact>
                      ))}
                      <Button
                        block
                        icon={<PlusOutlined />}
                        disabled={selected.options.length >= 100}
                        onClick={() =>
                          patchField({
                            options: [
                              ...selected.options,
                              {
                                label: `选项${selected.options.length + 1}`,
                                value: `option${selected.options.length + 1}`,
                              },
                            ],
                          })
                        }
                      >
                        添加选项
                      </Button>
                    </Space>
                  </Form.Item>
                )}
              </Form>
            ) : (
              <Empty description="请选择表单字段进行配置" />
            )}
          </Card>
        </Col>
      </Row>
      {previewOpen && (
        <Modal
          title="表单预览"
          open
          onCancel={() => setPreviewOpen(false)}
          footer={null}
          width={760}
        >
          <PreviewForm design={design} />
        </Modal>
      )}
      <Modal
        title="React / Ant Design 表单代码（生产项目）"
        open={code !== undefined}
        onCancel={() => setCode(undefined)}
        width={1000}
        footer={
          <Space>
            <Button onClick={() => setCode(undefined)}>关闭</Button>
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                void navigator.clipboard
                  .writeText(code || '')
                  .then(() => message.success('复制成功'))
                  .catch(() => message.error('复制失败，手动复制'));
              }}
            >
              复制
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => download(code || '', 'GeneratedForm.tsx', 'text/plain')}
            >
              下载TSX
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          提交后，表单数据将显示在下方。
        </Typography.Paragraph>
        <Input.TextArea readOnly rows={24} value={code} style={{ fontFamily: 'monospace' }} />
      </Modal>
    </>
  );
}
