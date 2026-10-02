import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Select, Space, Tag } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { ListQuery, RequestUrgency } from './types';
export const urgencyOptions = [
  { value: 'normal', label: '普通' },
  { value: 'urgent', label: '紧急' },
  { value: 'critical', label: '严重' },
];
export function UrgencyTag({ value = 'normal' }: { value?: RequestUrgency }) {
  return (
    <Tag color={value === 'critical' ? 'red' : value === 'urgent' ? 'orange' : undefined}>
      {urgencyOptions.find((item) => item.value === value)?.label ?? '未知'}
    </Tag>
  );
}
type Filters = Omit<ListQuery, 'page' | 'pageSize' | 'scope'>;
type Fields = Filters & { dates?: [Dayjs, Dayjs] };
export function RequestFilters({
  onSearch,
  reload,
}: {
  onSearch: (filters: Filters) => void;
  reload: () => unknown;
}) {
  const [form] = Form.useForm<Fields>();
  return (
    <Form
      form={form}
      layout="inline"
      style={{ gap: 12, marginBottom: 16 }}
      onFinish={({ dates, ...values }) =>
        onSearch({
          ...values,
          keyword: values.keyword?.trim(),
          createdFrom: dates?.[0]?.startOf('day').toISOString(),
          createdTo: dates?.[1]?.add(1, 'day').startOf('day').toISOString(),
        })
      }
    >
      <Form.Item name="keyword" label="关键字">
        <Input allowClear maxLength={200} placeholder="流程、标题" style={{ width: 220 }} />
      </Form.Item>
      <Form.Item name="ownerId" label="发起人 ID">
        <InputNumber min={1} max={Number.MAX_SAFE_INTEGER} precision={0} placeholder="全部" />
      </Form.Item>
      <Form.Item name="urgency" label="紧急程度">
        <Select allowClear placeholder="全部" options={urgencyOptions} style={{ width: 110 }} />
      </Form.Item>
      <Form.Item name="status" label="状态">
        <Select
          allowClear
          placeholder="全部"
          style={{ width: 115 }}
          options={[
            { value: 'pending', label: '待审批' },
            { value: 'approved', label: '已通过' },
            { value: 'rejected', label: '已驳回' },
            { value: 'withdrawn', label: '已撤回' },
          ]}
        />
      </Form.Item>
      <Form.Item name="dates" label="创建时间">
        <DatePicker.RangePicker />
      </Form.Item>
      <Form.Item name="overdue" valuePropName="checked">
        <Checkbox>仅看逾期</Checkbox>
      </Form.Item>
      <Space wrap>
        <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
          查询
        </Button>
        <Button
          onClick={() => {
            form.resetFields();
            onSearch({});
          }}
        >
          重置
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
          刷新
        </Button>
      </Space>
    </Form>
  );
}
