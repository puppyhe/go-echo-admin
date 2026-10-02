import { ReceiptsPanel } from './collab/receipts/ReceiptsPanel';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Empty,
  Input,
  Radio,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { useAuth } from '../../auth/context';
import { FormsPanel } from './collab/FormsPanel';
import { WorkflowsPanel } from './collab/WorkflowsPanel';
import { RequestsPanel } from './collab/RequestsPanel';
import { RequestDetailDrawer } from './collab/RequestDetailDrawer';
import { RequestStartModal } from './collab/RequestStartModal';
import { allPages, collabApi } from './collab/api';
import { LoadError } from './collab/shared';
import type { RequestScope, Workflow } from './collab/types';
import './collab/collaboration.css';

export const FormsCenterPage = () => (
  <Card>
    <FormsPanel />
  </Card>
);
export const WorkflowsCenterPage = () => (
  <Card>
    <WorkflowsPanel />
  </Card>
);

function RequestCenter({ instances = false }: { instances?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scope, setScope] = useState<RequestScope | 'unread' | 'read'>(
    instances ? 'mine' : 'pending',
  );
  const [detail, setDetail] = useState<number>();
  const [revision, setRevision] = useState(0);
  return (
    <>
      <Card>
        {instances && user?.authorityId === 888 ? (
          <Radio.Group
            style={{ marginBottom: 20 }}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            options={[
              { label: '我的流程', value: 'mine' },
              { label: '全部流程', value: 'all' },
            ]}
            optionType="button"
          />
        ) : null}
        {instances ? (
          <RequestsPanel scope={scope as RequestScope} revision={revision} onOpen={setDetail} />
        ) : (
          <Tabs
            activeKey={scope}
            tabBarExtraContent={
              <Button onClick={() => navigate('/flowCenter/delegations')}>委托管理</Button>
            }
            onChange={(value) => setScope(value as RequestScope | 'unread' | 'read')}
            items={[
              {
                key: 'pending',
                label: '待办',
                children: <RequestsPanel scope="pending" revision={revision} onOpen={setDetail} />,
              },
              {
                key: 'unread',
                label: '未读',
                children: <ReceiptsPanel scope="unread" revision={revision} onOpen={setDetail} />,
              },
              {
                key: 'read',
                label: '已读',
                children: <ReceiptsPanel scope="read" revision={revision} onOpen={setDetail} />,
              },
              {
                key: 'handled',
                label: '已办',
                children: <RequestsPanel scope="handled" revision={revision} onOpen={setDetail} />,
              },
              {
                key: 'mine',
                label: '我发起的',
                children: <RequestsPanel scope="mine" revision={revision} onOpen={setDetail} />,
              },
            ]}
          />
        )}
      </Card>
      {detail !== undefined && (
        <RequestDetailDrawer
          key={detail}
          id={detail}
          onClose={() => setDetail(undefined)}
          onChanged={() => setRevision((v) => v + 1)}
        />
      )}
    </>
  );
}
export const TasksCenterPage = () => <RequestCenter />;
export const InstancesCenterPage = () => <RequestCenter instances />;

export function StartCenterPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<number>();
  const [detail, setDetail] = useState<number>();
  const serial = useRef(0);
  const load = async () => {
    const seq = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const rows = await allPages((q) => collabApi.workflows({ ...q, status: 'published' }));
      if (seq === serial.current) setWorkflows(rows);
    } catch (e) {
      if (seq === serial.current) setError(e instanceof Error ? e.message : '流程加载失败');
    } finally {
      if (seq === serial.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, []);
  const filtered = workflows.filter((w) =>
    `${w.name} ${w.description}`.toLowerCase().includes(keyword.toLowerCase()),
  );
  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            placeholder="名称/描述"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 320, maxWidth: '100%' }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
      </Card>
      <Card title="流程" extra={<Tag>{filtered.length} 个流程</Tag>}>
        <Typography.Paragraph type="secondary">
          请选择已发布的流程，填写表单并提交。
        </Typography.Paragraph>
        <LoadError error={error} retry={load} />
        <Spin spinning={loading}>
          {!loading && !error && !filtered.length ? (
            <Empty description="暂无已发布的流程" />
          ) : (
            <Row gutter={[16, 16]}>
              {filtered.map((w) => (
                <Col xs={24} md={12} xl={8} key={w.id}>
                  <Card
                    size="small"
                    title={w.name}
                    actions={[
                      <Button
                        key="start"
                        type="link"
                        icon={<SendOutlined />}
                        onClick={() => setStarting(w.id)}
                      >
                        发起流程
                      </Button>,
                    ]}
                  >
                    <Typography.Paragraph type="secondary" style={{ minHeight: 44 }}>
                      {w.description || '暂无说明。'}
                    </Typography.Paragraph>
                    <Tag>{w.steps.length} 个审批节点</Tag>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>
      </Card>
      {starting !== undefined && (
        <RequestStartModal
          initialWorkflowId={starting}
          onClose={() => setStarting(undefined)}
          onSubmitted={(id) => {
            setStarting(undefined);
            setDetail(id);
          }}
        />
      )}
      {detail !== undefined && (
        <RequestDetailDrawer
          key={detail}
          id={detail}
          onClose={() => setDetail(undefined)}
          onChanged={() => {}}
        />
      )}
    </>
  );
}
