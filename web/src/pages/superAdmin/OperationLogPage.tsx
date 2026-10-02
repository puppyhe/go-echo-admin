// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Operation history filters and structured request/response inspection.
import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, Collapse, Descriptions, Modal, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import CrudPage from '../../features/crud/CrudPage';
import type { CrudField } from '../../features/crud/fieldRenderers';
import { sysOperationRecordApi } from '../../api/endpoints';
import type { SysOperationRecord } from '../../domain/system';
import type { SysUser } from '../../domain/user';
import type { PageInfo } from '../../types';
import {
  correlationFields,
  correlationDetails,
  LogDateRange,
} from '../systemTools/logs/LogFilters';

// Internal implementation detail.
const METHOD_COLORS: Record<string, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  DELETE: 'red',
};

// Internal implementation detail.
const METHOD_OPTIONS: CrudField['options'] = [
  { label: 'GET', value: 'GET', color: METHOD_COLORS.GET },
  { label: 'POST', value: 'POST', color: METHOD_COLORS.POST },
  { label: 'PUT', value: 'PUT', color: METHOD_COLORS.PUT },
  { label: 'DELETE', value: 'DELETE', color: METHOD_COLORS.DELETE },
];

// Internal implementation detail.
const PRE_STYLE: CSSProperties = {
  margin: 0,
  maxHeight: 320,
  overflow: 'auto',
  padding: 12,
  background: '#f6f8fa',
  borderRadius: 6,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

// Internal implementation detail.
export function formatLatency(ns: number): string {
  if (!Number.isFinite(ns) || ns < 0) return '-';
  if (ns >= 1e9) return `${(ns / 1e9).toFixed(2)} s`;
  if (ns >= 1e6) return `${(ns / 1e6).toFixed(2)} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toFixed(2)} µs`;
  return `${ns} ns`;
}

// Internal implementation detail.
function operatorText(user: SysUser | undefined | null, userID: number): string {
  if (user?.userName) return user.nickName ? `${user.userName}(${user.nickName})` : user.userName;
  return userID > 0 ? `userID:${userID}` : '-';
}

// Internal implementation detail.
function ellipsisText(value: unknown, maxWidth = 240): ReactNode {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return '-';
  return (
    <Typography.Text style={{ maxWidth }} ellipsis={{ tooltip: text }}>
      {text}
    </Typography.Text>
  );
}

// Internal implementation detail.
function statusTag(status: number): ReactNode {
  const ok = status >= 200 && status < 400;
  return <Tag color={ok ? 'success' : 'error'}>{ok ? `成功 ${status}` : `失败 ${status}`}</Tag>;
}

// Internal implementation detail.
function prettyJson(raw: string | undefined | null): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// Internal implementation detail.
function CopyableJsonBlock({ label, text }: { label: string; text: string | undefined | null }) {
  const pretty = prettyJson(text);
  if (!pretty) {
    return (
      <div>
        <Typography.Text type="secondary">{label}</Typography.Text>
        <pre style={{ ...PRE_STYLE, marginTop: 4 }}>暂无数据</pre>
      </div>
    );
  }
  return (
    <div>
      <Typography.Paragraph copyable={{ text: pretty }} style={{ marginBottom: 4 }}>
        {label}
      </Typography.Paragraph>
      <pre style={PRE_STYLE}>{pretty}</pre>
    </div>
  );
}

// Internal implementation detail.
function RecordDetail({
  record,
  onClose,
}: {
  record: SysOperationRecord | null;
  onClose: () => void;
}) {
  return (
    <Modal
      title="详情"
      open={Boolean(record)}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnHidden
    >
      {record && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <Descriptions
            size="small"
            bordered
            column={2}
            items={[
              ...correlationDetails(record),
              { key: 'user', label: '操作人', children: operatorText(record.user, record.userID) },
              {
                key: 'createdAt',
                label: '创建时间',
                children: record.CreatedAt
                  ? dayjs(record.CreatedAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-',
              },
              { key: 'ip', label: '请求 IP', children: record.ip || '-' },
              {
                key: 'method',
                label: '请求方式',
                children: (
                  <Tag color={METHOD_COLORS[record.method] ?? 'default'}>
                    {record.method || '-'}
                  </Tag>
                ),
              },
              { key: 'status', label: '状态码', children: statusTag(record.status) },
              { key: 'latency', label: '耗时', children: formatLatency(record.latency) },
              {
                key: 'path',
                label: '请求路径',
                span: 2,
                children: <span style={{ wordBreak: 'break-all' }}>{record.path || '-'}</span>,
              },
              {
                key: 'error',
                label: '错误信息',
                span: 2,
                children: (
                  <span
                    style={{
                      wordBreak: 'break-all',
                      color: record.errorMessage ? '#cf1322' : undefined,
                    }}
                  >
                    {record.errorMessage || '无'}
                  </span>
                ),
              },
            ]}
          />
          <CopyableJsonBlock label="请求体" text={record.body} />
          <CopyableJsonBlock label="响应体" text={record.resp} />
          <Collapse
            size="small"
            items={[
              {
                key: 'agent',
                label: '客户端信息（agent）',
                children: (
                  <Typography.Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }}>
                    {record.agent || '-'}
                  </Typography.Paragraph>
                ),
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

// Internal implementation detail.
const FIELDS: CrudField[] = [
  ...correlationFields,
  // Internal implementation detail.
  { key: 'CreatedAt', title: '创建时间', inTable: { width: 170 }, inForm: false },
  {
    key: 'user',
    title: '操作人',
    inTable: { width: 150 },
    inForm: false,
    render: (_value, record) =>
      operatorText(record.user as SysUser | undefined, Number(record.userID ?? 0)),
  },
  { key: 'ip', title: '请求 IP', inTable: { width: 130 }, inForm: false, inFilter: true },
  {
    key: 'method',
    title: '请求方式',
    inTable: { width: 100 },
    inForm: false,
    type: 'select',
    options: METHOD_OPTIONS,
    inFilter: true,
    render: (value) => {
      const method = String(value ?? '');
      return method ? <Tag color={METHOD_COLORS[method] ?? 'default'}>{method}</Tag> : '-';
    },
  },
  {
    key: 'path',
    title: '请求路径',
    inTable: { width: 260 },
    inForm: false,
    inFilter: true,
    placeholder: '请输入请求路径',
    render: (value) => ellipsisText(value, 240),
  },
  {
    key: 'status',
    title: '状态码',
    inTable: { width: 110 },
    inForm: false,
    inFilter: true,
    type: 'number',
    render: (value) => {
      const code = Number(value);
      return Number.isFinite(code) ? statusTag(code) : '-';
    },
  },
  {
    key: 'latency',
    title: '耗时',
    inTable: { width: 100 },
    inForm: false,
    render: (value) => formatLatency(Number(value)),
  },
  {
    key: 'errorMessage',
    title: '错误信息',
    inTable: { width: 200 },
    inForm: false,
    render: (value) => ellipsisText(value, 190),
  },
  // Internal implementation detail.
  { key: 'agent', title: '客户端信息', inTable: false, inForm: false },
  { key: 'body', title: '请求体', inTable: false, inForm: false },
  { key: 'resp', title: '响应体', inTable: false, inForm: false },
];

export default function OperationLogPage() {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SysOperationRecord | null>(null);

  // Internal implementation detail.
  const list = useCallback(
    (page: PageInfo) => sysOperationRecordApi.getSysOperationRecordList({ ...page, ...dates }),
    [dates],
  );

  const rowActions = useCallback(
    (row: SysOperationRecord) => (
      <Button type="link" size="small" onClick={() => setDetail(row)}>
        详情
      </Button>
    ),
    [],
  );

  return (
    <>
      <CrudPage<SysOperationRecord>
        extraToolbar={<LogDateRange onChange={setDates} />}
        fields={FIELDS}
        list={list}
        remove={(row) => sysOperationRecordApi.deleteSysOperationRecord({ ID: row.ID })}
        removeBatch={(ids) => sysOperationRecordApi.deleteSysOperationRecordByIds({ ids })}
        rowActions={rowActions}
      />
      <RecordDetail record={detail} onClose={() => setDetail(null)} />
    </>
  );
}
