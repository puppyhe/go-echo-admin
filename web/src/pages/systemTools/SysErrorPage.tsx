// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, Descriptions, Modal, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import CrudPage from '../../features/crud/CrudPage';
import type { CrudField } from '../../features/crud/fieldRenderers';
import { sysErrorApi } from '../../api/endpoints';
import type { SysError } from '../../domain/systemTools';
import type { PageInfo } from '../../types';
import { correlationFields, correlationDetails, LogDateRange } from './logs/LogFilters';

// Internal implementation detail.
const LEVEL_TAGS: Record<string, { label: string; color: string }> = {
  fatal: { label: '严重错误', color: 'error' },
  panic: { label: '崩溃', color: 'error' },
  error: { label: '错误', color: 'warning' },
  warn: { label: '警告', color: 'warning' },
  warning: { label: '警告', color: 'warning' },
  info: { label: '信息', color: 'processing' },
};

function levelTag(value: unknown): ReactNode {
  const key = String(value ?? '').toLowerCase();
  const conf = LEVEL_TAGS[key];
  if (conf) return <Tag color={conf.color}>{conf.label}</Tag>;
  return key ? <Tag>{key}</Tag> : '-';
}

function statusLabel(value: unknown): ReactNode {
  const key = String(value ?? '').toLowerCase();
  const labels: Record<string, { label: string; color: string }> = {
    open: { label: '待处理', color: 'default' },
    pending: { label: '待处理', color: 'default' },
    processing: { label: '处理中', color: 'processing' },
    resolved: { label: '已解决', color: 'success' },
    handled: { label: '已解决', color: 'success' },
  };
  const conf = labels[key];
  return conf ? <Tag color={conf.color}>{conf.label}</Tag> : key ? <Tag>{key}</Tag> : '-';
}

