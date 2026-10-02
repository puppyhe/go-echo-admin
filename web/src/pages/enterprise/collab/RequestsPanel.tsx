import { useEffect, useRef } from 'react';
import { Button, Table, Tag, Space } from 'antd';
import { collabApi } from './api';
import { formatTime, LoadError, StatusTag, usePagedList } from './shared';
import { RequestFilters, UrgencyTag } from './RequestFilters';
import type { RequestScope } from './types';

export function RequestsPanel({
  scope,
  revision,
  onOpen,
}: {
  scope: RequestScope;
  revision: number;
  onOpen: (id: number) => void;
}) {
  const list = usePagedList(collabApi.requests, scope);
  const previous = useRef(revision);
  useEffect(() => {
    if (previous.current !== revision) {
      previous.current = revision;
      void list.reload();
    }
  }, [revision, list.reload]);
  return (
    <>
      <RequestFilters onSearch={list.filter} reload={list.reload} />
      <LoadError error={list.error} retry={list.reload} />
      <Table
        rowKey="id"
        loading={list.loading}
        dataSource={list.result.list}
        pagination={list.pagination}
        scroll={{ x: 1000 }}
        columns={[
          { title: '编号', render: (_, row) => row.number ?? `#${row.id}` },
          {
            title: '标题',
            dataIndex: 'title',
            render: (title: string, row) => (
              <Button type="link" onClick={() => onOpen(row.id)}>
                {title}
              </Button>
            ),
          },
          {
            title: '表单 / 版本',
            render: (_, row) =>
              row.businessType
                ? `${row.formSnapshot?.title || row.formName || row.businessType} · 业务对象`
                : `${row.formName || `form #${row.formId}`} · v${row.formVersion}`,
          },
          { title: '审批工作流', dataIndex: 'workflowName' },
          { title: '发起人', render: (_, row) => `user #${row.ownerId}` },
          { title: '紧急程度', render: (_, row) => <UrgencyTag value={row.urgency} /> },
          {
            title: '状态',
            render: (_, row) => (
              <Space>
                <StatusTag status={row.status} />
                {row.overdue && <Tag color="red">已逾期</Tag>}
              </Space>
            ),
          },
          {
            title: '当前节点',
            render: (_, row) =>
              row.status === 'pending' && row.graphSnapshot
                ? '审批中'
                : row.currentStep >= 0
                  ? (row.workflowSnapshot?.[row.currentStep]?.name ?? `节点 ${row.currentStep + 1}`)
                  : '已结束',
          },
          { title: '创建时间', dataIndex: 'createdAt', width: 190, render: formatTime },
          {
            title: '操作',
            width: 90,
            render: (_, row) => (
              <Button type="link" onClick={() => onOpen(row.id)}>
                {scope === 'pending' ? '审批' : '详情'}
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}
