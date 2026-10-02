import { cloneElement, type ReactElement } from 'react';
import { Form, Input, InputNumber, Select, Switch } from 'antd';
import {
  calendarValue,
  isAuxiliary,
  isContainer,
  numericType,
  type DesignField,
} from './formDesign';
import { renderFieldControl } from './formRuntime';
export function AdvancedFieldSettings({
  field,
  patch,
}: {
  field: DesignField;
  patch: (value: Partial<DesignField>) => void;
}) {
  function updateDefault(raw: unknown) {
    let value = raw;
    if (raw && typeof raw === 'object' && 'target' in raw)
      value = (raw as { target: { value: unknown } }).target.value;
    if (field.type === 'date' || field.type === 'time')
      value = calendarValue(value, field.type === 'date' ? 'YYYY-MM-DD' : 'HH:mm:ss');
    if (field.type === 'dateRange' && Array.isArray(value))
      value = value.map((item) => calendarValue(item, 'YYYY-MM-DD'));
    patch({ defaultValue: value ?? null });
  }
  return (
    <>
      <Form.Item label="栅格宽度" extra="一行共 24 格">
        <Select
          value={field.span ?? 24}
          options={[
            { label: '整行（24格）', value: 24 },
            { label: '四分之三（18格）', value: 18 },
            { label: '三分之二（16格）', value: 16 },
            { label: '半行（12格）', value: 12 },
            { label: '三分之一（8格）', value: 8 },
            { label: '四分之一（6格）', value: 6 },
          ]}
          onChange={(span) => patch({ span })}
        />
      </Form.Item>
      {!isAuxiliary(field.type) && (
        <>
          <Form.Item label="字段描述">
            <Input.TextArea
              value={field.description}
              maxLength={2000}
              rows={2}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </Form.Item>
        </>
      )}
      {isAuxiliary(field.type) && (
        <Form.Item label="显示内容" extra="纯文本展示，不支持 HTML 标签">
          <Input.TextArea
            value={field.content}
            rows={4}
            maxLength={4000}
            onChange={(event) => patch({ content: event.target.value })}
          />
        </Form.Item>
      )}
      {numericType(field.type) && (
        <>
          {(field.type === 'rate' ? (['max'] as const) : (['min', 'max', 'step'] as const)).map(
            (key) => (
              <Form.Item key={key} label={{ min: '最小值', max: '最大值', step: '步长' }[key]}>
                <InputNumber
                  style={{ width: '100%' }}
                  value={field[key]}
                  onChange={(value) => patch({ [key]: value ?? undefined })}
                />
              </Form.Item>
            ),
          )}
        </>
      )}
      {field.type === 'rate' && (
        <Form.Item label="允许半星">
          <Switch checked={field.allowHalf} onChange={(allowHalf) => patch({ allowHalf })} />
        </Form.Item>
      )}
      {['input', 'textarea', 'password'].includes(field.type) && (
        <>
          {(['minLength', 'maxLength'] as const).map((key) => (
            <Form.Item key={key} label={key === 'minLength' ? '最小长度' : '最大长度'}>
              <InputNumber
                value={field[key]}
                min={0}
                max={20000}
                precision={0}
                style={{ width: '100%' }}
                onChange={(value) => patch({ [key]: value ?? undefined })}
              />
            </Form.Item>
          ))}
        </>
      )}
      {field.type === 'subform' && (
        <>
          {(['minRows', 'maxRows', 'initialRows'] as const).map((key) => (
            <Form.Item
              key={key}
              label={{ minRows: '最小行数', maxRows: '最大行数', initialRows: '初始行数' }[key]}
              extra={key === 'initialRows' ? '未设置时的默认行数' : undefined}
            >
              <InputNumber
                value={field[key] ?? (key === 'maxRows' ? 20 : 0)}
                min={key === 'maxRows' ? 1 : 0}
                max={100}
                precision={0}
                style={{ width: '100%' }}
                onChange={(value) => patch({ [key]: value ?? undefined })}
              />
            </Form.Item>
          ))}
        </>
      )}
      {!isContainer(field.type) && !isAuxiliary(field.type) && (
        <>
          <Form.Item label="设置默认值">
            <Switch
              checked={field.defaultValue !== undefined}
              onChange={(enabled) =>
                patch({
                  defaultValue: enabled
                    ? field.type === 'switch'
                      ? false
                      : field.type === 'checkbox'
                        ? []
                        : ['number', 'rate', 'slider'].includes(field.type)
                          ? (field.min ?? 0)
                          : ['date', 'time', 'numberRange', 'dateRange'].includes(field.type)
                            ? null
                            : ''
                    : undefined,
                })
              }
            />
          </Form.Item>
          {field.defaultValue !== undefined && (
            <Form.Item label="默认值" extra="默认值自动填充；用户可在提交时修改">
              {cloneElement(
                renderFieldControl({ ...field, disabled: false }) as ReactElement<
                  Record<string, unknown>
                >,
                {
                  value: field.defaultValue,
                  checked: field.type === 'switch' ? field.defaultValue : undefined,
                  onChange: updateDefault,
                },
              )}
            </Form.Item>
          )}
        </>
      )}
    </>
  );
}
