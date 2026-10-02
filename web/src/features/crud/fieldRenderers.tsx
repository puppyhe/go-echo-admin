// Internal implementation detail.
import { Input, InputNumber, Select, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { Rule } from 'antd/es/form';
import dayjs from 'dayjs';

/** fieldtype：input | password | number | select | textarea */
export type CrudFieldType = 'input' | 'password' | 'number' | 'select' | 'textarea';

// Internal implementation detail.
export interface CrudOption {
  label: string;
  value: string | number;
  // Internal implementation detail.
  color?: string;
}

// Internal implementation detail.
interface CrudFieldOptions {
  // Internal implementation detail.
  title: string;
  type?: CrudFieldType;
  // Internal implementation detail.
  options?: CrudOption[];
  // Internal implementation detail.
  loadOptions?: () => Promise<CrudOption[]>;
  required?: boolean;
  maxLength?: number;
  // Internal implementation detail.
  min?: number;
  max?: number;
  precision?: number;
  // Internal implementation detail.
  rules?: Rule[];
  rows?: number;
  placeholder?: string;
  /** create newformdefault value */
  defaultValue?: string | number;
  // Internal implementation detail.
  inFilter?: boolean;
  // Internal implementation detail.
  inTable?: boolean | { width?: number; align?: 'left' | 'center' | 'right' };
  // Internal implementation detail.
  inForm?: boolean;
  // Internal implementation detail.
  formOnlyOnCreate?: boolean;
  // Internal implementation detail.
  disabledInEdit?: boolean;
  // Internal implementation detail.
  render?: (value: unknown, record: Record<string, unknown>) => ReactNode;
}

export type CrudField<T extends object = Record<string, unknown>> = CrudFieldOptions & {
  // Internal implementation detail.
  key: Extract<keyof T, string>;
};

// Internal implementation detail.
export function f(key: string, title: string, opts?: Partial<CrudField>): CrudField;
export function f<T extends object>(
  key: Extract<keyof T, string>,
  title: string,
  opts?: Partial<CrudField<T>>,
): CrudField<T>;
export function f(key: string, title: string, opts: Partial<CrudField> = {}): CrudField {
  return { key, title, ...opts };
}

// Internal implementation detail.
export function renderTableValue(
  value: unknown,
  field: CrudField,
  record: Record<string, unknown>,
): ReactNode {
  if (field.render) return field.render(value, record);
  if (value === undefined || value === null || value === '') return '-';
  const option = field.options?.find((o) => o.value === value);
  if (option) {
    return option.color ? (
      <Tag color={option.color}>{option.label}</Tag>
    ) : (
      <Tag>{option.label}</Tag>
    );
  }
  if (typeof value === 'boolean') {
    return value ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
  }
  if (typeof value === 'string' && value.length > 40) {
    return (
      <Typography.Text style={{ maxWidth: 260 }} ellipsis={{ tooltip: value }}>
        {value}
      </Typography.Text>
    );
  }
  return String(value);
}

// Internal implementation detail.
export function renderFormControl(
  field: CrudField,
  options: CrudOption[],
  disabled: boolean,
): ReactNode {
  switch (field.type) {
    case 'password':
      return (
        <Input.Password
          placeholder={field.placeholder || `请输入${field.title}`}
          disabled={disabled}
          maxLength={field.maxLength ?? 72}
        />
      );
    case 'number':
      return (
        <InputNumber
          min={field.min}
          max={field.max}
          precision={field.precision}
          placeholder={field.placeholder || `请输入${field.title}`}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      );
    case 'select':
      return (
        <Select
          placeholder={field.placeholder || `请选择${field.title}`}
          disabled={disabled}
          options={options.map((o) => ({ label: o.label, value: o.value }))}
          allowClear
        />
      );
    case 'textarea':
      return (
        <Input.TextArea
          placeholder={field.placeholder || `请输入${field.title}`}
          disabled={disabled}
          rows={field.rows ?? 3}
          maxLength={field.maxLength}
          showCount={field.maxLength !== undefined}
        />
      );
    default:
      return (
        <Input
          placeholder={field.placeholder || `请输入${field.title}`}
          disabled={disabled}
          maxLength={field.maxLength ?? 255}
        />
      );
  }
}
