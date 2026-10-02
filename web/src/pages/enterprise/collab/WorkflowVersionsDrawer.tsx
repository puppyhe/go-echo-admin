import { assigneeLabel } from './assigneeModel';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Modal,
  Popconfirm,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { collabApi } from './api';
import { formatTime } from './shared';
import { operatorLabels } from './model';
import type { Workflow, WorkflowVersion } from './types';
import { GraphSnapshotView } from './graph/GraphSnapshotView';

export function WorkflowVersionsDrawer({
  workflow,
  onClose,
  onRestored,
}: {
  workflow: Workflow;
  onClose: () => void;
  onRestored: (value: Workflow) => void;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<WorkflowVersion | null>(null);
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const data = await collabApi.workflowVersions(workflow.id);
      if (current === serial.current) setRows(data.list ?? []);
    } catch (e) {
      if (current === serial.current)
        setError(e instanceof Error ? e.message : 'Unable to load versions');
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [workflow.id]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  const inspect = async (row: WorkflowVersion) => {
    setBusy(true);
    try {
      setSnapshot(await collabApi.workflowVersion(workflow.id, row.version));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  const restore = async (row: WorkflowVersion) => {
    setBusy(true);
    setError('');
    try {
      const saved = await collabApi.restoreWorkflow(workflow.id, row.version, workflow.revision);
      message.success(`message v${row.version} message`);
      onRestored(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={`workflowversion · ${workflow.name}`}
      width="min(1080px, 100vw)"
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
      extra={
        <Button
          icon={<ReloadOutlined />}
          disabled={busy}
          loading={loading}
          onClick={() => void load()}
        >
          refresh
        </Button>
      }
      getContainer={() => document.body}
    >
      <Alert
        type="info"
        showIcon
        message="Published versions are immutable. Restore a version to create a new draft."
        style={{ marginBottom: 16 }}
      />
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          description="Review the version metadata and workflow definition."
          style={{ marginBottom: 16 }}
        />
      )}
      <Table<WorkflowVersion>
        rowKey="id"
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: 930 }}
        columns={[
          { title: 'Version', dataIndex: 'version', width: 80, render: (value) => `v${value}` },
          {
            title: 'status',
            dataIndex: 'status',
            width: 110,
            render: (value) => (
              <Tag color={value === 'published' ? 'success' : 'default'}>
                {value === 'published' ? 'Published' : 'Draft'}
              </Tag>
            ),
          },
          {
            title: 'Checksum',
            dataIndex: 'checksum',
            width: 180,
            render: (value) => (
              <Typography.Text code copyable={{ text: value }} title={value}>
                {value?.slice(0, 16) || '—'}
              </Typography.Text>
            ),
          },
          { title: 'Created', dataIndex: 'createdAt', width: 180, render: formatTime },
          { title: 'Instances', dataIndex: 'instanceCount', width: 90 },
          { title: 'Pending', dataIndex: 'pendingCount', width: 70 },
          { title: 'Note', dataIndex: 'note', width: 150, ellipsis: true },
          {
            title: 'Actions',
            key: 'actions',
            fixed: 'right',
            width: 210,
            render: (_, row) => (
              <Space size={0}>
                <Button type="link" disabled={busy} onClick={() => void inspect(row)}>
                  Inspect
                </Button>
                <Popconfirm
                  title={`Restore version v${row.version}?`}
                  description="This creates a new draft from the selected version."
                  onConfirm={() => restore(row)}
                >
                  <Button type="link" disabled={busy}>
                    Restore
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={`Version v${snapshot?.version ?? ''}`}
        width={850}
        open={Boolean(snapshot)}
        onCancel={() => setSnapshot(null)}
        footer={<Button onClick={() => setSnapshot(null)}>Close</Button>}
      >
        {snapshot && (
          <>
            <Descriptions
              bordered
              size="small"
              column={2}
              items={[
                { label: 'Workflow name', children: snapshot.definition.name },
                { label: 'Code', children: snapshot.definition.code },
                { label: 'Category', children: snapshot.definition.category || '—' },
                { label: 'form ID', children: snapshot.definition.formId },
                { label: 'Published by', children: snapshot.publishedBy },
                { label: 'Published at', children: formatTime(snapshot.createdAt) },
                {
                  label: 'role',
                  children: (snapshot.definition.sharedRoleIds ?? []).join(', ') || 'None',
                  span: 2,
                },
                {
                  label: 'Checksum',
                  children: (
                    <Typography.Text code copyable style={{ wordBreak: 'break-all' }}>
                      {snapshot.checksum}
                    </Typography.Text>
                  ),
                  span: 2,
                },
                { label: 'description', children: snapshot.definition.description || '—', span: 2 },
                {
                  label: 'Approval object',
                  children:
                    snapshot.definition.businessType || `form #${snapshot.definition.formId}`,
                  span: 2,
                },
              ]}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              Review versions, compare permissions, and inspect the workflow definition.
            </Typography.Paragraph>
            {snapshot.definition.graph ? (
              <GraphSnapshotView graph={snapshot.definition.graph} />
            ) : (
              <Steps
                direction="vertical"
                size="small"
                items={snapshot.definition.steps.map((step) => ({
                  title: step.name,
                  description: (
                    <>
                      <div>
                        {step.mode === 'all' ? 'All approvers' : 'Any approver'} ·{' '}
                        {assigneeLabel(step)}
                      </div>
                      {step.condition && (
                        <div>
                          Condition: {step.condition.field}{' '}
                          {operatorLabels[step.condition.operator]}{' '}
                          {JSON.stringify(step.condition.value)}
                        </div>
                      )}
                    </>
                  ),
                }))}
              />
            )}
          </>
        )}
      </Modal>
    </Drawer>
  );
}
