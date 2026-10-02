export const CONTROL_TYPES = [
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
  'slider',
  'rate',
] as const;
export const ADVANCED_TYPES = [
  'numberRange',
  'dateRange',
  'color',
  'group',
  'grid',
  'subform',
  'text',
  'divider',
] as const;
export const ALL_CONTROL_TYPES = [...CONTROL_TYPES, ...ADVANCED_TYPES] as const;
export type ControlType = (typeof ALL_CONTROL_TYPES)[number];
export interface DesignOption {
  label: string;
  value: string;
}
export interface DesignField {
  id: string;
  type: ControlType;
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  disabled: boolean;
  options: DesignOption[];
  children?: DesignField[];
  description?: string;
  content?: string;
  span?: number;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  minRows?: number;
  maxRows?: number;
  initialRows?: number;
  allowHalf?: boolean;
}
export interface FormDesign {
  version: 1;
  title: string;
  layout: 'vertical' | 'horizontal';
  fields: DesignField[];
}

export const CONTROL_LABELS: Record<ControlType, string> = {
  input: '单行输入',
  textarea: '多行输入',
  password: '密码输入',
  number: '数字输入',
  select: '下拉选择',
  radio: '单选框',
  checkbox: '多选框',
  switch: '开关',
  date: '日期',
  time: '时间',
  slider: '滑块',
  rate: '评分',
  numberRange: '数字范围',
  dateRange: '日期范围',
  color: '颜色选择',
  group: '分组',
  grid: '栅格布局',
  subform: '子表单',
  text: '文本说明',
  divider: '分割线',
};
export const usesOptions = (type: ControlType) => ['select', 'radio', 'checkbox'].includes(type);
export const blankDesign = (): FormDesign => ({
  version: 1,
  title: '未命名表单',
  layout: 'vertical',
  fields: [],
});
let sequence = 0;
export const newFieldID = () => `field-${Date.now().toString(36)}-${++sequence}`;

export const isLayout = (type: ControlType) => type === 'group' || type === 'grid';
export const isAuxiliary = (type: ControlType) => type === 'text' || type === 'divider';
export const isContainer = (type: ControlType) => isLayout(type) || type === 'subform';
export const numericType = (type: ControlType) =>
  ['number', 'slider', 'rate', 'numberRange'].includes(type);
