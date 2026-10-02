import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, DatePicker, Form, Input, Row, Select, Space, Statistic, Table, Tabs } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { request } from '../../api/request';

type CountRow = { key: string; count: number };
type Report = { summary: { total: number; success: number; failure: number; truncated: boolean }; byAction: CountRow[]; byResource: CountRow[]; byUser: CountRow[]; byDay: CountRow[] };
type Filters = { range?: [Dayjs, Dayjs]; action?: string; resource?: string; userId?: string; result?: string };

export default function AuditReportPage() {
  const [form] = Form.useForm<Filters>();
  const [report, setReport] = useState<Report>();
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { range, ...params } = filters;
      setReport(await request<Report>('/enterprise/audit/report', { params: { ...params, start: range?.[0]?.format('YYYY-MM-DD'), end: range?.[1]?.format('YYYY-MM-DD') } }));
    } finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  const columns = [{ title: '维度', dataIndex: 'key', render: (value: string) => value || '未分类' }, { title: '事件数量', dataIndex: 'count', width: 160 }];
  const table = (rows: CountRow[] = []) => <Table rowKey="key" size="middle" loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 10 }} />;
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Card><Form form={form} layout="inline" onFinish={setFilters} style={{ rowGap: 12 }}>
      <Form.Item name="range" label="时间"><DatePicker.RangePicker /></Form.Item>
      <Form.Item name="resource" label="资源"><Input allowClear placeholder="例如 user" /></Form.Item>
      <Form.Item name="action" label="动作"><Input allowClear placeholder="例如 user.update" /></Form.Item>
      <Form.Item name="result" label="结果"><Select allowClear style={{ width: 120 }} options={[{ label: '成功', value: 'success' }, { label: '失败', value: 'failure' }]} /></Form.Item>
      <Form.Item><Space><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button><Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setFilters({}); }}>重置</Button></Space></Form.Item>
    </Form></Card>
    <Row gutter={16}><Col span={8}><Card><Statistic title="审计事件" value={report?.summary.total ?? 0} /></Card></Col><Col span={8}><Card><Statistic title="成功事件" value={report?.summary.success ?? 0} valueStyle={{ color: '#389e0d' }} /></Card></Col><Col span={8}><Card><Statistic title="失败事件" value={report?.summary.failure ?? 0} valueStyle={{ color: '#cf1322' }} /></Card></Col></Row>
    <Card title="审计汇总" extra={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load().catch(() => undefined)}>刷新</Button>}>
      <Tabs items={[{ key: 'day', label: '按日期', children: table(report?.byDay) }, { key: 'resource', label: '按资源', children: table(report?.byResource) }, { key: 'action', label: '按动作', children: table(report?.byAction) }, { key: 'user', label: '按用户 ID', children: table(report?.byUser) }]} />
      {report?.summary.truncated && <span style={{ color: '#ad6800' }}>当前统计最多包含 10,000 条事件，请缩小查询时间范围。</span>}
    </Card>
  </Space>;
}
