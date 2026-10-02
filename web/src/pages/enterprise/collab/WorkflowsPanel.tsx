import { AssigneeEditor } from './AssigneeEditor';
import { assigneeLabel } from './assigneeModel';
import CCUserSelect from './receipts/CCUserSelect';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Tag,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Switch,
  Table,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { allPages, collabApi } from './api';
import { allowedOperators, operatorLabels, prepareSteps } from './model';
import { draftVersionLabel, persistWorkflow, workflowDraft } from './workflowModel';
import { WorkflowVersionsDrawer } from './WorkflowVersionsDrawer';
import { CheckupPanel } from './CheckupPage';
import { GraphDesigner } from './graph/GraphDesigner';
import { prepareGraph, sequenceToGraph } from './graph/graphModel';
import { conditionFields } from '../../systemTools/formDesign';
import { canManage, formatTime, LoadError, SharedRoles, usePagedList } from './shared';
import type {
  BusinessForm,
  BusinessTypeChoice,
  ListQuery,
  UserChoice,
  Workflow,
  WorkflowInput,
  WorkflowStep,
  WorkflowCheckup,
  WorkflowGraph,
} from './types';

const newStep = (): WorkflowStep => ({
  id: crypto.randomUUID(),
  name: 'approvalnode',
  approverIds: [],
  mode: 'any',
});
export function WorkflowsPanel() {
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<Pick<ListQuery, 'category' | 'enabled' | 'status'>>({});
  const loader = useCallback(
    (query: ListQuery) => collabApi.workflows({ ...query, ...filters }),
    [filters],
  );
  const list = usePagedList(loader);
  const reloadRef = useRef(list.reload);
  useEffect(() => {
    reloadRef.current = list.reload;
  }, [list.reload]);
  const [filterForm] = Form.useForm();
  const [versions, setVersions] = useState<Workflow>();
  const [checking, setChecking] = useState<Workflow>();
  const [granting, setGranting] = useState<Workflow>();
  const [grantRoles, setGrantRoles] = useState<number[]>([]);
  const [grantError, setGrantError] = useState('');
  const [publishing, setPublishing] = useState<Workflow>();
  const [publishNote, setPublishNote] = useState('');
  const [publishError, setPublishError] = useState('');
  const [rowBusy, setRowBusy] = useState<number[]>([]);
  const [health, setHealth] = useState<WorkflowCheckup | null>(null);
  const healthSerial = useRef(0);
  const editSerial = useRef(0);
  const { message } = App.useApp();
  const [editing, setEditing] = useState<Workflow | null>();
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [executionMode, setExecutionMode] = useState<'sequence' | 'graph'>('sequence');
  const [graph, setGraph] = useState<WorkflowGraph>(() => sequenceToGraph([]));
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeChoice[]>([]);
  const [forms, setForms] = useState<BusinessForm[]>([]);
  const [publishedForms, setPublishedForms] = useState<BusinessForm[]>([]);
  const [users, setUsers] = useState<UserChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [form] = Form.useForm<Omit<WorkflowInput, 'steps' | 'status'>>();
  useEffect(() => {
    const current = ++healthSerial.current;
    void collabApi
      .checkup(undefined, true)
      .then((result) => {
        if (current === healthSerial.current) setHealth(result);
      })
      .catch(() => {
        if (current === healthSerial.current) setHealth(null);
      });
    return () => {
      healthSerial.current++;
    };
  }, [list.result]);
  const formId = Form.useWatch('formId', form);
  const businessType = Form.useWatch('businessType', form) ?? '';
  const selectedBusiness = businessTypes.find((item) => item.type === businessType);
  const selectedForm = forms.find((item) => item.id === formId);
  const conditionSchema = businessType
    ? selectedBusiness?.schema
    : (publishedForms.find((item) => item.id === formId)?.schema ?? selectedForm?.schema);
  const patch = (id: string, patch: Partial<WorkflowStep>) =>
    setSteps((previous) => previous.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  const loadChoices = async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      allPages(collabApi.forms),
      collabApi.users(),
      allPages((query) => collabApi.forms({ ...query, status: 'published' })),
      collabApi.businessTypes(),
    ]);
    const [formResult, userResult, publishedResult, businessResult] = results;
    if (formResult.status === 'fulfilled') setForms(formResult.value);
    if (userResult.status === 'fulfilled') setUsers(userResult.value);
    if (publishedResult.status === 'fulfilled') setPublishedForms(publishedResult.value);
    if (businessResult.status === 'fulfilled') setBusinessTypes(businessResult.value);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected')
      setError(failure.reason instanceof Error ? failure.reason.message : '加载表单审批信息失败');
    setLoading(false);
  };
  const edit = async (record?: Workflow) => {
    const requestId = ++editSerial.current;
    try {
      const current = record ? await collabApi.workflow(record.id) : undefined;
      if (requestId !== editSerial.current) return;
      setSaveError('');
      form.resetFields();
      form.setFieldsValue({
        name: current?.name ?? '',
        code: current?.code ?? `workflow-${crypto.randomUUID().slice(0, 8)}`,
        category: current?.category ?? '',
        enabled: current?.enabled ?? true,
        description: current?.description ?? '',
        formId: current?.formId,
        businessType: current?.businessType ?? params.get('businessType') ?? '',
        sharedRoleIds: current?.sharedRoleIds ?? [],
      });
      setSteps(current?.steps ?? [newStep()]);
      setExecutionMode(current?.graph ? 'graph' : 'sequence');
      setGraph(
        current?.graph ? structuredClone(current.graph) : sequenceToGraph(current?.steps ?? []),
      );
      setEditing(current ?? null);
      void loadChoices();
    } catch {
      /* Request helper presents API errors. */
    }
  };
  const save = async (status: Workflow['status']) => {
    try {
      const values = await form.validateFields();
      if (businessType ? !selectedBusiness : !selectedForm) {
        message.warning(businessType ? '请选择业务对象' : '请选择表单');
        return;
      }
      const publishedForm = publishedForms.find((item) => item.id === selectedForm?.id);
      const publishSchema = selectedBusiness?.schema ?? publishedForm?.schema;
      if (status === 'published' && !publishSchema) {
        message.warning('请先发布表单');
        return;
      }
      let normalized: WorkflowStep[];
      try {
        normalized =
          status === 'published' && executionMode === 'sequence'
            ? prepareSteps(steps, publishSchema!)
            : steps;
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : '请配置工作流');
        return;
      }
      setBusy(true);
      setSaveError('');
      await persistWorkflow(
        collabApi,
        {
          ...values,
          businessType: businessType || undefined,
          formId: businessType ? 0 : values.formId,
          steps: normalized,
          executionMode,
          graph:
            executionMode === 'graph'
              ? status === 'published'
                ? prepareGraph(graph, publishSchema!)
                : graph
              : undefined,
          status: 'draft',
          revision: editing?.revision,
        },
        editing?.id,
        status === 'published',
        setEditing,
      );
      message.success(status === 'published' ? '工作流发布成功' : '工作流保存成功');
      setEditing(undefined);
      void reloadRef.current();
    } catch (e) {
      if (e instanceof Error) setSaveError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openGrant = async (row: Workflow) => {
    try {
      const current = await collabApi.workflow(row.id);
      setGranting(current);
      setGrantRoles(current.sharedRoleIds ?? []);
      setGrantError('');
    } catch {
      /* Request layer reports errors. */
    }
  };
  const publish = async () => {
    if (!publishing) return;
    setBusy(true);
    setPublishError('');
    try {
      await collabApi.publishWorkflow(publishing.id, publishing.revision, publishNote);
      message.success('工作流发布成功');
      setPublishing(undefined);
      await reloadRef.current();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : '发布失败');
    } finally {
      setBusy(false);
    }
  };
  const setEnabled = async (row: Workflow, enabled: boolean) => {
    setRowBusy((ids) => [...ids, row.id]);
    try {
      const current = await collabApi.workflow(row.id);
      await collabApi.saveWorkflow({ ...workflowDraft(current), enabled }, row.id);
      message.success(enabled ? '启用成功' : '禁用成功，操作已完成');
      await reloadRef.current();
    } catch {
      /* Request layer reports errors. */
    } finally {
      setRowBusy((ids) => ids.filter((id) => id !== row.id));
    }
  };
  useEffect(() => {
    const id = Number(params.get('workflowId'));
    if (!Number.isSafeInteger(id) || id <= 0) return;
    let alive = true;
    void collabApi
      .workflow(id)
      .then((row) => {
        if (!alive) return;
        const action = params.get('action');
        if (action === 'versions') setVersions(row);
        else if (action === 'checkup') setChecking(row);
        else if (action === 'grant') {
          setGranting(row);
          setGrantRoles(row.sharedRoleIds ?? []);
        } else void edit(row);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [params]);
  useEffect(
    () => () => {
      editSerial.current++;
    },
    [],
  );
  useEffect(() => {
    const last = Math.max(1, Math.ceil(list.result.total / list.query.pageSize));
    if (!list.loading && list.result.page === list.query.page && list.query.page > last)
      list.pagination.onChange(last, list.query.pageSize);
  }, [list.result, list.loading, list.query]);
  const move = (index: number, offset: number) =>
    setSteps((previous) => {
      const next = [...previous];
      const destination = index + offset;
      if (destination < 0 || destination >= next.length) return previous;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  const userOptions = users.map((user) => ({
    value: user.id,
    label: `${user.nickName || user.username} (${user.username})`,
  }));
  return (
    <>
      <Form
        form={filterForm}
        layout="inline"
        className="collab-toolbar"
        onFinish={(values) => {
          setFilters({
            category: values.category?.trim() || undefined,
            enabled: values.enabled === undefined ? undefined : values.enabled === 'true',
            status: values.status,
          });
          list.search(values.keyword?.trim() ?? '');
        }}
      >
        <Space wrap>
          <Form.Item name="keyword" label="名称 / 编码">
            <Input allowClear placeholder="名称/编码搜索" />
          </Form.Item>
          <Form.Item name="category" label="类别">
            <Input allowClear placeholder="类别名称" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 130 }}
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'published', label: '已发布' },
              ]}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用">
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 105 }}
              options={[
                { value: 'true', label: '启用' },
                { value: 'false', label: '禁用' },
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            搜索
          </Button>
          <Button
            onClick={() => {
              filterForm.resetFields();
              setFilters({});
              list.search('');
            }}
          >
            重置
          </Button>
        </Space>
        <Space>
          <Button onClick={() => void list.reload()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void edit()}>
            创建新工作流
          </Button>
        </Space>
      </Form>
      <LoadError error={list.error} retry={list.reload} />
      <Table<Workflow>
        rowKey="id"
        dataSource={list.result.list}
        loading={list.loading}
        pagination={list.pagination}
        scroll={{ x: 1500 }}
        columns={[
          { title: '工作流名称', dataIndex: 'name', width: 170 },
          { title: '编码', dataIndex: 'code', width: 200 },
          {
            title: '类型',
            width: 100,
            render: (_, row) => (
              <Tag color={row.graph ? 'blue' : undefined}>{row.graph ? '图形模式' : '审批'}</Tag>
            ),
          },
          {
            title: '类别',
            dataIndex: 'category',
            width: 100,
            render: (value) => value || '无',
          },
          { title: '版本', width: 90, render: (_, row) => draftVersionLabel(row) },
          {
            title: '版本状态',
            dataIndex: 'version',
            width: 95,
            render: (value) => (value ? `v${value}` : '草稿'),
          },
          {
            title: '启用',
            width: 90,
            render: (_, row) =>
              canManage(row.ownerId) ? (
                <Switch
                  checked={row.enabled}
                  loading={rowBusy.includes(row.id)}
                  onChange={(value) => void setEnabled(row, value)}
                />
              ) : (
                <Tag>{row.enabled ? '启用' : '禁用'}</Tag>
              ),
          },
          { title: '待办', dataIndex: 'pendingCount', width: 70 },
          {
            title: '健康检查',
            width: 100,
            render: (_, row) => {
              const issues = health?.issues.filter((issue) => issue.workflowId === row.id) ?? [];
              return !health ||
                !canManage(row.ownerId) ||
                (!issues.length && health.issues.some((issue) => issue.code === 'scan_limit')) ? (
                <Typography.Text type="secondary">暂无问题</Typography.Text>
              ) : (
                <Tag
                  color={
                    issues.some((issue) => issue.severity === 'error')
                      ? 'error'
                      : issues.length
                        ? 'warning'
                        : 'success'
                  }
                >
                  {issues.length ? `${issues.length} 个问题` : '已通过'}
                </Tag>
              );
            },
          },
          { title: '更新时间', dataIndex: 'updatedAt', width: 185, render: formatTime },
          {
            title: '操作',
            width: 370,
            fixed: 'right',
            render: (_, row) =>
              canManage(row.ownerId) ? (
                <Space size={0} wrap>
                  <Button type="link" size="small" onClick={() => void edit(row)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    disabled={row.status !== 'draft'}
                    onClick={() => {
                      setPublishing(row);
                      setPublishNote('');
                      setPublishError('');
                    }}
                  >
                    发布
                  </Button>
                  <Button type="link" size="small" onClick={() => setVersions(row)}>
                    版本
                  </Button>
                  <Button type="link" size="small" onClick={() => void openGrant(row)}>
                    授权
                  </Button>
                  <Button type="link" size="small" onClick={() => setChecking(row)}>
                    检查
                  </Button>
                  <Popconfirm
                    title="删除工作流？"
                    onConfirm={async () => {
                      await collabApi.deleteWorkflow(row.id);
                      message.success('删除成功');
                      await reloadRef.current();
                    }}
                  >
                    <Button type="link" size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ) : (
                <Typography.Text type="secondary">工作流详情</Typography.Text>
              ),
          },
        ]}
      />
      <Drawer
        title={editing ? `工作流配置 · ${editing.name}` : '创建新审批工作流'}
        open={editing !== undefined}
        onClose={() => {
          if (!busy) setEditing(undefined);
        }}
        width="min(1440px, 98vw)"
        destroyOnHidden
        extra={
          <Space>
            <Button disabled={busy} onClick={() => setEditing(undefined)}>
              取消
            </Button>
            <Button loading={busy} disabled={loading || !!error} onClick={() => void save('draft')}>
              保存
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={loading || !!error}
              onClick={() => void save('published')}
            >
              保存并发布
            </Button>
          </Space>
        }
        getContainer={() => document.body}
      >
        <LoadError error={error} retry={loadChoices} />
        {saveError && (
          <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} />
        )}
        {!!editing?.version && (
          <Alert
            type="info"
            showIcon
            message={`发布 v${editing.version}，编辑新版本。`}
            style={{ marginBottom: 16 }}
          />
        )}
        <Spin spinning={loading}>
          <Alert
            type="info"
            showIcon
            message={
              executionMode === 'graph'
                ? '自由编排审批节点和流转关系，支持复杂流程。'
                : '按顺序审批节点；从上到下逐级审批，全部通过即通过；完成。'
            }
            description="发布需要审批权限。保存后仍可编辑；发布后为正式版，保存保留草稿。"
            style={{ marginBottom: 20 }}
          />
          <Form form={form} layout="vertical" disabled={busy}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="name"
                  label="工作流名称"
                  rules={[{ required: true, whitespace: true, message: '请输入工作流名称' }]}
                >
                  <Input maxLength={100} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="businessType" label="审批对象">
                  <Select
                    value={businessType}
                    options={[
                      { value: '', label: '表单' },
                      ...businessTypes.map((item) => ({
                        value: item.type,
                        label: `${item.schema.title || item.type} · ${item.type}`,
                      })),
                    ]}
                    onChange={(value) => form.setFieldsValue({ formId: value ? 0 : undefined })}
                  />
                </Form.Item>
              </Col>
            </Row>
            {!businessType ? (
              <Form.Item
                name="formId"
                label="表单"
                rules={[{ required: true, message: '请选择表单' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="请选择表单"
                  options={forms.map((item) => ({
                    value: item.id,
                    label: `${item.name} (${item.version ? `发布版 v${item.version}${item.status === 'draft' ? ' · 草稿' : ''}` : '草稿'})`,
                  }))}
                />
              </Form.Item>
            ) : (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={`审批对象：${selectedBusiness?.schema.title || businessType}`}
                description="工作流页面详情、数据服务详情。字段详情。"
              />
            )}
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="code"
                  label="工作流编码"
                  rules={[{ required: true, whitespace: true, message: '请输入工作流编码' }]}
                  extra={editing?.version ? '已发布版本编码不可修改' : undefined}
                >
                  <Input maxLength={100} disabled={busy || Boolean(editing?.version)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="category" label="类别">
                  <Input maxLength={100} placeholder="例如：审批" />
                </Form.Item>
              </Col>
              <Col xs={24} md={4}>
                <Form.Item name="enabled" label="启用" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} maxLength={1000} />
            </Form.Item>
            <Form.Item
              name="sharedRoleIds"
              label="角色"
              extra={businessType ? '业务对象工作流。' : '表单工作流。'}
            >
              <SharedRoles />
            </Form.Item>
          </Form>
          {selectedForm?.status === 'draft' && Boolean(selectedForm.version) && (
            <Alert
              type="info"
              showIcon
              message="表单发布说明；工作流字段发布验证及发布版本。"
              style={{ marginBottom: 16 }}
            />
          )}
          <Space wrap style={{ marginBottom: 16 }}>
            <Typography.Text strong>执行模式</Typography.Text>
            <Radio.Group
              value={executionMode}
              disabled={busy}
              optionType="button"
              options={[
                { value: 'sequence', label: '顺序审批' },
                { value: 'graph', label: '图形编排' },
              ]}
              onChange={(event) => setExecutionMode(event.target.value)}
            />
            {executionMode === 'graph' && (
              <Popconfirm
                title="将当前审批步骤转换为图形？"
                description="此操作将覆盖现有图形，基于当前步骤重建，版本保留。"
                onConfirm={() => setGraph(sequenceToGraph(steps))}
              >
                <Button disabled={busy}>同步图形</Button>
              </Popconfirm>
            )}
          </Space>
          {executionMode === 'graph' ? (
            <GraphDesigner
              graph={graph}
              onChange={setGraph}
              formId={businessType ? undefined : formId}
              businessType={businessType || undefined}
              schema={conditionSchema}
              users={users}
              disabled={busy}
            />
          ) : (
            <>
              <div className="collab-flow-preview">
                <Steps
                  size="small"
                  direction="vertical"
                  items={[
                    {
                      title: '业务对象',
                      description:
                        selectedBusiness?.schema.title ?? selectedForm?.name ?? '请选择审批对象',
                    },
                    ...steps.map((step) => ({
                      title: step.name || '审批节点',
                      description: `${step.mode === 'all' ? '会签' : '或签'} · ${assigneeLabel(step)}${step.condition ? ' · 含条件' : ''}`,
                    })),
                    { title: '审批完成' },
                  ]}
                />
              </div>
              {steps.map((step, index) => {
                const conditionChoices = conditionSchema
                  ? conditionFields(conditionSchema.fields)
                  : [];
                const field = conditionChoices.find(
                  (field) => field.name === step.condition?.field,
                );
                const updateCondition = (change: Partial<NonNullable<WorkflowStep['condition']>>) =>
                  patch(step.id, {
                    condition: {
                      field: '',
                      operator: 'eq',
                      value: '',
                      ...step.condition,
                      ...change,
                    },
                  });
                return (
                  <Card
                    key={step.id}
                    size="small"
                    className="collab-step-card"
                    title={`节点 ${index + 1}`}
                    extra={
                      <Space>
                        <Button
                          size="small"
                          title="上移"
                          aria-label="上移"
                          disabled={!index}
                          icon={<ArrowUpOutlined />}
                          onClick={() => move(index, -1)}
                        />
                        <Button
                          size="small"
                          title="下移"
                          aria-label="下移"
                          disabled={index === steps.length - 1}
                          icon={<ArrowDownOutlined />}
                          onClick={() => move(index, 1)}
                        />
                        <Button
                          size="small"
                          danger
                          title="删除节点"
                          aria-label="删除节点"
                          icon={<DeleteOutlined />}
                          onClick={() =>
                            setSteps((previous) => previous.filter((item) => item.id !== step.id))
                          }
                        />
                      </Space>
                    }
                  >
                    <Form layout="vertical" disabled={busy}>
                      <Row gutter={16}>
                        <Col xs={24} md={10}>
                          <Form.Item label="节点名称" required>
                            <Input
                              value={step.name}
                              maxLength={100}
                              onChange={(event) => patch(step.id, { name: event.target.value })}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={14}>
                          <Form.Item label="审批人" required>
                            <AssigneeEditor
                              value={step}
                              users={users}
                              disabled={busy}
                              onChange={(assignment) => patch(step.id, assignment)}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item label="抄送人" extra="指定抄送用户；审批时通知，不影响流程。">
                        <CCUserSelect
                          value={step.ccUserIds}
                          options={userOptions}
                          onChange={(ccUserIds) => patch(step.id, { ccUserIds })}
                        />
                      </Form.Item>
                      <Form.Item label="通过方式">
                        <Radio.Group
                          value={step.mode}
                          onChange={(event) => patch(step.id, { mode: event.target.value })}
                          options={[
                            { value: 'any', label: '任意通过' },
                            { value: 'all', label: '全部通过' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item label="条件分支">
                        <Switch
                          checked={!!step.condition}
                          disabled={!conditionSchema?.fields.length}
                          onChange={(checked) =>
                            patch(step.id, {
                              condition: checked
                                ? {
                                    field:
                                      conditionChoices.find(
                                        (field) => !field.disabled && field.type !== 'password',
                                      )?.name ?? '',
                                    operator: 'eq',
                                    value: '',
                                  }
                                : undefined,
                            })
                          }
                        />
                      </Form.Item>
                      {step.condition && (
                        <Row gutter={12}>
                          <Col xs={24} md={8}>
                            <Form.Item label="字段" required>
                              <Select
                                value={step.condition.field}
                                options={conditionChoices
                                  .filter((field) => !field.disabled && field.type !== 'password')
                                  .map((field) => ({
                                    value: field.name,
                                    label: `${field.label} (${field.name})`,
                                  }))}
                                onChange={(field) =>
                                  updateCondition({
                                    field,
                                    operator: 'eq',
                                    value:
                                      conditionChoices.find((item) => item.name === field)?.type ===
                                      'checkbox'
                                        ? []
                                        : '',
                                  })
                                }
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={7}>
                            <Form.Item label="运算符">
                              <Select
                                value={step.condition.operator}
                                options={allowedOperators(field).map((value) => ({
                                  value,
                                  label: operatorLabels[value],
                                }))}
                                onChange={(operator) =>
                                  updateCondition({
                                    operator,
                                    value:
                                      field?.type === 'checkbox' && operator !== 'contains'
                                        ? []
                                        : '',
                                  })
                                }
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={9}>
                            <Form.Item label="值" required>
                              {field?.type === 'switch' ? (
                                <Select
                                  value={
                                    step.condition.value === ''
                                      ? undefined
                                      : String(step.condition.value)
                                  }
                                  options={[
                                    { value: 'true', label: '开启' },
                                    { value: 'false', label: '关闭' },
                                  ]}
                                  onChange={(value) => updateCondition({ value })}
                                />
                              ) : field && ['number', 'slider', 'rate'].includes(field.type) ? (
                                <InputNumber
                                  style={{ width: '100%' }}
                                  value={
                                    typeof step.condition.value === 'number'
                                      ? step.condition.value
                                      : null
                                  }
                                  onChange={(value) => updateCondition({ value })}
                                />
                              ) : field?.type === 'checkbox' &&
                                step.condition.operator !== 'contains' ? (
                                <Select
                                  mode="multiple"
                                  value={
                                    Array.isArray(step.condition.value)
                                      ? (step.condition.value as string[])
                                      : []
                                  }
                                  options={field.options}
                                  onChange={(value) => updateCondition({ value })}
                                />
                              ) : field?.options.length ? (
                                <Select
                                  value={String(step.condition.value ?? '')}
                                  options={field.options}
                                  onChange={(value) => updateCondition({ value })}
                                />
                              ) : (
                                <Input
                                  value={String(step.condition.value ?? '')}
                                  placeholder={field?.type === 'date' ? 'YYYY-MM-DD' : '请输入值'}
                                  onChange={(event) =>
                                    updateCondition({ value: event.target.value })
                                  }
                                />
                              )}
                            </Form.Item>
                          </Col>
                        </Row>
                      )}
                    </Form>
                  </Card>
                );
              })}
              {!steps.length && <Empty description="请添加审批节点" />}
              <Button
                block
                icon={<PlusOutlined />}
                disabled={steps.length >= 50}
                onClick={() => setSteps((previous) => [...previous, newStep()])}
              >
                添加审批节点
              </Button>
            </>
          )}
        </Spin>
      </Drawer>
      {versions && (
        <WorkflowVersionsDrawer
          key={versions.id}
          workflow={versions}
          onClose={() => setVersions(undefined)}
          onRestored={(saved) => {
            setVersions(undefined);
            void reloadRef.current();
            void edit(saved);
          }}
        />
      )}
      {checking && (
        <Drawer
          title={`工作流检查 · ${checking.name}`}
          open
          width="min(1140px, 100vw)"
          onClose={() => setChecking(undefined)}
          getContainer={() => document.body}
        >
          <CheckupPanel
            key={checking.id}
            workflowId={checking.id}
            onWorkflow={(id) => {
              setChecking(undefined);
              void collabApi
                .workflow(id)
                .then((value) => edit(value))
                .catch(() => undefined);
            }}
          />
        </Drawer>
      )}
      <Drawer
        title={`工作流授权 · ${granting?.name ?? ''}`}
        open={Boolean(granting)}
        width="min(560px, 100vw)"
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        onClose={() => setGranting(undefined)}
        extra={
          <Space>
            <Button disabled={busy} onClick={() => setGranting(undefined)}>
              取消
            </Button>
            <Button
              type="primary"
              loading={busy}
              onClick={async () => {
                if (!granting) return;
                setBusy(true);
                setGrantError('');
                try {
                  await collabApi.saveWorkflow(
                    { ...workflowDraft(granting), sharedRoleIds: grantRoles },
                    granting.id,
                  );
                  message.success('工作流更新成功');
                  setGranting(undefined);
                  await reloadRef.current();
                } catch (e) {
                  setGrantError(e instanceof Error ? e.message : '保存失败');
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存
            </Button>
          </Space>
        }
        getContainer={() => document.body}
      >
        {grantError && (
          <Alert type="error" showIcon message={grantError} style={{ marginBottom: 16 }} />
        )}
        <Alert
          type="info"
          showIcon
          message="角色授权说明；配置创建管理详情。详情、表单。"
          style={{ marginBottom: 20 }}
        />
        <Form layout="vertical" disabled={busy}>
          <Form.Item label="角色">
            <SharedRoles value={grantRoles} onChange={setGrantRoles} />
          </Form.Item>
        </Form>
      </Drawer>
      <Modal
        title={`发布工作流 · ${publishing?.name ?? ''}`}
        open={Boolean(publishing)}
        onCancel={() => {
          if (!busy) setPublishing(undefined);
        }}
        confirmLoading={busy}
        onOk={() => void publish()}
        okText="发布"
        cancelButtonProps={{ disabled: busy }}
        maskClosable={!busy}
        keyboard={!busy}
      >
        <Alert
          type="info"
          showIcon
          message={`验证并发布 v${(publishing?.version ?? 0) + 1}，保留旧版本。`}
          description="发布需要审批权限，服务验证详情。"
          style={{ marginBottom: 16 }}
        />
        {publishError && (
          <Alert type="error" showIcon message={publishError} style={{ marginBottom: 16 }} />
        )}
        <Input.TextArea
          rows={3}
          maxLength={500}
          value={publishNote}
          onChange={(e) => setPublishNote(e.target.value)}
          placeholder="发布说明（选填）"
          disabled={busy}
        />
      </Modal>
    </>
  );
}
