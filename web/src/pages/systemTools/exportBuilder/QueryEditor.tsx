import { Button, Card, Input, InputNumber, Select, Space, Tag, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { BuilderCatalog, CatalogField, ExportFilter, ExportQuery } from './model';
import { emptyQuery, operators, tableFields } from './model';

export function ConditionValue({
  value,
  onChange,
  type,
  operator,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  type: string;
  operator: string;
}) {
  if (operator === 'isNull' || operator === 'isNotNull')
    return <Typography.Text type="secondary">无需填写值</Typography.Text>;
  if (operator === 'in' || operator === 'between')
    return (
      <Select
        mode="tags"
        style={{ minWidth: 210 }}
        value={
          Array.isArray(value)
            ? value.map(String)
            : value === undefined
              ? []
              : String(value).split(',')
        }
        tokenSeparators={[',']}
        placeholder={
          operator === 'between' ? '最小值、最大值（逗号分隔）' : '多个值（逗号分隔）'
        }
        onChange={onChange}
      />
    );
  if (type === 'boolean')
    return (
      <Select
        style={{ width: 140 }}
        placeholder="请选择"
        value={value as boolean | undefined}
        onChange={onChange}
        options={[
          { value: true, label: '是' },
          { value: false, label: '否' },
        ]}
      />
    );
  if (type === 'number')
    return (
      <InputNumber
        style={{ width: 170 }}
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
        placeholder="请输入数字"
      />
    );
  return (
    <Input
      style={{ width: 230 }}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
      placeholder={type === 'datetime' ? 'YYYY-MM-DD 或 ISO 格式' : '请输入'}
    />
  );
}
function fieldOptions(fields: CatalogField[]) {
  return fields.map((field) => ({ value: field.key, label: `${field.label} (${field.key})` }));
}
export default function QueryEditor({
  value,
  catalog,
  onChange,
}: {
  value: ExportQuery;
  catalog: BuilderCatalog;
  onChange: (value: ExportQuery) => void;
}) {
  const fields = tableFields(value, catalog);
  const options = fieldOptions(fields);
  const patch = (data: Partial<ExportQuery>) => onChange({ ...value, ...data });
  const tables = new Set([value.table, ...value.joins.map((join) => join.table)]);
  const relations = catalog.relations.flatMap((relation) => {
    const leftTable = relation.left.split('.')[0];
    const rightTable = relation.right.split('.')[0];
    if (tables.has(leftTable) === tables.has(rightTable)) return [];
    const table = tables.has(leftTable) ? rightTable : leftTable;
    return [
      {
        value: `${relation.left}|${relation.right}`,
        label: `${catalog.tables.find((item) => item.key === table)?.label ?? table} · ${relation.left} = ${relation.right}`,
        table,
        ...relation,
      },
    ];
  });
  const updateFilter = (index: number, data: Partial<ExportFilter>) =>
    patch({
      filters: value.filters.map((filter, i) => (i === index ? { ...filter, ...data } : filter)),
    });
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small" title="数据源">
        <Space wrap>
          <Select
            style={{ width: 290 }}
            showSearch
            optionFilterProp="label"
            placeholder="请选择数据表"
            value={value.table || undefined}
            options={catalog.tables.map((table) => ({
              value: table.key,
              label: `${table.label} (${table.key})`,
            }))}
            onChange={(table) => onChange(emptyQuery(table))}
          />
          <Typography.Text type="secondary">
            {catalog.tables.find((table) => table.key === value.table)?.scope}
          </Typography.Text>
        </Space>
        {value.joins.map((join, index) => (
          <Space key={join.table} wrap style={{ display: 'flex', marginTop: 12 }}>
            <Select
              value={join.type}
              style={{ width: 130 }}
              options={[
                { value: 'left', label: 'LEFT 连接' },
                { value: 'inner', label: 'INNER 连接' },
              ]}
              onChange={(type) =>
                patch({
                  joins: value.joins.map((row, i) => (i === index ? { ...row, type } : row)),
                })
              }
            />
            <Tag>{join.table}</Tag>
            <Typography.Text code>
              {join.left} = {join.right}
            </Typography.Text>
            <Button
              aria-label="移除关联"
              icon={<DeleteOutlined />}
              onClick={() => {
                const removed = new Set(value.joins.slice(index).map((row) => row.table));
                patch({
                  joins: value.joins.slice(0, index),
                  fields: value.fields.filter((field) => !removed.has(field.field.split('.')[0])),
                  filters: value.filters.filter((field) => !removed.has(field.field.split('.')[0])),
                  sort: value.sort.filter((field) => !removed.has(field.field.split('.')[0])),
                });
              }}
            />
          </Space>
        ))}
        {relations.length > 0 && value.joins.length < 3 && (
          <Select
            value={undefined}
            style={{ width: '100%', marginTop: 12 }}
            placeholder="添加关联"
            options={relations}
            onChange={(key) => {
              const relation = relations.find((item) => item.value === key)!;
              patch({
                joins: [
                  ...value.joins,
                  {
                    table: relation.table,
                    type: 'left',
                    left: relation.left,
                    right: relation.right,
                  },
                ],
              });
            }}
          />
        )}
        <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
          选择的数据表决定权限过滤范围。移除关联将同时移除相关字段、筛选与排序。
        </Typography.Paragraph>
      </Card>
      <Card
        size="small"
        title="导出字段（Excel 列）"
        extra={
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={!fields.length || value.fields.length >= 100}
            onClick={() => {
              const field = fields.find(
                (item) => !value.fields.some((column) => column.field === item.key),
              );
              if (field)
                patch({ fields: [...value.fields, { field: field.key, header: field.label }] });
            }}
          >
            添加字段
          </Button>
        }
      >
        {value.fields.length === 0 && (
          <Typography.Text type="secondary">尚未添加导出字段。</Typography.Text>
        )}
        {value.fields.map((column, index) => (
          <Space key={index} wrap style={{ display: 'flex', marginBottom: 10 }}>
            <Typography.Text style={{ width: 25 }}>{index + 1}</Typography.Text>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: 320 }}
              options={options}
              value={column.field}
              onChange={(field) =>
                patch({
                  fields: value.fields.map((item, i) => (i === index ? { ...item, field } : item)),
                })
              }
            />
            <Input
              value={column.header}
              maxLength={120}
              style={{ width: 200 }}
              placeholder="Excel 列名（不可重复）"
              onChange={(event) =>
                patch({
                  fields: value.fields.map((item, i) =>
                    i === index ? { ...item, header: event.target.value } : item,
                  ),
                })
              }
            />
            <Button
              aria-label="上移"
              disabled={index === 0}
              icon={<ArrowUpOutlined />}
              onClick={() => {
                const next = [...value.fields];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                patch({ fields: next });
              }}
            />
            <Button
              aria-label="下移"
              disabled={index === value.fields.length - 1}
              icon={<ArrowDownOutlined />}
              onClick={() => {
                const next = [...value.fields];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                patch({ fields: next });
              }}
            />
            <Button
              aria-label="删除字段"
              icon={<DeleteOutlined />}
              onClick={() => patch({ fields: value.fields.filter((_, i) => i !== index) })}
            />
          </Space>
        ))}
      </Card>
      <Card
        size="small"
        title="查询条件（全部满足 / AND）"
        extra={
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={!fields.length || value.filters.length >= 30}
            onClick={() =>
              patch({
                filters: [...value.filters, { field: fields[0].key, operator: 'eq', value: '' }],
              })
            }
          >
            添加条件
          </Button>
        }
      >
        {value.filters.map((filter, index) => {
          const type = fields.find((field) => field.key === filter.field)?.type || 'string';
          const unary = ['isNull', 'isNotNull'].includes(filter.operator);
          return (
            <Space key={index} wrap style={{ display: 'flex', marginBottom: 12 }}>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: 260 }}
                options={options}
                value={filter.field}
                onChange={(field) =>
                  updateFilter(index, {
                    field,
                    value: undefined,
                    parameter: undefined,
                    operator: 'eq',
                  })
                }
              />
              <Select
                style={{ width: 120 }}
                options={operators
                  .filter((operator) => type === 'string' || operator.value !== 'contains')
                  .filter(
                    (operator) =>
                      type !== 'boolean' ||
                      ['eq', 'ne', 'in', 'isNull', 'isNotNull'].includes(operator.value),
                  )}
                value={filter.operator}
                onChange={(operator) =>
                  updateFilter(index, { operator, value: undefined, parameter: undefined })
                }
              />
              {!unary && (
                <Select
                  style={{ width: 120 }}
                  value={filter.parameter !== undefined ? 'parameter' : 'value'}
                  options={[
                    { value: 'value', label: '固定值' },
                    { value: 'parameter', label: '导出参数' },
                  ]}
                  onChange={(mode) =>
                    updateFilter(index, {
                      value: undefined,
                      parameter: mode === 'parameter' ? `param${index + 1}` : undefined,
                    })
                  }
                />
              )}
              {filter.parameter !== undefined && !unary ? (
                <Input
                  style={{ width: 200 }}
                  maxLength={40}
                  placeholder="参数名，如 startDate"
                  value={filter.parameter}
                  onChange={(event) => updateFilter(index, { parameter: event.target.value })}
                />
              ) : (
                <ConditionValue
                  value={filter.value}
                  type={type}
                  operator={filter.operator}
                  onChange={(next) => updateFilter(index, { value: next })}
                />
              )}
              <Button
                aria-label="删除条件"
                icon={<DeleteOutlined />}
                onClick={() => patch({ filters: value.filters.filter((_, i) => i !== index) })}
              />
            </Space>
          );
        })}
        <Typography.Text type="secondary">
          参数名仅可包含字母、数字与下划线。部分名称为导出接口保留参数。
        </Typography.Text>
      </Card>
      <Card
        size="small"
        title="排序字段"
        extra={
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={!fields.length || value.sort.length >= 10}
            onClick={() =>
              patch({ sort: [...value.sort, { field: fields[0].key, direction: 'asc' }] })
            }
          >
            添加排序
          </Button>
        }
      >
        {value.sort.map((order, index) => (
          <Space key={index} style={{ display: 'flex', marginBottom: 10 }}>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: 320 }}
              options={options}
              value={order.field}
              onChange={(field) =>
                patch({
                  sort: value.sort.map((item, i) => (i === index ? { ...item, field } : item)),
                })
              }
            />
            <Select
              value={order.direction}
              options={[
                { value: 'asc', label: '升序' },
                { value: 'desc', label: '降序' },
              ]}
              onChange={(direction) =>
                patch({
                  sort: value.sort.map((item, i) => (i === index ? { ...item, direction } : item)),
                })
              }
            />
            <Button
              aria-label="删除排序"
              icon={<DeleteOutlined />}
              onClick={() => patch({ sort: value.sort.filter((_, i) => i !== index) })}
            />
          </Space>
        ))}
        <Space>
          <Typography.Text>导出条数</Typography.Text>
          <InputNumber
            min={1}
            max={catalog.limit}
            precision={0}
            value={value.limit}
            onChange={(limit) => patch({ limit: limit ?? 1000 })}
          />
          <Typography.Text type="secondary">
            单次导出条数，最多 {catalog.limit} 条。
          </Typography.Text>
        </Space>
      </Card>
    </Space>
  );
}
