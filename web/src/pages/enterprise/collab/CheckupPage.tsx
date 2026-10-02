import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMenu } from '../../../menu/MenuContext';
import { allPages, collabApi } from './api';
import { canManage, formatTime } from './shared';
import { checkupLabels, filterCheckupIssues } from './workflowModel';
import type { CheckupIssue, Workflow, WorkflowCheckup } from './types';

export function CheckupPanel({
  workflowId,
  onWorkflow,
}: {
  workflowId?: number;
  onWorkflow?: (id: number) => void;
}) {
  const navigate = useNavigate();
  const menu = useMenu();
  const [result, setResult] = useState<WorkflowCheckup | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [scope, setScope] = useState<'definition' | 'runtime'>('definition');
  const [keyword, setKeyword] = useState('');
  const [severity, setSeverity] = useState<string>();
  const [code, setCode] = useState<string>();
  const [selectedWorkflow, setSelectedWorkflow] = useState<number | undefined>(workflowId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const data = await collabApi.checkup(workflowId);
      if (current === serial.current) setResult(data);
    } catch (e) {
      if (current === serial.current) setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [workflowId]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  useEffect(() => {
    let alive = true;
    if (!workflowId)
      void allPages(collabApi.workflows)
        .then((data) => {
          if (alive) setWorkflows(data.filter((item) => canManage(item.ownerId)));
        })
        .catch(() => undefined);
    setSelectedWorkflow(workflowId);
    return () => {
      alive = false;
    };
  }, [workflowId]);
  const rows = useMemo(
    () =>
      filterCheckupIssues(result?.issues ?? [], {
        scope,
        keyword,
        severity,
        code,
        workflowId: selectedWorkflow,
      }),
    [result, scope, keyword, severity, code, selectedWorkflow],
  );
  const issueTypes = [
    ...new Set(
      (result?.issues ?? []).filter((issue) => issue.scope === scope).map((issue) => issue.code),
    ),
  ];
  const openWorkflow = (id: number) => {
    if (onWorkflow) onWorkflow(id);
    else
      navigate(
        `${menu.pathOf('flowDefinitions') || '/flowCenter/definition'}?workflowId=${id}&action=design`,
      );
  };
  return (
    <>
      <div className="collab-toolbar">
        <Space>
          <Typography.Title level={5} style={{ margin: 0 }}>
            流程检查
          </Typography.Title>
          <Typography.Text type="secondary">
            {result ? `检查时间：${formatTime(result.checkedAt)}` : '尚未检查'}
          </Typography.Text>
        </Space>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void load()}
        >
          刷新
        </Button>
      </div>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {(result?.issues ?? [])
        .filter((issue) => issue.code === 'scan_limit')
        .map((issue, index) => (
          <Alert
            // A result can contain more than one scan_limit warning for the
            // same scope. Include the source index so React always receives a
            // unique key while the scope remains visible to the user.
            key={`${issue.code}:${issue.scope}:${index}`}
            type="warning"
            showIcon
            message={issue.message}
            style={{ marginBottom: 16 }}
          />
        ))}
      {result && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          {[
            ['工作流', result.summary.workflows],
            ['请求数', result.summary.requests],
            ['错误', result.summary.errors],
            ['警告', result.summary.warnings],
          ].map(([title, value], index) => (
            <Col xs={12} lg={6} key={`${title}:${index}`}>
              <Card size="small">
                <Statistic title={title} value={value} />
              </Card>
            </Col>
          ))}
        </Row>
      )}
      <Tabs
        activeKey={scope}
        onChange={(value) => {
          setScope(value as typeof scope);
          setCode(undefined);
          setPage(1);
        }}
        items={[
          { key: 'definition', label: '定义' },
          { key: 'runtime', label: '运行时' },
        ]}
      />
      <Space wrap style={{ marginBottom: 20 }}>
        <Input.Search
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          allowClear
          placeholder="搜索问题详情、工作流名称、节点"
          style={{ width: 250 }}
        />
        <Select
          value={severity}
          allowClear
          placeholder="全部级别"
          style={{ width: 125 }}
          options={[
            { label: '错误', value: 'error' },
            { label: '警告', value: 'warning' },
          ]}
          onChange={(value) => {
            setSeverity(value);
            setPage(1);
          }}
        />
        <Select
          value={code}
          allowClear
          showSearch
          placeholder="全部类型"
          style={{ width: 240 }}
          options={issueTypes.map((value) => ({ label: checkupLabels[value] || value, value }))}
          onChange={(value) => {
            setCode(value);
            setPage(1);
          }}
        />
        {!workflowId && (
          <Select
            value={selectedWorkflow}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部工作流"
            style={{ width: 240 }}
            options={workflows.map((item) => ({
              value: item.id,
              label: `${item.name}（${item.code || item.id}）`,
            }))}
            onChange={(value) => {
              setSelectedWorkflow(value);
              setPage(1);
            }}
          />
        )}
      </Space>
      <Table<CheckupIssue>
        rowKey={(item) =>
          `${item.workflowId}:${item.scope}:${item.code}:${item.requestId ?? ''}:${item.stepId ?? ''}:${(result?.issues ?? []).indexOf(item)}`
        }
        dataSource={rows}
        loading={loading}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: rows.length,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
          onChange: setPage,
        }}
        locale={{ emptyText: result ? '暂无问题' : '暂无数据' }}
        columns={[
          {
            title: '级别',
            dataIndex: 'severity',
            width: 90,
            render: (value) => (
              <Tag color={value === 'error' ? 'error' : 'warning'}>
                {value === 'error' ? '错误' : '警告'}
              </Tag>
            ),
          },
          {
            title: '类型',
            dataIndex: 'code',
            width: 180,
            render: (value) => <span title={value}>{checkupLabels[value] || value}</span>,
          },
          { title: '工作流', dataIndex: 'workflowName', width: 160 },
          { title: '问题描述', dataIndex: 'message', width: 300 },
          { title: '数量', dataIndex: 'count', width: 90, render: (value) => value ?? '—' },
          {
            title: '操作',
            key: 'actions',
            fixed: 'right',
            width: 170,
            render: (_, issue) => (
              <Space size={0}>
                {issue.workflowId > 0 && (
                  <Button type="link" size="small" onClick={() => openWorkflow(issue.workflowId)}>
                    查看流程
                  </Button>
                )}
                {issue.requestId && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate(`/enterprise/collab?requestId=${issue.requestId}`)}
                  >
                    查看请求
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
export function CheckupPage() {
  const [params] = useSearchParams();
  const id = Number(params.get('workflowId'));
  return (
    <Card>
      <CheckupPanel
        key={id || 'all'}
        workflowId={Number.isSafeInteger(id) && id > 0 ? id : undefined}
      />
    </Card>
  );
}
export default CheckupPage;
