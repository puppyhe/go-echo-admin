import { useState } from 'react';
import { Alert, App, Button, Table, Tag } from 'antd';
import { formatTime } from '../shared';
import { receiptsApi } from './api';
import { unreadOwnReceipts } from './model';
import type { Receipt } from './types';

export function ReceiptDetails({
  receipts,
  userId,
  onRead,
}: {
  receipts: Receipt[];
  userId: number;
  onRead: () => void | Promise<void>;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<number>();
  const unread = unreadOwnReceipts(receipts, userId);
  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          unread.length
            ? `未读消息 ${unread.length} 条，请及时处理。`
            : '暂无待审批消息，请保持关注。'
        }
      />
      <Table<Receipt>
        rowKey="id"
        dataSource={receipts}
        pagination={false}
        scroll={{ x: 650 }}
        columns={[
          { title: '消息节点', dataIndex: 'nodeName' },
          {
            title: '用户',
            render: (_, row) => (row.userId === userId ? '我' : `user #${row.userId}`),
          },
          { title: '创建时间', dataIndex: 'createdAt', render: formatTime },
          {
            title: '状态',
            render: (_, row) => (
              <Tag color={row.readAt ? 'green' : 'blue'}>{row.readAt ? '已读' : '未读'}</Tag>
            ),
          },
          { title: '阅读时间', dataIndex: 'readAt', render: formatTime },
          {
            title: '操作',
            render: (_, row) =>
              row.userId === userId && !row.readAt ? (
                <Button
                  type="primary"
                  size="small"
                  disabled={busy !== undefined && busy !== row.id}
                  loading={busy === row.id}
                  onClick={async () => {
                    setBusy(row.id);
                    try {
                      await receiptsApi.read(row.requestId, row.id);
                      message.success('成功');
                      await onRead();
                    } finally {
                      setBusy(undefined);
                    }
                  }}
                >
                  已读
                </Button>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </>
  );
}
