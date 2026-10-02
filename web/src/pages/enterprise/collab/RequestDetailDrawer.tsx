import { assigneeLabel } from './assigneeModel';
import { ReceiptDetails } from './receipts/ReceiptDetails';
import { unreadOwnReceipts } from './receipts/model';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UrgencyTag } from './RequestFilters';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Steps,
  Table,
  Tabs,
  Timeline,
  Typography,
} from 'antd';
import { session } from '../../../api/request';
import { collabApi } from './api';
import { operatorLabels } from './model';
import { FormValueView } from '../../systemTools/formRuntime';
import { formatTime, LoadError, StatusTag } from './shared';
import type { ApprovalTask, RequestDetail } from './types';
import { GraphSnapshotView } from './graph/GraphSnapshotView';

const eventLabels: Record<string, string> = {
  cc_created: '已抄送',
  cc_skipped: '跳过抄送',
  graph_started: '流程开始',
  graph_completed: '流程完成',
  graph_failed: '流程失败',
  graph_pending: '等待审批',
  graph_skipped: '已跳过',
  graph_waiting: '等待中',
  graph_cancelled: '已取消',
  delegated: '委托处理',
  reminded: '已催办',
  timeout_reminded: '超时催办',
  submitted: '已提交',
  submit: '已提交',
  approved: '审批通过',
  approve: '审批通过',
  rejected: '已驳回',
  reject: '已驳回',
  withdrawn: '已撤回',
  withdraw: '已撤回',
  skipped: '已跳过',
  step_skipped: '已跳过',
  step_started: '开始审批',
  completed: '审批完成',
};
export function RequestDetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { message } = App.useApp();
  const [detail, setDetail] = useState<RequestDetail>();
  const [previous, setPrevious] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<{ task: ApprovalTask; action: 'approve' | 'reject' }>();
  const [form] = Form.useForm<{ comment: string }>();
  const sequence = useRef(0);
  const userId = session.getSnapshot()?.ID;
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const result = await collabApi.detail(id);
      if (current === sequence.current) setDetail(result);
    } catch (error) {
      if (current !== sequence.current) return;
      setDetail(undefined);
      setError(error instanceof Error ? error.message : '请求失败');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    setPrevious(undefined);
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  const decide = async () => {
    if (!decision) return;
    try {
      const values = await form.validateFields();
      setBusy(true);
      await collabApi.decide(decision.task.id, decision.action, values.comment ?? '');
      message.success(decision.action === 'approve' ? '审批已通过' : '已驳回');
      setDecision(undefined);
      onChanged();
      await load();
    } catch (error) {
      if (error instanceof Error && error.name === 'ApiError') {
        setDecision(undefined);
        onChanged();
        await load();
      }
    } finally {
      setBusy(false);
    }
  };
  const currentTasks =
    detail?.status === 'pending'
      ? detail.tasks.filter((task) => task.status === 'pending' && task.approverId === userId)
      : [];
  return (
    <>
      <Drawer
        open
        title={detail?.title ?? '详情'}
        width="min(1050px, 96vw)"
        onClose={onClose}
        extra={
          <Button onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        }
        getContainer={() => document.body}
      >
        <LoadError error={error} retry={load} />
        <Spin spinning={loading}>
          {detail && (
            <>
              <Descriptions
                bordered
                size="small"
                column={{ xs: 1, sm: 2 }}
                items={[
                  { key: 'number', label: '单号', children: detail.number ?? `#${detail.id}` },
                  { key: 'business', label: '业务标识', children: detail.businessKey || '—' },
                  ...(detail.businessType
                    ? [
                        {
                          key: 'businessRecord',
                          label: '业务记录',
                          children: `${detail.businessType} / ${detail.businessId ?? '—'} · v${detail.businessVersion ?? 0}`,
                        },
                      ]
                    : []),
                  ...(detail.previousRequestId
                    ? [
                        {
                          key: 'previous',
                          label: '关联申请',
                          children: (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => setPrevious(detail.previousRequestId)}
                            >
                              查看 #${detail.previousRequestId}
                            </Button>
                          ),
                        },
                      ]
                    : []),
                  {
                    key: 'urgency',
                    label: '紧急程度',
                    children: <UrgencyTag value={detail.urgency} />,
                  },
                  { key: 'status', label: '状态', children: <StatusTag status={detail.status} /> },
                  {
                    key: 'form',
                    label: '表单版本',
                    children: detail.businessType
                      ? `${detail.formSnapshot?.title || detail.businessType} · 快照`
                      : `${detail.formName} · v${detail.formVersion}`,
                  },
                  { key: 'workflow', label: '工作流', children: detail.workflowName },
                  { key: 'owner', label: '发起人', children: `user #${detail.ownerId}` },
                  { key: 'created', label: '创建时间', children: formatTime(detail.createdAt) },
                ]}
              />
              {detail.status === 'pending' && detail.ownerId === userId && (
                <div className="collab-action-bar">
                  <Button
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const result = await collabApi.remind(id);
                        message.success(`已催办 ${result.count} 个任务`);
                        await load();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    催办
                  </Button>
                  <Popconfirm
                    title="确认撤回？"
                    description="撤回后申请将被取消，审批记录保留。"
                    onConfirm={async () => {
                      await collabApi.withdraw(id);
                      message.success('保存成功');
                      onChanged();
                      await load();
                    }}
                  >
                    <Button danger>撤回</Button>
                  </Popconfirm>
                </div>
              )}
              {!!currentTasks?.length && (
                <Alert
                  style={{ marginTop: 16 }}
                  type="info"
                  showIcon
                  message="待审批任务"
                  description={currentTasks.map((task) => (
                    <div key={task.id} className="collab-action-bar">
                      <Typography.Text>{task.stepName}</Typography.Text>
                      <Space>
                        <Button
                          type="primary"
                          onClick={() => {
                            form.resetFields();
                            setDecision({ task, action: 'approve' });
                          }}
                        >
                          通过
                        </Button>
                        <Button
                          danger
                          onClick={() => {
                            form.resetFields();
                            setDecision({ task, action: 'reject' });
                          }}
                        >
                          驳回
                        </Button>
                      </Space>
                    </div>
                  ))}
                />
              )}
              {unreadOwnReceipts(detail.receipts, userId ?? 0).length > 0 && (
                <Alert
                  style={{ marginTop: 16 }}
                  type="info"
                  showIcon
                  message="您有未读回执，请在“回执”标签页查看。"
                />
              )}
              <Tabs
                items={[
                  {
                    key: 'data',
                    label: '申请数据',
                    children: (
                      <>
                        <Typography.Paragraph type="secondary">
                          以下为申请提交时的表单内容。
                        </Typography.Paragraph>
                        <FormValueView
                          fields={detail.formSnapshot?.fields ?? []}
                          data={detail.data ?? {}}
                        />
                      </>
                    ),
                  },
                  {
                    key: 'steps',
                    label: '流程步骤',
                    children: (
                      <>
                        {detail.graphSnapshot ? (
                          <GraphSnapshotView
                            graph={detail.graphSnapshot}
                            nodeRuns={detail.nodeRuns}
                            edgeRuns={detail.edgeRuns}
                          />
                        ) : (
                          <Steps
                            direction="vertical"
                            current={
                              detail.currentStep < 0
                                ? detail.workflowSnapshot.length
                                : detail.currentStep
                            }
                            status={detail.status === 'rejected' ? 'error' : 'process'}
                            items={detail.workflowSnapshot.map((step, index) => {
                              const tasks = detail.tasks.filter((task) => task.stepIndex === index);
                              const skipped = detail.events.some(
                                (event) =>
                                  event.type === 'step_skipped' && event.stepIndex === index,
                              );
                              const stepStatus: 'finish' | 'error' | 'process' | 'wait' =
                                tasks.some((task) => task.status === 'rejected')
                                  ? 'error'
                                  : tasks.some((task) => task.status === 'pending')
                                    ? 'process'
                                    : tasks.some((task) => task.status === 'approved') || skipped
                                      ? 'finish'
                                      : 'wait';
                              return {
                                title: `${step.name}${skipped ? '（已跳过）' : ''}`,
                                status: stepStatus,
                                description: (
                                  <>
                                    <div>
                                      {step.mode === 'all' ? '会签' : '或签'} ·{' '}
                                      {assigneeLabel(step)}
                                    </div>
                                    {step.condition && (
                                      <div className="collab-muted">
                                        条件：
                                        {detail.formSnapshot.fields.find(
                                          (field) => field.name === step.condition?.field,
                                        )?.label ?? step.condition.field}{' '}
                                        {operatorLabels[step.condition.operator]}{' '}
                                        {String(step.condition.value)}
                                      </div>
                                    )}
                                    <Space wrap>
                                      {tasks.length ? (
                                        tasks.map((task) => (
                                          <span key={task.id}>
                                            #{task.approverId} <StatusTag status={task.status} />
                                          </span>
                                        ))
                                      ) : (
                                        <Typography.Text type="secondary">
                                          暂无审批任务
                                        </Typography.Text>
                                      )}
                                    </Space>
                                  </>
                                ),
                              };
                            })}
                          />
                        )}
                        <Table
                          size="small"
                          rowKey="id"
                          pagination={false}
                          dataSource={detail.tasks}
                          style={{ marginTop: 24 }}
                          scroll={{ x: 650 }}
                          columns={[
                            { title: '节点', dataIndex: 'stepName' },
                            {
                              title: '审批人',
                              dataIndex: 'approverId',
                              render: (id, task) => (
                                <div>
                                  #{id}
                                  {task.sources
                                    ?.filter((x) => x.delegationId > 0)
                                    .map((x) => (
                                      <div className="collab-muted" key={x.userId}>
                                        由 #${x.userId} 委托 · 委托单 #${x.delegationId}
                                      </div>
                                    ))}
                                </div>
                              ),
                            },
                            {
                              title: '状态',
                              dataIndex: 'status',
                              render: (status) => <StatusTag status={status} />,
                            },
                            { title: '截止时间', dataIndex: 'dueAt', render: formatTime },
                            { title: '最近催办', dataIndex: 'lastRemindedAt', render: formatTime },
                            { title: '审批意见', dataIndex: 'comment' },
                            { title: '处理时间', dataIndex: 'actedAt', render: formatTime },
                          ]}
                        />
                      </>
                    ),
                  },
                  {
                    key: 'receipts',
                    label: `回执${unreadOwnReceipts(detail.receipts, userId ?? 0).length ? ` （未读 ${unreadOwnReceipts(detail.receipts, userId ?? 0).length} 条）` : ''}`,
                    children: (
                      <ReceiptDetails
                        receipts={detail.receipts ?? []}
                        userId={userId ?? 0}
                        onRead={async () => {
                          onChanged();
                          await load();
                        }}
                      />
                    ),
                  },
                  {
                    key: 'history',
                    label: '流转历史',
                    children: detail.events.length ? (
                      <Timeline
                        items={detail.events.map((event) => ({
                          children: (
                            <>
                              <Space wrap>
                                <Typography.Text strong>
                                  {eventLabels[event.type] ?? event.type}
                                </Typography.Text>
                                <Typography.Text type="secondary">
                                  {event.actorId ? `user #${event.actorId}` : '系统'} ·{' '}
                                  {formatTime(event.createdAt)}
                                </Typography.Text>
                              </Space>
                              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                                {event.message}
                              </Typography.Paragraph>
                            </>
                          ),
                        }))}
                      />
                    ) : (
                      <Empty description="暂无数据" />
                    ),
                  },
                ]}
              />
            </>
          )}
        </Spin>
      </Drawer>
      <Modal
        title={decision?.action === 'reject' ? '驳回审批' : '通过审批'}
        open={!!decision}
        confirmLoading={busy}
        onOk={() => void decide()}
        onCancel={() => {
          if (!busy) setDecision(undefined);
        }}
        okText={decision?.action === 'reject' ? '驳回' : '通过'}
        okButtonProps={{ danger: decision?.action === 'reject' }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="comment"
            label="审批意见"
            rules={
              decision?.action === 'reject'
                ? [{ required: true, whitespace: true, message: '请填写驳回原因' }]
                : []
            }
          >
            <Input.TextArea
              rows={4}
              maxLength={2000}
              showCount
              placeholder={decision?.action === 'reject' ? '请填写驳回原因' : '请输入审批意见'}
            />
          </Form.Item>
        </Form>
      </Modal>
      {previous && (
        <RequestDetailDrawer
          id={previous}
          onClose={() => setPrevious(undefined)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