export function flattenFields(fields: DesignField[]): DesignField[] {
  return fields.flatMap((field) => [field, ...flattenFields(field.children ?? [])]);
}
export function conditionFields(fields: DesignField[], disabled = false): DesignField[] {
  return fields.flatMap((field) =>
    isLayout(field.type)
      ? conditionFields(field.children ?? [], disabled || field.disabled)
      : isAuxiliary(field.type) || ['subform', 'numberRange', 'dateRange'].includes(field.type)
        ? []
        : [{ ...field, disabled: disabled || field.disabled }],
  );
}
export function dataFields(fields: DesignField[], disabled = false): DesignField[] {
  return fields.flatMap((field) =>
    isLayout(field.type)
      ? dataFields(field.children ?? [], disabled || field.disabled)
      : isAuxiliary(field.type)
        ? []
        : [{ ...field, disabled: disabled || field.disabled }],
  );
}
export function patchFieldTree(
  fields: DesignField[],
  id: string,
  patch: Partial<DesignField>,
): DesignField[] {
  return fields.map((field) =>
    field.id === id
      ? { ...field, ...patch }
      : field.children
        ? { ...field, children: patchFieldTree(field.children, id, patch) }
        : field,
  );
}
export function removeFieldTree(fields: DesignField[], id: string): DesignField[] {
  return fields
    .filter((field) => field.id !== id)
    .map((field) =>
      field.children ? { ...field, children: removeFieldTree(field.children, id) } : field,
    );
}
export function moveFieldTree(fields: DesignField[], id: string, offset: number): DesignField[] {
  const index = fields.findIndex((field) => field.id === id);
  if (index >= 0) {
    const result = [...fields];
    const next = index + offset;
    if (next >= 0 && next < result.length)
      [result[index], result[next]] = [result[next], result[index]];
    return result;
  }
  return fields.map((field) =>
    field.children ? { ...field, children: moveFieldTree(field.children, id, offset) } : field,
  );
}
export function numericBounds(field: DesignField): [number | undefined, number | undefined] {
  return [
    field.min ?? (field.type === 'slider' || field.type === 'rate' ? 0 : undefined),
    field.max ?? (field.type === 'slider' ? 100 : field.type === 'rate' ? 5 : undefined),
  ];
}
export function calendarValue(value: unknown, format: string): unknown {
  return value &&
    typeof value === 'object' &&
    'format' in value &&
    typeof value.format === 'function'
    ? value.format(format)
    : value;
}
function validDate(value: unknown) {
  if (typeof value !== 'string') return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
export function valueError(
  field: DesignField,
  value: unknown,
  required = field.required,
): string | null {
  const fail = `「${field.label}」的值无效`;
  if (value === undefined || value === null) return required ? `「${field.label}」为必填项` : null;
  if (
    value === '' &&
    !numericType(field.type) &&
    !['switch', 'checkbox', 'subform', 'dateRange'].includes(field.type)
  )
    return required ? `「${field.label}」为必填项` : null;
  if (numericType(field.type)) {
    const values = field.type === 'numberRange' ? value : [value];
    if (
      !Array.isArray(values) ||
      values.length !== (field.type === 'numberRange' ? 2 : 1) ||
      values.some((item) => typeof item !== 'number' || !Number.isFinite(item))
    )
      return fail;
    const [min, max] = numericBounds(field);
    if (
      values.some(
        (item) => (min !== undefined && item < min) || (max !== undefined && item > max),
      ) ||
      (values.length === 2 && values[0] > values[1])
    )
      return fail;
    return null;
  }
  if (field.type === 'switch') return typeof value === 'boolean' ? null : fail;
  if (field.type === 'checkbox')
    return !Array.isArray(value) ||
      (required && !value.length) ||
      new Set(value).size !== value.length ||
      value.some((item) => !field.options.some((option) => option.value === item))
      ? fail
      : null;
  if (field.type === 'subform') {
    const min = Math.max(field.minRows ?? 0, required ? 1 : 0);
    return !Array.isArray(value) || value.length < min || value.length > (field.maxRows ?? 20)
      ? fail
      : null;
  }
  if (field.type === 'dateRange') {
    if (!Array.isArray(value) || value.length !== 2) return fail;
    const values = value.map((item) => calendarValue(item, 'YYYY-MM-DD'));
    return !values.every(validDate) || Date.parse(String(values[0])) > Date.parse(String(values[1]))
      ? fail
      : null;
  }
  if (field.type === 'date') return validDate(calendarValue(value, 'YYYY-MM-DD')) ? null : fail;
  if (field.type === 'time') {
    const time = calendarValue(value, 'HH:mm:ss');
    return typeof time === 'string' &&
      (/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time) || validDate(time))
      ? null
      : fail;
  }
  if (typeof value !== 'string' || [...value].length > 20000 || (required && !value.trim()))
    return fail;
  if (field.type === 'color') return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value) ? null : fail;
  if (usesOptions(field.type))
    return field.options.some((option) => option.value === value) ? null : fail;
  if (
    (field.minLength !== undefined && [...value].length < field.minLength) ||
    (field.maxLength !== undefined && [...value].length > field.maxLength)
  )
    return fail;
  return null;
}
export function validateDesign(design: FormDesign): string | null {
  if (!design.title.trim() || design.title.length > 200) return '请输入200字以内的表单标题';
  if (!design.fields.length) return '请至少添加一个表单字段';
  let count = 0;
  const ids = new Set<string>();
  const walk = (fields: DesignField[], depth: number, names: Set<string>): string | null => {
    if (depth > 4) return '表单嵌套不能超过4层';
    for (const field of fields) {
      if (++count > 200) return '表单字段不能超过200个';
      if (!ALL_CONTROL_TYPES.includes(field.type)) return '不支持的字段类型';
      if (!field.id || ids.has(field.id)) return '字段ID必须唯一';
      ids.add(field.id);
      if (!field.label.trim()) return '字段标签不能为空';
      if (
        !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.name) ||
        ['constructor', 'prototype', '__proto__'].includes(field.name)
      )
        return `「${field.label}」字段名必须以字母开头，且只能包含英文字母、数字或下划线`;
      if (names.has(field.name)) return `字段名「${field.name}」重复`;
      names.add(field.name);
      if (
        field.label.length > 200 ||
        field.name.length > 100 ||
        field.placeholder.length > 500 ||
        (field.description?.length ?? 0) > 2000 ||
        (field.content?.length ?? 0) > 4000
      )
        return '字段文本设置超出长度限制';
      if (
        field.span !== undefined &&
        (!Number.isInteger(field.span) || field.span < 1 || field.span > 24)
      )
        return '字段跨度必须是1到24的整数';
      if (
        [field.min, field.max, field.step].some(
          (value) => value !== undefined && !Number.isFinite(value),
        ) ||
        (field.min !== undefined && field.max !== undefined && field.min > field.max) ||
        (field.step !== undefined && field.step <= 0)
      )
        return '数值限制设置无效';
      if (
        (field.min !== undefined || field.max !== undefined || field.step !== undefined) &&
        !numericType(field.type)
      )
        return '数值限制仅适用于数字类字段';
      const [min, max] = numericBounds(field);
      if (
        (field.type === 'rate' && (min !== 0 || !Number.isInteger(max) || max! < 1 || max! > 10)) ||
        (field.type === 'slider' && min! >= max!)
      )
        return '字段范围设置无效';
      if (
        [field.minLength, field.maxLength].some(
          (value) =>
            value !== undefined && (!Number.isInteger(value) || value < 0 || value > 20000),
        ) ||
        (field.minLength !== undefined &&
          field.maxLength !== undefined &&
          field.minLength > field.maxLength)
      )
        return '长度校验设置无效';
      if (field.type === 'subform') {
        const min = field.minRows ?? 0,
          max = field.maxRows ?? 20,
          initial = field.initialRows ?? 0;
        if (
          ![min, max, initial].every(Number.isInteger) ||
          min < 0 ||
          max < 1 ||
          max > 100 ||
          min > max ||
          initial < 0 ||
          initial > max
        )
          return '子表单行数必须在0到100之间';
      }
      if (usesOptions(field.type)) {
        if (
          !field.options.length ||
          field.options.length > 100 ||
          field.options.some(
            (option) =>
              !option.label.trim() ||
              !option.value.trim() ||
              option.label.length > 200 ||
              option.value.length > 500,
          )
        )
          return `「${field.label}」必须至少配置一个有效选项`;
        if (new Set(field.options.map((option) => option.value)).size !== field.options.length)
          return `「${field.label}」存在重复的选项值`;
      }
      if (isContainer(field.type)) {
        if (!field.children?.length) return `「${field.label}」必须包含至少一个子字段`;
        const error = walk(field.children, depth + 1, field.type === 'subform' ? new Set() : names);
        if (error) return error;
      } else if (field.children?.length) return '只有容器类字段可以包含子字段';
      if (field.defaultValue !== undefined) {
        if (isContainer(field.type) || isAuxiliary(field.type))
          return '容器类和展示类字段不能设置默认值';
        const error = valueError(field, field.defaultValue, false);
        if (error) return `「${field.label}」的默认值无效`;
      }
    }
    return null;
  };
  const error = walk(design.fields, 0, new Set());
  if (error) return error;
  try {
    initialValues(design);
  } catch {
    return '初始值超出安全限制';
  }
  return null;
}
/** Imported expressions/HTML hooks are discarded; only documented static configuration is retained. */
export function parseDesign(text: string, validate = true): FormDesign {
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('表单JSON超过1MB限制');
  const doc = JSON.parse(text);
  if (
    !doc ||
    doc.version !== 1 ||
    typeof doc.title !== 'string' ||
    !['vertical', 'horizontal'].includes(doc.layout) ||
    !Array.isArray(doc.fields)
  )
    throw new Error('表单JSON结构无效');
  let total = 0;
  const readFields = (fields: unknown[], depth: number): DesignField[] => {
    if (depth > 4) throw new Error('表单嵌套不能超过4层');
    return fields.map((raw) => {
      if (++total > 200) throw new Error('表单字段不能超过200个');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('无效的字段定义');
      const value = raw as Record<string, unknown>;
      if (
        !ALL_CONTROL_TYPES.includes(value.type as ControlType) ||
        typeof value.name !== 'string' ||
        typeof value.label !== 'string'
      )
        throw new Error('字段类型、名称和标签不能为空');
      const options = Array.isArray(value.options) ? value.options : [];
      if (options.length > 100) throw new Error('字段选项不能超过100个');
      const field: DesignField = {
        id: newFieldID(),
        type: value.type as ControlType,
        name: value.name,
        label: value.label,
        placeholder: typeof value.placeholder === 'string' ? value.placeholder : '',
        required: value.required === true,
        disabled: value.disabled === true,
        options: options.map((item) => {
          if (!item || typeof item.label !== 'string' || typeof item.value !== 'string')
            throw new Error('每个选项必须包含标签和值');
          return { label: item.label, value: item.value };
        }),
      };
      for (const key of ['description', 'content'] as const) {
        if (value[key] !== undefined) {
          if (typeof value[key] !== 'string') throw new Error('描述和内容必须是字符串');
          field[key] = value[key];
        }
      }
      for (const key of [
        'span',
        'min',
        'max',
        'step',
        'minLength',
        'maxLength',
        'minRows',
        'maxRows',
        'initialRows',
      ] as const) {
        if (value[key] !== undefined) {
          if (typeof value[key] !== 'number' || !Number.isFinite(value[key]))
            throw new Error('字段数值设置必须是有限数字');
          field[key] = value[key];
        }
      }
      if (value.allowHalf !== undefined) field.allowHalf = value.allowHalf === true;
      if (Object.hasOwn(value, 'defaultValue')) field.defaultValue = value.defaultValue;
      if (value.children !== undefined) {
        if (!Array.isArray(value.children)) throw new Error('无效的字段定义');
        field.children = readFields(value.children, depth + 1);
      }
      return field;
    });
  };
  const design: FormDesign = {
    version: 1,
    title: doc.title,
    layout: doc.layout,
    fields: readFields(doc.fields, 0),
  };
  const error = validate ? validateDesign(design) : null;
  if (error) throw new Error(error);
  return design;
}
export function fieldRules(field: DesignField) {
  if (field.disabled || isLayout(field.type) || isAuxiliary(field.type)) return [];
  if (field.type === 'checkbox' && field.required)
    return [
      { required: true, type: 'array' as const, min: 1, message: `请为「${field.label}」至少选择一个选项` },
    ];
  const basic = field.required
    ? [
        {
          required: true,
          ...(['input', 'textarea', 'password'].includes(field.type) ? { whitespace: true } : {}),
          message: `「${field.label}」为必填项`,
        },
      ]
    : [];
  if (
    ['numberRange', 'dateRange', 'color', 'subform'].includes(field.type) ||
    field.min !== undefined ||
    field.max !== undefined ||
    field.minLength !== undefined ||
    field.maxLength !== undefined
  )
    return [
      ...basic,
      {
        validator: (_: unknown, value: unknown) => {
          const error = valueError(field, value);
          return error ? Promise.reject(new Error(error)) : Promise.resolve();
        },
      },
    ];
  return basic;
}
export function initialValues(design: FormDesign): Record<string, unknown> {
  let count = 0;
  const build = (fields: DesignField[], depth: number): Record<string, unknown> => {
    if (depth > 4) throw new Error('表单嵌套不能超过4层');
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (++count > 5000) throw new Error('初始数据超过5000项限制');
      if (['constructor', 'prototype', '__proto__'].includes(field.name))
        throw new Error('字段名为保留名称');
      if (isAuxiliary(field.type)) continue;
      if (isLayout(field.type)) {
        Object.assign(result, build(field.children ?? [], depth + 1));
        continue;
      }
      if (field.type === 'subform') {
        const rows = field.initialRows ?? 0;
        if (!Number.isInteger(rows) || rows < 0 || rows > 100) throw new Error('无效的字段定义');
        result[field.name] = Array.from({ length: rows }, () =>
          build(field.children ?? [], depth + 1),
        );
      } else if (field.defaultValue !== undefined)
        result[field.name] = structuredClone(field.defaultValue);
      else if (field.type === 'switch') result[field.name] = false;
      else if (field.type === 'checkbox') result[field.name] = [];
    }
    return result;
  };
  return build(design.fields, 0);
}

