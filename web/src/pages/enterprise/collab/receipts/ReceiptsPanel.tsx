import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Space, Table, Tag } from 'antd';
import { receiptsApi } from './api';
import type { ReceiptItem, ReceiptScope } from './types';
import type { Page } from '../types';
import { formatTime, LoadError, StatusTag } from '../shared';

export function ReceiptsPanel({
  scope,
  revision,
  onOpen,
}: {
  scope: ReceiptScope;
  revision: number;
  onOpen: (id: number) => void;
}) {
  const [query, setQuery] = useState({ page: 1, pageSize: 10, keyword: '' });
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<Page<ReceiptItem>>({
    list: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  const reload = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const data = await receiptsApi.list({ ...query, scope });
      if (current === serial.current) setResult(data);
    } catch (e) {
      if (current === serial.current) {
        setResult({ list: [], total: 0, page: query.page, pageSize: query.pageSize });
        setError(e instanceof Error ? e.message : 'listload failed');
      }
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [query, scope]);
  useEffect(() => {
    void reload();
    return () => {
      serial.current++;
    };
  }, [reload, revision]);
  return (
    <>
      <Alert
        type="info"
        showIcon
        message="Details history, detailsDetails. Approval details."
        style={{ marginBottom: 16 }}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          allowClear
          placeholder="title / Details / workflow / Details node"
          style={{ width: 300 }}
          maxLength={200}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(value) => setQuery((q) => ({ ...q, page: 1, keyword: value }))}
        />
        <Button onClick={() => void reload()}>refresh</Button>
      </Space>
      <LoadError error={error} retry={reload} />
      <Table<ReceiptItem>
        rowKey="id"
        loading={loading}
        dataSource={result.list}
        scroll={{ x: 1000 }}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total: result.total,
          showSizeChanger: true,
          onChange: (page, pageSize) =>
            setQuery((q) => ({ ...q, page: pageSize !== q.pageSize ? 1 : page, pageSize })),
        }}
        columns={[
          { title: 'message=', render: (_, row) => row.requestNumber || `#${row.requestId}` },
          {
            title: 'title',
            dataIndex: 'requestTitle',
            render: (title, row) => (
              <Button type="link" onClick={() => onOpen(row.requestId)}>
                {title}
              </Button>
            ),
          },
          { title: 'approvalworkflow', dataIndex: 'workflowName' },
          { title: 'Message node', dataIndex: 'nodeName' },
          {
            title: 'status',
            dataIndex: 'requestStatus',
            render: (status) => <StatusTag status={status} />,
          },
          {
            title: 'status',
            render: (_, row) => (
              <Tag color={row.readAt ? 'green' : 'blue'}>{row.readAt ? 'message=' : 'message='}</Tag>
            ),
          },
          { title: 'message=', dataIndex: 'createdAt', render: formatTime },
          { title: 'message=', dataIndex: 'readAt', render: formatTime },
          {
            title: 'message=',
            render: (_, row) => (
              <Button type="link" onClick={() => onOpen(row.requestId)}>
                labeldetails
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}
