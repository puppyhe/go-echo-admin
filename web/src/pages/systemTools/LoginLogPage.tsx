// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Login history and request correlation filters.
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Descriptions, Modal, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import CrudPage from '../../features/crud/CrudPage';
import type { CrudField } from '../../features/crud/fieldRenderers';
import { sysLoginLogApi } from '../../api/endpoints';
import type { SysLoginLog } from '../../domain/system';
import type { SysUser } from '../../domain/user';
import type { PageInfo } from '../../types';
import { correlationFields, correlationDetails, LogDateRange } from './logs/LogFilters';

// Internal implementation detail.
const STATUS_OPTIONS: CrudField['options'] = [
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
];

// Internal implementation detail.
function loginStatusTag(value: unknown): ReactNode {
  if (value === true || value === 'success') return <Tag color="success">成功</Tag>;
  if (value === false || value === 'failed') return <Tag color="error">失败</Tag>;
  const text = value === null || value === undefined ? '' : String(value);
  return text ? <Tag>{text}</Tag> : '-';
}

// Internal implementation detail.
function operatorText(user: SysUser | undefined | null, userId: number | undefined): string {
  if (user?.userName) return user.nickName ? `${user.userName}(${user.nickName})` : user.userName;
  return userId && userId > 0 ? `userID:${userId}` : '-';
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
function LoginLogDetail({ record, onClose }: { record: SysLoginLog | null; onClose: () => void }) {
  return (
    <Modal
      title="登录详情"
      open={Boolean(record)}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnHidden
    >
      {record && (
        <Descriptions
          size="small"
          bordered
          column={2}
          style={{ marginTop: 8 }}
          items={[
            ...correlationDetails(record),
            { key: 'username', label: '用户名', children: record.username || '-' },
            { key: 'status', label: '状态', children: loginStatusTag(record.status) },
            { key: 'ip', label: '登录 IP', children: record.ip || '-' },
            {
              key: 'createdAt',
              label: '登录时间',
              children: record.CreatedAt
                ? dayjs(record.CreatedAt).format('YYYY-MM-DD HH:mm:ss')
                : '-',
            },
            {
              key: 'user',
              label: '用户',
              span: 2,
              children: operatorText(record.user, record.userId),
            },
            {
              key: 'errorMessage',
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
            {
              key: 'agent',
              label: '客户端信息',
              span: 2,
              children: <span style={{ wordBreak: 'break-all' }}>{record.agent || '-'}</span>,
            },
          ]}
        />
      )}
    </Modal>
  );
}

// Internal implementation detail.
const FIELDS: CrudField[] = [
  ...correlationFields,
  // Internal implementation detail.
  { key: 'CreatedAt', title: '登录时间', inTable: { width: 170 }, inForm: false },
  {
    key: 'username',
    title: '用户名',
    inTable: { width: 130 },
    inForm: false,
    inFilter: true,
    placeholder: '请输入用户名',
  },
  { key: 'ip', title: '登录 IP', inTable: { width: 140 }, inForm: false, inFilter: true },
  {
    key: 'status',
    title: '状态',
    inTable: { width: 90 },
    inForm: false,
    inFilter: true,
    type: 'select',
    options: STATUS_OPTIONS,
    render: (value) => loginStatusTag(value),
  },
  {
    key: 'errorMessage',
    title: '错误信息',
    inTable: { width: 220 },
    inForm: false,
    render: (value) => ellipsisText(value, 210),
  },
  {
    key: 'agent',
    title: '客户端信息',
    inTable: { width: 240 },
    inForm: false,
    render: (value) => ellipsisText(value, 230),
  },
  {
    key: 'user',
    title: '用户',
    inTable: { width: 140 },
    inForm: false,
    render: (_value, record) =>
      operatorText(record.user as SysUser | undefined, Number(record.userId ?? 0) || undefined),
  },
];

export default function LoginLogPage() {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SysLoginLog | null>(null);

  // Internal implementation detail.
  const list = useCallback(
    (page: PageInfo) => sysLoginLogApi.getLoginLogList({ ...page, ...dates }),
    [dates],
  );

  const rowActions = useCallback(
    (row: SysLoginLog) => (
      <Button type="link" size="small" onClick={() => setDetail(row)}>
        查看详情
      </Button>
    ),
    [],
  );

  return (
    <>
      <CrudPage<SysLoginLog>
        extraToolbar={<LogDateRange onChange={setDates} />}
        fields={FIELDS}
        list={list}
        remove={(row) => sysLoginLogApi.deleteLoginLog({ ID: row.ID })}
        removeBatch={(ids) => sysLoginLogApi.deleteLoginLogByIds({ ids })}
        rowActions={rowActions}
      />
      <LoginLogDetail record={detail} onClose={() => setDetail(null)} />
    </>
  );
}
