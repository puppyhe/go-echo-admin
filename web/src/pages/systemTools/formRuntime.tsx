import {
  Button,
  Card,
  Checkbox,
  Col,
  ColorPicker,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Rate,
  Row,
  Select,
  Slider,
  Space,
  Switch,
  TimePicker,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fieldRules,
  initialValues,
  isAuxiliary,
  isLayout,
  numericBounds,
  type DesignField,
} from './formDesign';
function NumberRange({
  value,
  onChange,
  field,
}: {
  value?: [number | null, number | null];
  onChange?: (value: [number | null, number | null] | undefined) => void;
  field: DesignField;
}) {
  const [min, max] = numericBounds(field);
  const update = (index: number, number: number | null) => {
    const next: [number | null, number | null] = [...(value ?? [null, null])];
    next[index] = number;
    onChange?.(next.every((item) => item === null) ? undefined : next);
  };
  return (
    <Space.Compact style={{ width: '100%' }}>
      <InputNumber
        aria-label={`${field.label} value`}
        value={value?.[0]}
        min={min}
        max={max}
        step={field.step}
        disabled={field.disabled}
        placeholder="Enter a number"
        style={{ width: '50%' }}
        onChange={(value) => update(0, value)}
      />
      <InputNumber
        aria-label={`${field.label} value`}
        value={value?.[1]}
        min={min}
        max={max}
        step={field.step}
        disabled={field.disabled}
        placeholder="Enter a number"
        style={{ width: '50%' }}
        onChange={(value) => update(1, value)}
      />
    </Space.Compact>
  );
}
function DateControl({
  value,
  onChange,
  field,
}: {
  value?: unknown;
  onChange?: (value: unknown) => void;
  field: DesignField;
}) {
  const convert = (item: unknown) => {
    if (!item) return null;
    if (dayjs.isDayjs(item)) return item;
    const text = String(item);
    return dayjs(field.type === 'time' && /^\d\d:\d\d/.test(text) ? `2000-01-01T${text}` : text);
  };
  const props = { disabled: field.disabled, style: { width: '100%' } };
  if (field.type === 'dateRange')
    return (
      <DatePicker.RangePicker
        {...props}
        value={Array.isArray(value) ? [convert(value[0]), convert(value[1])] : null}
        onChange={(value) => onChange?.(value)}
      />
    );
  if (field.type === 'time')
    return (
      <TimePicker
        {...props}
        placeholder={field.placeholder}
        value={convert(value)}
        onChange={(value) => onChange?.(value)}
      />
    );
  return (
    <DatePicker
      {...props}
      placeholder={field.placeholder}
      value={convert(value)}
      onChange={(value) => onChange?.(value)}
    />
  );
}
function ColorControl({
  value,
  onChange,
  disabled,
}: {
  value?: string | null;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <ColorPicker
      disabled={disabled}
      value={value || undefined}
      disabledAlpha
      format="hex"
      allowClear
      showText
      onChange={(_, hex) => onChange?.(hex)}
      onClear={() => onChange?.('')}
    />
  );
}
export function renderFieldControl(field: DesignField) {
  const props = { placeholder: field.placeholder, disabled: field.disabled };
  const [min, max] = numericBounds(field);
  switch (field.type) {
    case 'input':
      return <Input {...props} maxLength={field.maxLength} />;
    case 'textarea':
      return <Input.TextArea {...props} rows={4} maxLength={field.maxLength} />;
    case 'password':
      return <Input.Password {...props} maxLength={field.maxLength} />;
    case 'number':
      return (
        <InputNumber {...props} min={min} max={max} step={field.step} style={{ width: '100%' }} />
      );
    case 'numberRange':
      return <NumberRange field={field} />;
    case 'select':
      return <Select {...props} options={field.options} style={{ width: '100%' }} allowClear />;
    case 'radio':
      return <Radio.Group disabled={field.disabled} options={field.options} />;
    case 'checkbox':
      return <Checkbox.Group disabled={field.disabled} options={field.options} />;
    case 'switch':
      return <Switch disabled={field.disabled} />;
    case 'date':
    case 'dateRange':
    case 'time':
      return <DateControl field={field} />;
    case 'color':
      return <ColorControl disabled={field.disabled} />;
    case 'slider':
      return <Slider disabled={field.disabled} min={min} max={max} step={field.step} />;
    case 'rate':
      return <Rate disabled={field.disabled} count={max} allowHalf={field.allowHalf} />;
    default:
      return <Typography.Text type="secondary">{field.content || field.label}</Typography.Text>;
  }
}
export function FormFields({
  fields,
  prefix = [],
  disabled = false,
}: {
  fields: DesignField[];
  prefix?: (string | number)[];
  disabled?: boolean;
}) {
  return (
    <Row gutter={[16, 0]}>
      {fields.map((raw) => {
        const field = { ...raw, disabled: disabled || raw.disabled };
        const name = [...prefix, field.name];
        let content;
        if (field.type === 'group')
          content = (
            <Card size="small" title={field.label} style={{ marginBottom: 16 }}>
              <Typography.Paragraph type="secondary">{field.description}</Typography.Paragraph>
              <FormFields fields={field.children ?? []} prefix={prefix} disabled={field.disabled} />
            </Card>
          );
        else if (field.type === 'grid')
          content = (
            <div style={{ marginBottom: 8 }}>
              {field.description && (
                <Typography.Paragraph type="secondary">{field.description}</Typography.Paragraph>
              )}
              <FormFields fields={field.children ?? []} prefix={prefix} disabled={field.disabled} />
            </div>
          );
        else if (field.type === 'text')
          content = (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
              {field.content || field.label}
            </Typography.Paragraph>
          );
        else if (field.type === 'divider')
          content = <Divider orientation="left">{field.content || field.label}</Divider>;
        else if (field.type === 'subform')
          content = (
            <Form.List
              name={name}
              rules={
                field.disabled
                  ? []
                  : [
                      {
                        validator: (_, rows: unknown) => {
                          const min = Math.max(field.minRows ?? 0, field.required ? 1 : 0);
                          return !Array.isArray(rows)
                            ? min
                              ? Promise.reject(new Error(`Add at least one row to 「${field.label}」`))
                              : Promise.resolve()
                            : rows.length < min || rows.length > (field.maxRows ?? 20)
                              ? Promise.reject(
                                  new Error(`「${field.label}」must contain between ${min} and ${field.maxRows ?? 20} rows`),
                                )
                              : Promise.resolve();
                        },
                      },
                    ]
              }
            >
              {(rows, { add, remove }, { errors }) => (
                <Card
                  size="small"
                  title={
                    <span>
                      {field.required && <Typography.Text type="danger">* </Typography.Text>}
                      {field.label}
                    </span>
                  }
                  style={{ marginBottom: 16 }}
                  extra={
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      disabled={field.disabled || rows.length >= (field.maxRows ?? 20)}
                      onClick={() =>
                        add(
                          initialValues({
                            version: 1,
                            title: 'row',
                            layout: 'vertical',
                            fields: field.children ?? [],
                          }),
                        )
                      }
                    >
                      Add row
                    </Button>
                  }
                >
                  {field.description && (
                    <Typography.Paragraph type="secondary">
                      {field.description}
                    </Typography.Paragraph>
                  )}
                  {rows.map((row) => (
                    <Card
                      key={row.key}
                      type="inner"
                      size="small"
                      title={`Row ${row.name + 1}`}
                      style={{ marginBottom: 12 }}
                      extra={
                        <Button
                          size="small"
                          danger
                          disabled={field.disabled}
                          icon={<DeleteOutlined />}
                          onClick={() => remove(row.name)}
                        >
                          Delete row
                        </Button>
                      }
                    >
                      <FormFields
                        fields={field.children ?? []}
                        prefix={[row.name]}
                        disabled={field.disabled}
                      />
                    </Card>
                  ))}
                  {!rows.length && (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No rows yet. Add a row to continue."
                    />
                  )}
                  <Form.ErrorList errors={errors} />
                </Card>
              )}
            </Form.List>
          );
        else
          content = (
            <Form.Item
              name={name}
              label={field.label}
              extra={field.description}
              valuePropName={field.type === 'switch' ? 'checked' : 'value'}
              rules={fieldRules(field)}
            >
              {renderFieldControl(field)}
            </Form.Item>
          );
        return (
          <Col key={field.id} xs={24} sm={field.span ?? 24}>
            {content}
          </Col>
        );
      })}
    </Row>
  );
}
function showValue(field: DesignField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'password') return '••••••••';
  if (field.type === 'switch') return value ? 'On' : 'Off';
  const label = (value: unknown) =>
    field.options?.find((option) => option.value === value)?.label ?? String(value);
  return Array.isArray(value)
    ? value.map(label).join(field.type.endsWith('Range') ? ' to ' : ', ') || '—'
    : label(value);
}
/** Read the immutable submitted snapshot; never hydrate historical values with newer defaults. */
export function FormValueView({
  fields,
  data,
}: {
  fields: DesignField[];
  data: Record<string, unknown>;
}) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {fields.map((field) => {
        if (isLayout(field.type))
          return (
            <Card key={field.id} size="small" title={field.label}>
              <FormValueView fields={field.children ?? []} data={data} />
            </Card>
          );
        if (isAuxiliary(field.type))
          return field.type === 'divider' ? (
            <Divider key={field.id} orientation="left">
              {field.content || field.label}
            </Divider>
          ) : (
            <Typography.Paragraph key={field.id} style={{ whiteSpace: 'pre-wrap' }}>
              {field.content || field.label}
            </Typography.Paragraph>
          );
        if (field.type === 'subform') {
          const rows = data[field.name];
          return (
            <Card key={field.id} size="small" title={field.label}>
              {Array.isArray(rows) && rows.length ? (
                rows.map((row, index) => (
                  <Card
                    key={index}
                    size="small"
                    type="inner"
                    title={`Row ${index + 1}`}
                    style={{ marginBottom: 12 }}
                  >
                    <FormValueView
                      fields={field.children ?? []}
                      data={row && typeof row === 'object' && !Array.isArray(row) ? row : {}}
                    />
                  </Card>
                ))
              ) : (
                <Typography.Text type="secondary">No submitted rows</Typography.Text>
              )}
            </Card>
          );
        }
        return (
          <Descriptions
            key={field.id}
            bordered
            size="small"
            column={1}
            items={[
              {
                key: field.name,
                label: field.label,
                children: (
                  <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {showValue(field, data[field.name])}
                  </span>
                ),
              },
            ]}
          />
        );
      })}
    </Space>
  );
}
