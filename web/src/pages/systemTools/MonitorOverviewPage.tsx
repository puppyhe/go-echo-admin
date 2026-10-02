import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { request } from '../../api/request';

type Monitor = { status: { database: string; service: string; checkedAt: string }; tenant: { activeUsers: number; errors24h: number; auditEvents24h: number }; requests24h: { total: number; failed: number; averageDurationMs: number }; process: { goroutines: number; memoryAllocBytes: number; memorySysBytes: number; gcCycles: number }; database: { open?: number; inUse?: number; idle?: number; waitCount?: number; waitDurationMs?: number } };
const bytes = (v = 0) => { if (v < 1024) return `${v} B`; if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`; if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`; return `${(v / 1024 ** 3).toFixed(1)} GB`; };

export default function MonitorOverviewPage() {
  const [data, setData] = useState<Monitor>();
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setData(await request<Monitor>('/enterprise/monitor/overview')); } finally { setLoading(false); } }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  const processRows = data ? [{ key: 'goroutines', name: '协程数', value: data.process.goroutines }, { key: 'alloc', name: '当前内存', value: bytes(data.process.memoryAllocBytes) }, { key: 'sys', name: '系统内存', value: bytes(data.process.memorySysBytes) }, { key: 'gc', name: 'GC 次数', value: data.process.gcCycles }] : [];
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    {data && <Alert type={data.status.database === 'ok' ? 'success' : 'error'} showIcon message={data.status.database === 'ok' ? '系统运行正常' : '数据库连接异常'} description={`最近检查：${new Date(data.status.checkedAt).toLocaleString('zh-CN')}`} />}
    <Row gutter={16}><Col span={6}><Card><Statistic title="活跃用户" value={data?.tenant.activeUsers ?? 0} /></Card></Col><Col span={6}><Card><Statistic title="24 小时请求" value={data?.requests24h.total ?? 0} /></Card></Col><Col span={6}><Card><Statistic title="24 小时失败请求" value={data?.requests24h.failed ?? 0} valueStyle={{ color: data?.requests24h.failed ? '#cf1322' : undefined }} /></Card></Col><Col span={6}><Card><Statistic title="数据库连接" value={data?.database.open ?? 0} suffix="个" /></Card></Col></Row>
    <Card title="运行指标" extra={<Button icon={<ReloadOutlined />} onClick={() => void load().catch(() => undefined)} loading={loading}>刷新</Button>}>
      <Table rowKey="key" size="middle" pagination={false} dataSource={processRows} columns={[{ title: '指标', dataIndex: 'name' }, { title: '当前值', dataIndex: 'value' }]} />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>服务状态：<Tag color="success">{data?.status.service === 'ok' ? '正常' : data?.status.service || '未知'}</Tag>　平均响应：{(data?.requests24h.averageDurationMs ?? 0).toFixed(1)} ms　连接池：使用 {data?.database.inUse ?? 0} / 空闲 {data?.database.idle ?? 0}，等待 {data?.database.waitCount ?? 0} 次</Typography.Paragraph>
    </Card>
  </Space>;
}
