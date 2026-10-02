import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { delegationsApi } from './delegations/api';
import { delegationInput, delegationStates, validateDelegation } from './delegations/model';
import type { Delegation, DelegationCandidates } from './delegations/types';

interface FormValues {
  delegateId: number;
  workflowId: number;
  period: [Dayjs, Dayjs];
  enabled: boolean;
}
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const timeText = (value: string) =>
  dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '';
export default function DelegationsPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [records, setRecords] = useState<Delegation[]>([]);
  const [candidates, setCandidates] = useState<DelegationCandidates>();
  const [loading, setLoading] = useState(true);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [candidateError, setCandidateError] = useState('');
  const [editing, setEditing] = useState<Delegation | null>();
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState('');
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm<FormValues>();
  const alive = useRef(true);
  const listSequence = useRef(0);
  const candidateSequence = useRef(0);
  const mutation = useRef(false);
  const latest = editing ? records.find((row) => row.id === editing.id) : undefined;
  const staleEditing =
    !!editing && !loading && !loadError && (!latest || latest.revision !== editing.revision);
  const load = async () => {
    const sequence = ++listSequence.current;
    setLoading(true);
    try {
      const result = await delegationsApi.list();
      if (!result || !Array.isArray(result.list)) throw new Error('列表响应错误，请重试');
      if (alive.current && sequence === listSequence.current) {
        setRecords(result.list);
        setLoadError('');
      }
    } catch (e) {
      if (alive.current && sequence === listSequence.current)
        setLoadError(errorText(e, '请求失败'));
    } finally {
      if (alive.current && sequence === listSequence.current) setLoading(false);
    }
  };
  const loadCandidates = async () => {
    const sequence = ++candidateSequence.current;
    setCandidateLoading(true);
    try {
      const result = await delegationsApi.candidates();
      if (!result || !Array.isArray(result.users) || !Array.isArray(result.workflows))
        throw new Error('响应错误，请重试');
      if (alive.current && sequence === candidateSequence.current) {
        setCandidates(result);
        setCandidateError('');
      }
      return result;
    } catch (e) {
      if (alive.current && sequence === candidateSequence.current) {
        setCandidates(undefined);
        setCandidateError(errorText(e, '工作流请求失败'));
      }
      return undefined;
    } finally {
      if (alive.current && sequence === candidateSequence.current) setCandidateLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    void loadCandidates();
    return () => {
      alive.current = false;
      listSequence.current++;
      candidateSequence.current++;
    };
  }, []);
  const edit = (row?: Delegation) => {
    setSaveError('');
    form.resetFields();
    const start = dayjs().millisecond(0);
    form.setFieldsValue({
      delegateId: row?.delegateId,
      workflowId: row?.workflowId ?? 0,
      period: row ? [dayjs(row.startsAt), dayjs(row.endsAt)] : [start, start.add(7, 'day')],
      enabled: row?.enabled ?? true,
    });
    setEditing(row ?? null);
    void loadCandidates();
  };
  const save = async () => {
    if (mutation.current || editing === undefined || staleEditing) return;
    mutation.current = true;
    setBusy('save');
    setSaveError('');
    try {
      const values = await form.validateFields();
      if (!alive.current) return;
      const currentCandidates = await loadCandidates();
      if (!alive.current) return;
      if (!currentCandidates) throw new Error('工作流验证失败，请刷新后重试');
      const input = delegationInput({
        delegateId: values.delegateId,
        workflowId: values.workflowId,
        startsAt: values.period[0].toISOString(),
        endsAt: values.period[1].toISOString(),
        enabled: values.enabled,
        revision: editing?.revision ?? 0,
      });
      validateDelegation(input, records, currentCandidates, editing?.id);
      if (editing) await delegationsApi.update(editing.id, input);
      else await delegationsApi.create(input);
      if (!alive.current) return;
      message.success('保存成功');
      setEditing(undefined);
      await load();
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      if (alive.current) {
        setSaveError(errorText(e, '保存失败'));
        await load();
      }
    } finally {
      mutation.current = false;
      if (alive.current) setBusy('');
    }
  };
  const toggle = async (row: Delegation, enabled: boolean) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(`toggle:${row.id}`);
    try {
      const currentCandidates = enabled ? await loadCandidates() : candidates;
      if (!alive.current) return;
      const input = delegationInput({ ...row, enabled });
      validateDelegation(input, records, currentCandidates, row.id);
      await delegationsApi.update(row.id, input);
      if (!alive.current) return;
      message.success(
        enabled ? '已启用委托任务' : '已禁用委托任务',
      );
    } catch (e) {
      if (alive.current) message.error(errorText(e, '更新请求失败'));
    } finally {
      mutation.current = false;
      if (alive.current) {
        setBusy('');
        await load();
      }
    }
  };
  const remove = async (row: Delegation) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(`delete:${row.id}`);
    try {
      await delegationsApi.remove(row.id, row.revision);
      if (alive.current) message.success('删除成功');
    } catch (e) {
      if (alive.current) message.error(errorText(e, '删除请求失败'));
    } finally {
      mutation.current = false;
      if (alive.current) {
        setBusy('');
        await load();
      }
    }
  };
  const users = (candidates?.users ?? []).map((user) => ({ value: user.id, label: user.name }));
  if (editing && !users.some((user) => user.value === editing.delegateId))
    users.push({
      value: editing.delegateId,
      label: `${editing.delegateName || `user #${editing.delegateId}`}（已失效）`,
    });
  const workflows = [
    { value: 0, label: '全部工作流' },
    ...(candidates?.workflows ?? []).map((workflow) => ({
      value: workflow.id,
      label: `${workflow.name}（${workflow.code}）`,
    })),
  ];
  if (editing && !workflows.some((workflow) => workflow.value === editing.workflowId))
    workflows.push({
      value: editing.workflowId,
      label: `${editing.workflowName || `workflow #${editing.workflowId}`}（已失效）`,
    });
  const unavailable =
    !!editing &&
    !!candidates &&
    (!candidates.users.some((user) => user.id === editing.delegateId) ||
      (editing.workflowId !== 0 &&
        !candidates.workflows.some((workflow) => workflow.id === editing.workflowId)));
  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/flowCenter/todo')}>
              返回
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              委托管理
            </Typography.Title>
          </Space>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              disabled={!!busy}
              onClick={() => {
                void load();
                void loadCandidates();
              }}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!!busy || loading || !!loadError}
              onClick={() => edit()}
            >
              创建委托
            </Button>
          </Space>
        </Space>
        <Alert
          type="info"
          showIcon
          message="管理详情：委托时间范围内的任务执行状态、权限分配情况。"
          description="委托启用期间，任务自动按配置执行。详情、审批流说明。全部委托详情、审批详情。"
        />
        {loadError && (
          <Alert
            type="error"
            showIcon
            message={loadError}
            description="列表加载失败，请重试。刷新后可编辑详情。"
            action={<Button onClick={() => void load()}>重试</Button>}
          />
        )}
        {candidateError && (
          <Alert
            type="warning"
            showIcon
            message={`Failed to load data：${candidateError}`}
            action={
              <Button loading={candidateLoading} onClick={() => void loadCandidates()}>
                刷新
              </Button>
            }
          />
        )}
        {candidates && !candidates.users.length && (
          <Alert
            type="warning"
            showIcon
            message="审批详情。用户需启用审批权限。"
          />
        )}
        <Input.Search
          allowClear
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索工作流..."
          style={{ maxWidth: 340 }}
        />
        <Table<Delegation>
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          dataSource={records.filter((row) =>
            `${row.delegateName} ${row.workflowName} ${row.workflowId === 0 ? '全部工作流' : ''}`
              .toLowerCase()
              .includes(keyword.trim().toLowerCase()),
          )}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          columns={[
            {
              title: '代理人',
              dataIndex: 'delegateName',
              render: (name: string, row) => name || `user #${row.delegateId}`,
            },
            {
              title: '工作流',
              dataIndex: 'workflowName',
              render: (name: string, row) =>
                row.workflowId === 0 ? '全部工作流' : name || `workflow #${row.workflowId}`,
            },
            { title: '开始时间', dataIndex: 'startsAt', width: 180, render: timeText },
            { title: '结束时间', dataIndex: 'endsAt', width: 180, render: timeText },
            {
              title: '状态',
              dataIndex: 'state',
              width: 100,
              render: (state: Delegation['state']) => (
                <Tag color={delegationStates[state]?.color}>
                  {delegationStates[state]?.label || state}
                </Tag>
              ),
            },
            {
              title: '启用',
              width: 90,
              render: (_, row) => (
                <Switch
                  aria-label={`${row.delegateName}启用`}
                  checked={row.enabled}
                  loading={busy === `toggle:${row.id}`}
                  disabled={!!busy || loading || !!loadError}
                  onChange={(enabled) => void toggle(row, enabled)}
                />
              ),
            },
            {
              title: '操作',
              width: 155,
              render: (_, row) => (
                <Space>
                  <Button
                    type="link"
                    disabled={!!busy || loading || !!loadError}
                    onClick={() => edit(row)}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除？"
                    description="任务详情。"
                    okText="删除"
                    cancelText="取消"
                    disabled={!!busy || loading || !!loadError}
                    onConfirm={() => remove(row)}
                  >
                    <Button
                      type="link"
                      danger
                      disabled={!!busy || loading || !!loadError}
                      loading={busy === `delete:${row.id}`}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        <Typography.Text type="secondary">
          时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}
          ）。状态、刷新时间。
        </Typography.Text>
      </Space>
      <Modal
        open={editing !== undefined}
        title={editing ? '编辑委托' : '创建委托'}
        onCancel={() => {
          if (!mutation.current) setEditing(undefined);
        }}
        onOk={() => void save()}
        okText="保存"
        confirmLoading={busy === 'save'}
        okButtonProps={{
          disabled: staleEditing || !!loadError || loading || candidateLoading || !!candidateError,
        }}
        cancelButtonProps={{ disabled: !!busy }}
        closable={!busy}
        maskClosable={false}
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Alert type="info" message="保存、删除任务。" />
          {saveError && <Alert type="error" showIcon message={saveError} />}
          {staleEditing && (
            <Alert
              type="warning"
              showIcon
              message={
                latest
                  ? '编辑中，任务已变更。请重新加载后编辑。'
                  : '删除中，任务已变更。请重新加载。'
              }
              action={latest && <Button onClick={() => edit(latest)}>恢复</Button>}
            />
          )}
          {candidateError && (
            <Alert
              type="warning"
              message={candidateError}
              action={
                <Button onClick={() => void loadCandidates()} loading={candidateLoading}>
                  刷新
                </Button>
              }
            />
          )}
          {unavailable && (
            <Alert
              type="warning"
              message="工作流详情。请选择；列表已禁用详情。"
            />
          )}
        </Space>
        <Form form={form} layout="vertical" disabled={!!busy}>
          <Form.Item
            name="delegateId"
            label="代理人"
            rules={[{ required: true, message: '请选择代理人' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={candidateLoading}
              options={users.map((user) => ({
                ...user,
                disabled: !candidates?.users.some((candidate) => candidate.id === user.value),
              }))}
              placeholder="请选择代理人"
            />
          </Form.Item>
          <Form.Item
            name="workflowId"
            label="工作流"
            rules={[{ required: true, message: '请选择工作流' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={candidateLoading}
              options={workflows.map((workflow) => ({
                ...workflow,
                disabled:
                  workflow.value !== 0 &&
                  !candidates?.workflows.some((candidate) => candidate.id === workflow.value),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="period"
            label="有效期"
            rules={[
              { required: true, message: '请选择有效期' },
              {
                validator: (_, value: [Dayjs, Dayjs] | undefined) =>
                  value?.length === 2 && value.every((date) => date?.isValid())
                    ? Promise.resolve()
                    : Promise.reject(new Error('请选择有效期')),
              },
            ]}
          >
            <DatePicker.RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