// Internal implementation detail.
const PRE_STYLE: CSSProperties = {
  margin: 0,
  maxHeight: 260,
  overflow: 'auto',
  padding: 12,
  background: '#f6f8fa',
  borderRadius: 6,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

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
function mergeDetail(row: SysError, full: SysError): SysError {
  return { ...row, ...full };
}

// Internal implementation detail.
function ErrorDetail({ record, onClose }: { record: SysError | null; onClose: () => void }) {
  const [detail, setDetail] = useState<SysError | null>(record);

  // Internal implementation detail.
  useEffect(() => {
    setDetail(record);
    if (!record) return;
    let stopped = false;
    void sysErrorApi
      .findSysError({ ID: record.ID })
      .then((full) => {
        if (!stopped) setDetail(mergeDetail(record, full));
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [record]);

  return (
    <Modal
      title="错误详情"
      open={Boolean(record)}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnHidden
    >
      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <Descriptions
            size="small"
            bordered
            column={2}
            items={[
              ...correlationDetails(detail),
              { key: 'status', label: '处理状态', children: statusLabel(detail.status) },
              {
                key: 'resolved',
                label: '处理信息',
                children: detail.resolvedAt
                  ? `#${detail.resolvedBy} · ${dayjs(detail.resolvedAt).format('YYYY-MM-DD HH:mm:ss')}`
                  : '-',
              },
              { key: 'agent', label: '处理人', span: 2, children: detail.agent || '-' },
              { key: 'app', label: '应用模块', children: detail.app || '-' },
              { key: 'level', label: '错误级别', children: levelTag(detail.level) },
              {
                key: 'userID',
                label: '用户 ID',
                children: detail.userID ? String(detail.userID) : '-',
              },
              {
                key: 'createdAt',
                label: '发生时间',
                children: detail.CreatedAt
                  ? dayjs(detail.CreatedAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-',
              },
            ]}
          />
          {(
            [
              ['msg', '错误消息'],
              ['err', '错误详情'],
              ['stack', '堆栈信息'],
              ['request', '请求信息'],
              ['solution', '处理方案'],
            ] as [keyof SysError, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <Typography.Paragraph
                copyable={{ text: String(detail[key] ?? '') }}
                style={{ marginBottom: 4 }}
              >
                {label}
              </Typography.Paragraph>
              <pre style={PRE_STYLE}>{String(detail[key] ?? '') || '暂无数据'}</pre>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Internal implementation detail.
const FIELDS: CrudField[] = [
  ...correlationFields,
  {
    key: 'status',
    title: '处理状态',
    type: 'select',
    inFilter: true,
    required: true,
    defaultValue: 'pending',
    options: [
      { label: '待处理', value: 'pending', color: 'default' },
      { label: '处理中', value: 'processing', color: 'processing' },
      { label: '已解决', value: 'resolved', color: 'success' },
    ],
  },
  // Internal implementation detail.
  { key: 'CreatedAt', title: '发生时间', inTable: { width: 170 }, inForm: false },
  { key: 'app', title: '应用模块', inTable: { width: 130 }, inForm: false, inFilter: true },
  {
    key: 'err',
    title: '错误详情',
    inTable: { width: 240 },
    inForm: false,
    render: (value) => ellipsisText(value, 230),
  },
  {
    key: 'msg',
    title: '错误消息',
    inTable: { width: 220 },
    inForm: false,
    render: (value) => ellipsisText(value, 210),
  },
  {
    key: 'level',
    title: '错误级别',
    type: 'select',
    options: Object.entries(LEVEL_TAGS).map(([value, entry]) => ({ value, label: entry.label })),
    inFilter: true,
    inTable: { width: 90, align: 'center' },
    inForm: false,
    render: (value) => levelTag(value),
  },
  {
    key: 'solution',
    title: '处理方案',
    inTable: { width: 180 },
    type: 'textarea',
    maxLength: 6000,
    render: (value) => ellipsisText(value, 170),
  },
  // Internal implementation detail.
  {
    key: 'keyword',
    title: '关键词',
    inTable: false,
    inForm: false,
    inFilter: true,
    placeholder: '请输入关键词',
  },
  // Internal implementation detail.
  { key: 'request', title: '请求信息', inTable: false, inForm: false },
  { key: 'userID', title: '用户 ID', inTable: false, inForm: false },
];

export default function SysErrorPage() {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SysError | null>(null);
  // Internal implementation detail.
  const [solution, setSolution] = useState<{ open: boolean; loading: boolean; text: string }>({
    open: false,
    loading: false,
    text: '',
  });

  // Internal implementation detail.
  const list = useCallback(
    (page: PageInfo) => sysErrorApi.getSysErrorList({ ...page, ...dates }),
    [dates],
  );

  const update = useCallback((values: Record<string, unknown>) => {
    return sysErrorApi.updateSysError({
      ID: Number(values.ID ?? 0),
      solution: String(values.solution ?? ''),
      status: values.status as SysError['status'],
      revision: Number(values.revision ?? 0),
    });
  }, []);

  // Internal implementation detail.
  const beforeSubmit = useCallback(
    (
      values: Record<string, unknown>,
      mode: 'create' | 'edit',
      row: SysError | null,
    ): Record<string, unknown> => {
      if (mode === 'edit' && row) return { ...values, ID: row.ID, revision: row.revision ?? 0 };
      return values;
    },
    [],
  );

  // Internal implementation detail.
  const onSolution = async (row: SysError) => {
    setSolution({ open: true, loading: true, text: '' });
    try {
      const text = await sysErrorApi.getSysErrorSolution({ ID: row.ID });
      setSolution({ open: true, loading: false, text });
    } catch {
      setSolution({ open: true, loading: false, text: '' });
    }
  };

  const rowActions = useCallback(
    (row: SysError) => (
      <>
        <Button type="link" size="small" onClick={() => setDetail(row)}>
          查看详情
        </Button>
        <Button type="link" size="small" onClick={() => void onSolution(row)}>
          查看处理方案
        </Button>
      </>
    ),
    [],
  );

  return (
    <>
      <CrudPage<SysError>
        extraToolbar={<LogDateRange onChange={setDates} />}
        fields={FIELDS}
        list={list}
        update={update}
        beforeSubmit={beforeSubmit}
        remove={(row) => sysErrorApi.deleteSysError(row.ID)}
        removeBatch={(ids) => sysErrorApi.deleteSysErrorByIds(ids)}
        rowActions={rowActions}
      />
      <ErrorDetail record={detail} onClose={() => setDetail(null)} />
      <Modal
        title="处理方案"
        open={solution.open}
        footer={null}
        onCancel={() => setSolution({ open: false, loading: false, text: '' })}
        width={640}
        destroyOnHidden
      >
        {solution.loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <Spin />
            <div className="muted" style={{ marginTop: 12 }}>
              正在加载处理方案…
            </div>
          </div>
        ) : (
          <pre style={{ ...PRE_STYLE, maxHeight: 420, marginTop: 8 }}>
            {solution.text || '暂无处理方案'}
          </pre>
        )}
      </Modal>
    </>
  );
}
