// Current server resource and runtime diagnostics.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Col, Progress, Row, Space, Table, Tag, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import EChart from '../../features/charts/EChart';
import type { ChartOption } from '../../features/charts/useChart';
import { systemApi } from '../../api/endpoints';
import type { ServerDiskInfo, ServerInfo } from '../../domain/systemTools';

// Internal implementation detail.
const POLL_INTERVAL = 5000;
// Internal implementation detail.
const MAX_POINTS = 60;

// Internal implementation detail.
function clampPercent(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(100, value);
}

// Internal implementation detail.
function formatBytes(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '-';
  const n = value;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? Math.round(size) : size.toFixed(2)} ${units[unit]}`;
}

// Internal implementation detail.
function memPercent(info: ServerInfo | null): number | undefined {
  if (!info) return undefined;
  const total = Number(info.memTotal);
  const used = Number(info.memUsed);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used) || used < 0) return undefined;
  return clampPercent((used / total) * 100);
}

// Internal implementation detail.
function MetricCard({
  title,
  value,
  note,
  percent,
}: {
  title: string;
  value: string;
  note?: string;
  percent?: number;
}) {
  return (
    <Card className="table-card" styles={{ body: { padding: 20 } }}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {title}
      </Typography.Text>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      {note && (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {note}
        </div>
      )}
      {percent !== undefined && (
        <Progress percent={percent} showInfo={false} size="small" style={{ marginTop: 10 }} />
      )}
    </Card>
  );
}

export default function ServerStatePage() {
  const { token } = theme.useToken();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [failed, setFailed] = useState(false);
  // Internal implementation detail.
  const [samples, setSamples] = useState<
    { time: string; cpu: number | null; mem: number | null }[]
  >([]);
  // Internal implementation detail.
  const seqRef = useRef(0);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const seq = ++seqRef.current;
      try {
        const data = await systemApi.getServerInfo();
        if (stopped || seq !== seqRef.current) return;
        setInfo(data);
        setFailed(false);
        setSamples((prev) =>
          [
            ...prev,
            {
              time: dayjs().format('HH:mm:ss'),
              cpu: clampPercent(data?.cpuUsed) ?? null,
              mem: memPercent(data) ?? null,
            },
          ].slice(-MAX_POINTS),
        );
      } catch {
        // Internal implementation detail.
        if (!stopped && seq === seqRef.current) setFailed(true);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  const lastUpdate = samples.length > 0 ? samples[samples.length - 1].time : '-';

  // Internal implementation detail.
  const chartOption = useMemo<ChartOption>(
    () => ({
      grid: { left: 44, right: 16, top: 36, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        renderMode: 'richText',
        valueFormatter: (value: unknown) =>
          typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '数据',
      },
      legend: { top: 0, icon: 'circle', textStyle: { color: token.colorTextSecondary } },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: samples.map((s) => s.time),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: token.colorTextSecondary },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: token.colorTextSecondary, formatter: (value: number) => `${value}%` },
        splitLine: { lineStyle: { type: 'dashed', color: token.colorSplit } },
      },
      series: [
        {
          name: 'CPU 使用率',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: samples.map((s) => s.cpu),
          itemStyle: { color: token.colorPrimary },
          lineStyle: { width: 2, color: token.colorPrimary },
          areaStyle: { opacity: 0.12 },
        },
        {
          name: '内存使用率',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: samples.map((s) => s.mem),
          itemStyle: { color: '#36cfc9' },
          lineStyle: { width: 2, color: '#36cfc9' },
          areaStyle: { opacity: 0.12 },
        },
      ],
    }),
    [samples, token],
  );

  const diskColumns = useMemo<TableColumnsType<ServerDiskInfo>>(
    () => [
      {
        title: '路径',
        dataIndex: 'path',
        render: (value: unknown) => String(value ?? '-') || '-',
      },
      {
        title: '总容量',
        dataIndex: 'total',
        width: 140,
        render: (value: unknown) => formatBytes(value),
      },
      {
        title: '已使用',
        dataIndex: 'used',
        width: 140,
        render: (value: unknown) => formatBytes(value),
      },
      {
        title: '使用率',
        key: 'usage',
        width: 200,
        render: (_: unknown, row: ServerDiskInfo) => {
          const total = Number(row.total);
          const used = Number(row.used);
          if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) return '-';
          const percent = clampPercent((used / total) * 100);
          if (percent === undefined) return '-';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress
                percent={percent}
                showInfo={false}
                size="small"
                style={{ width: 120, marginBottom: 0 }}
              />
              <span>{percent.toFixed(1)}%</span>
            </div>
          );
        },
      },
    ],
    [],
  );

  const disks = Array.isArray(info?.disks) ? (info?.disks as ServerDiskInfo[]) : [];
  const cpuUsage = clampPercent(info?.cpuUsed);
  const memoryUsage = memPercent(info);

  return (
    <div>
      {failed && (
        <Alert
          type="warning"
          showIcon
          message={
            info
              ? '请求失败，数据获取失败；将在 5 秒后重试。'
              : '服务信息请求失败，页面请稍后重新尝试（5 秒后自动刷新）。'
          }
          style={{ marginBottom: 12 }}
        />
      )}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            title="CPU 使用率"
            value={cpuUsage === undefined ? '数据' : `${cpuUsage.toFixed(1)}%`}
            note={info?.cpus ? `${info.cpus} 核` : '核心数'}
            percent={cpuUsage}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            title="内存使用率"
            value={`${formatBytes(info?.memUsed)} / ${formatBytes(info?.memTotal)}`}
            note={memoryUsage === undefined ? '数据' : `内存 ${memoryUsage.toFixed(1)}%`}
            percent={memoryUsage}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            title="系统信息"
            value={info?.os || '-'}
            note={info?.arch ? `架构：${info.arch}` : undefined}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            title="Go 版本"
            value={info?.goVersion || '-'}
            note={lastUpdate !== '-' ? `最后更新 ${lastUpdate}` : '待更新…'}
          />
        </Col>
      </Row>

      <Card
        title="实时监控"
        extra={
          <Space>
            <Tag color="processing">每 5 秒自动刷新</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              数据点 {Math.min(samples.length, MAX_POINTS)} 个
            </Typography.Text>
          </Space>
        }
        className="chart-card"
      >
        <EChart option={chartOption} height={300} />
      </Card>

      <Card title="磁盘信息" className="table-card" styles={{ body: { padding: '16px 16px 0' } }}>
        <Table<ServerDiskInfo>
          rowKey={(row) => row.path ?? String(disks.indexOf(row))}
          columns={diskColumns}
          dataSource={disks}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
