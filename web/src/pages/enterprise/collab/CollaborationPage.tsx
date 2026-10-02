import { ReceiptsPanel } from './receipts/ReceiptsPanel';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Space, Steps, Tabs, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { FormsPanel } from './FormsPanel';
import { WorkflowsPanel } from './WorkflowsPanel';
import { RequestsPanel } from './RequestsPanel';
import { RequestStartModal } from './RequestStartModal';
import { RequestDetailDrawer } from './RequestDetailDrawer';
import './collaboration.css';

export default function CollaborationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState('mine');
  const [starting, setStarting] = useState(false);
  const [detailId, setDetailId] = useState<number>();
  const [revision, setRevision] = useState(0);
  const linkedId = searchParams.get('requestId');
  useEffect(() => {
    if (linkedId && /^[1-9]\d*$/.test(linkedId) && Number.isSafeInteger(Number(linkedId)))
      setDetailId(Number(linkedId));
  }, [linkedId]);
  const refresh = () => setRevision((previous) => previous + 1);
  return (
    <div className="collaboration-page">
      <Card className="collab-intro">
        <div className="collab-toolbar">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              label
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              labelform、approvaltasklabelsavelabel。
            </Typography.Paragraph>
          </div>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setStarting(true)}>
              label
            </Button>
          </Space>
        </div>
        <Steps
          size="small"
          current={-1}
          items={[
            { title: 'releaseform', description: 'fieldmessage' },
            { title: 'configurationapproval', description: 'Message history' },
            { title: 'message=', description: 'message、message=' },
            { title: 'message=', description: 'versionapprovalmessage' },
          ]}
        />
      </Card>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'mine',
              label: 'message=',
              children: <RequestsPanel scope="mine" revision={revision} onOpen={setDetailId} />,
            },
            {
              key: 'pending',
              label: 'approval',
              children: <RequestsPanel scope="pending" revision={revision} onOpen={setDetailId} />,
            },
            {
              key: 'handled',
              label: 'message=',
              children: <RequestsPanel scope="handled" revision={revision} onOpen={setDetailId} />,
            },
            {
              key: 'unread',
              label: 'message=',
              children: <ReceiptsPanel scope="unread" revision={revision} onOpen={setDetailId} />,
            },
            {
              key: 'read',
              label: 'message=',
              children: <ReceiptsPanel scope="read" revision={revision} onOpen={setDetailId} />,
            },
            { key: 'forms', label: 'form', children: <FormsPanel /> },
            { key: 'workflows', label: 'approvalworkflow', children: <WorkflowsPanel /> },
          ]}
        />
      </Card>
      {starting && (
        <RequestStartModal
          onClose={() => setStarting(false)}
          onSubmitted={(id) => {
            setStarting(false);
            setTab('mine');
            refresh();
            setDetailId(id);
          }}
        />
      )}
      {detailId !== undefined && (
        <RequestDetailDrawer
          key={detailId}
          id={detailId}
          onClose={() => {
            setDetailId(undefined);
            if (linkedId) {
              const next = new URLSearchParams(searchParams);
              next.delete('requestId');
              setSearchParams(next, { replace: true });
            }
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