/** Emit static JSX with JSON-escaped attributes; no user-provided text becomes executable source. */
export function generateReactForm(design: FormDesign): string {
  const error = validateDesign(design);
  if (error) throw new Error(error);
  if (
    flattenFields(design.fields).some(
      (field) =>
        !CONTROL_TYPES.includes(field.type as (typeof CONTROL_TYPES)[number]) ||
        field.defaultValue !== undefined ||
        field.span !== undefined ||
        field.description ||
        field.min !== undefined ||
        field.max !== undefined ||
        field.minLength !== undefined ||
        field.maxLength !== undefined ||
        field.step !== undefined ||
        field.allowHalf !== undefined,
    )
  ) {
    return `import { Button, Form } from 'antd';
import { FormFields } from './src/pages/systemTools/formRuntime';
import { initialValues, type FormDesign } from './src/pages/systemTools/formDesign';
import { serializeSubmission } from './src/pages/enterprise/collab/model';
const schema: FormDesign = ${JSON.stringify(design, null, 2)};
export default function GeneratedForm({onSubmit}:{onSubmit:(data:Record<string,unknown>)=>void}) { return <Form layout={schema.layout} initialValues={initialValues(schema)} onFinish={values => onSubmit(serializeSubmission(schema,values))}><h2>{schema.title}</h2><FormFields fields={schema.fields} /><Button type="primary" htmlType="submit">提交</Button></Form>; }
`;
  }
  const literal = (value: unknown) =>
    JSON.stringify(value)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  const imports = new Set(['Button', 'Form', 'Space']);
  const components: Partial<Record<ControlType, string>> = {
    input: 'Input',
    textarea: 'Input.TextArea',
    password: 'Input.Password',
    number: 'InputNumber',
    select: 'Select',
    radio: 'Radio.Group',
    checkbox: 'Checkbox.Group',
    switch: 'Switch',
    date: 'DatePicker',
    time: 'TimePicker',
    slider: 'Slider',
    rate: 'Rate',
  };
  const items = design.fields.map((field) => {
    const component = components[field.type]!;
    imports.add(component.split('.')[0]);
    const props = [
      field.disabled ? 'disabled' : '',
      ['input', 'textarea', 'password', 'number', 'select', 'date', 'time'].includes(field.type)
        ? `placeholder={${literal(field.placeholder)}}`
        : '',
      usesOptions(field.type) ? `options={${literal(field.options)}}` : '',
      field.type === 'textarea' ? 'rows={4}' : '',
      ['number', 'select', 'date', 'time'].includes(field.type) ? 'style={{ width: "100%" }}' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `      <Form.Item name={${literal(field.name)}} label={${literal(field.label)}}${field.type === 'switch' ? ' valuePropName="checked"' : ''} rules={${literal(fieldRules(field))}}>\n        <${component}${props ? ` ${props}` : ''} />\n      </Form.Item>`;
  });
  return `import { ${[...imports].sort().join(', ')} } from 'antd';

interface GeneratedFormProps {
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
}

export default function GeneratedForm({ onSubmit }: GeneratedFormProps) {
  const [form] = Form.useForm();
  return (
    <Form form={form} layout=${literal(design.layout)} initialValues={${literal(initialValues(design))}} onFinish={onSubmit} style={{ maxWidth: 720 }}>
      <h2>{${literal(design.title)}}</h2>
${items.join('\n')}
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">提交</Button>
          <Button onClick={() => form.resetFields()}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
`;
}
