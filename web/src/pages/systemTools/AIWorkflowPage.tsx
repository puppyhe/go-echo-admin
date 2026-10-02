// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Pagination,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  autoCodeApi,
  type AiWorkflowMessage,
  type AiWorkflowSessionRow,
} from '../../api/endpoints';
import { session } from '../../api/request';
import {
  WorkflowConversation,
  hydrateWorkflow,
  newWorkflow,
  parseWorkflowSettings,
  restoreWorkflowNode,
  workflowSnapshot,
  workflowTypes,
  type WorkflowSession,
  type WorkflowTab,
} from '../../domain/aiWorkflow';
import { record } from '../../domain/llmStream';

const modeOptions = [
  { label: '分析', value: 'analysis' },
  { label: '工作流', value: 'workflow' },
];
const statuses = { pending: '生成中', complete: '完成', stopped: '已停止', failed: '请求失败' };
const pretty = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const asText = (...values: unknown[]) =>
  values.find((v): v is string => typeof v === 'string' && Boolean(v)) ?? '';

function ResultPanel({
  result,
  source,
}: {
  result: Record<string, unknown>;
  source?: AiWorkflowMessage;
}) {
  const steps =
    result.steps ?? result.workflow ?? result.prompts ?? result.promptFlow ?? result.promptList;
  const extras = ['missingInfo', 'missing_info', 'suggestions', 'recommendations'].filter(
    (key) => Array.isArray(result[key]) && (result[key] as unknown[]).length,
  );
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {typeof result.summary === 'string' && result.summary && (
        <Alert
          type="info"
          message="分析"
          description={<span style={{ whiteSpace: 'pre-wrap' }}>{result.summary}</span>}
        />
      )}
      {typeof result.recommendedPackageType === 'string' && (
        <Tag>标签：{result.recommendedPackageType}</Tag>
      )}
      {extras.map((key) => (
        <Card key={key} size="small" title={key.startsWith('missing') ? '缺失信息' : '消息'}>
          <ul>
            {(result[key] as unknown[]).map((v, i) => (
              <li key={i}>{pretty(v)}</li>
            ))}
          </ul>
        </Card>
      ))}
      {Array.isArray(steps) && steps.length > 0 && (
        <Collapse
          items={steps.map((entry: unknown, i) => {
            const step = record(entry);
            const prompt =
              typeof entry === 'string'
                ? entry
                : asText(step.prompt, step.content, step.instruction, step.text);
            return {
              key: String(i),
              label: `${i + 1}. ${asText(step.title, step.name, step.stepName) || '消息'}`,
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {asText(step.goal, step.description, step.objective) && (
                    <Typography.Paragraph>
                      {asText(step.goal, step.description, step.objective)}
                    </Typography.Paragraph>
                  )}
                  <Typography.Paragraph
                    copyable={{ text: prompt }}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {prompt || pretty(step)}
                  </Typography.Paragraph>
                  {asText(step.expectedOutput, step.expected, step.output) && (
                    <Typography.Paragraph>
                      <strong>标签：</strong>
                      {asText(step.expectedOutput, step.expected, step.output)}
                    </Typography.Paragraph>
                  )}
                  {asText(step.suggestedTool, step.tool) && (
                    <Tag>标签：{asText(step.suggestedTool, step.tool)}</Tag>
                  )}
                </Space>
              ),
            };
          })}
        />
      )}
      {[
        { rows: result.modules ?? result.moduleList ?? result.entities, title: '消息' },
        { rows: result.clientPages ?? result.pages, title: '客户页面' },
      ].map(
        ({ rows, title }) =>
          Array.isArray(rows) &&
          rows.length > 0 && (
            <Collapse
              key={title}
              items={rows.map((entry: unknown, i) => {
                const item = record(entry);
                return {
                  key: String(i),
                  label: `${title} · ${asText(item.label, item.title, item.name, item.moduleName) || i + 1}`,
                  children: (
                    <Typography.Paragraph copyable={{ text: pretty(entry) }}>
                      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {pretty(entry)}
                      </pre>
                    </Typography.Paragraph>
                  ),
                };
              })}
            />
          ),
      )}
      {!Object.keys(result).length && !source?.content && (
        <Empty description="查看详情，查看历史" />
      )}
      {(source?.content || Object.keys(result).length > 0) && (
        <Collapse
          items={[
            {
              key: 'original',
              label: '数据',
              children: (
                <>
                  {source?.content && (
                    <Typography.Paragraph copyable={{ text: source.content }}>
                      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {source.content}
                      </pre>
                    </Typography.Paragraph>
                  )}
                  {Object.keys(result).length > 0 && (
                    <Typography.Paragraph copyable={{ text: pretty(result) }}>
                      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {pretty(result)}
                      </pre>
                    </Typography.Paragraph>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </Space>
  );
}

export default function AIWorkflowPage() {
  const { message } = App.useApp();
  const [, redraw] = useState(0);
  const mounted = useRef(true);
  const current = useRef<WorkflowConversation | null>(null);
  const navigationSequence = useRef(0);
  const listSequence = useRef(0);
  const activeSessions = useRef<Partial<Record<WorkflowTab, number>>>({});
  const [tab, setTab] = useState<WorkflowTab>('analysis');
  const [rows, setRows] = useState<AiWorkflowSessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [selectedNode, setSelectedNode] = useState('');
  const [view, setView] = useState<'conversation' | 'result'>('conversation');
  const userID = session.getSnapshot()?.ID ?? 0;
  const io = { save: autoCodeApi.saveAIWorkflowSession, stream: autoCodeApi.llmAutoSSE };
  const install = (value: WorkflowSession) => {
    let instance: WorkflowConversation;
    instance = new WorkflowConversation(value, io, () => {
      if (mounted.current && current.current === instance) redraw((n) => n + 1);
    });
    current.current = instance;
    activeSessions.current[value.tab] = value.id;
    setTab(value.tab);
    setSelectedNode(value.currentNodeId ?? '');
    setFollowUp('');
    setView(value.messages.length ? 'conversation' : 'result');
    redraw((n) => n + 1);
  };
  if (!current.current) {
    let initial: WorkflowConversation;
    initial = new WorkflowConversation(newWorkflow('analysis'), io, () => {
      if (mounted.current && current.current === initial) redraw((n) => n + 1);
    });
    current.current = initial;
  }
  const conversation = current.current;
  const value = conversation.value;
  const generating = conversation.running;
  const disabled = busy || generating;
  const loadList = useCallback(async () => {
    const sequence = ++listSequence.current;
    setLoading(true);
    try {
      const result = await autoCodeApi.getAIWorkflowSessionList({
        page,
        pageSize: 10,
        tab,
        keyword,
      });
      if (mounted.current && sequence === listSequence.current) {
        setRows(result.list);
        setTotal(result.total);
      }
    } catch {
      /* request layer reports errors */
    } finally {
      if (mounted.current && sequence === listSequence.current) setLoading(false);
    }
  }, [page, tab, keyword]);
  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => {
      if (current.current?.dirty || current.current?.running) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      mounted.current = false;
      navigationSequence.current++;
      listSequence.current++;
      void (async () => {
        const target = current.current;
        await target?.stop();
        if (target?.dirty) await target.save();
      })().catch(() => undefined);
      window.removeEventListener('beforeunload', warn);
    };
  }, []);
  const navigate = async (nextTab: WorkflowTab, id = 0, formData?: Record<string, unknown>) => {
    const sequence = ++navigationSequence.current;
    const previous = current.current;
    setBusy(true);
    try {
      await previous?.stop();
      if (sequence !== navigationSequence.current || !mounted.current) return;
      if (previous?.dirty) await previous.save();
      if (previous) activeSessions.current[previous.value.tab] = previous.value.id;
      if (sequence !== navigationSequence.current || !mounted.current) return;
      const next = id
        ? hydrateWorkflow(await autoCodeApi.getAIWorkflowSessionDetail({ ID: id }))
        : newWorkflow(nextTab);
      if (sequence !== navigationSequence.current || !mounted.current) return;
      if (formData) next.formData = { ...next.formData, ...formData };
      install(next);
      if (formData) current.current!.edit({ formData: next.formData });
      setPage(1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '请求失败');
    } finally {
      if (mounted.current && sequence === navigationSequence.current) setBusy(false);
    }
  };
  const save = async () => {
    const target = current.current!;
    setBusy(true);
    try {
      parseWorkflowSettings(target.value.settings.extraPayload);
      await target.save();
      message.success('保存成功');
      void loadList();
      setSettingsOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const generate = async (continuing = false) => {
    const target = current.current!;
    if (continuing && !followUp.trim()) {
      message.warning('请输入内容');
      return;
    }
    setView('conversation');
    setSelectedNode('');
    try {
      await target.run(continuing ? followUp : undefined, userID);
      if (mounted.current && current.current === target) {
        setFollowUp('');
        setSelectedNode(target.value.currentNodeId ?? '');
        void loadList();
      }
    } catch (error) {
      if (mounted.current && current.current === target) {
        message.error(error instanceof Error ? error.message : '请求失败');
        void loadList();
      }
    }
  };
  const restore = async (node: AiWorkflowMessage) => {
    const target = current.current!;
    setBusy(true);
    try {
      target.edit(restoreWorkflowNode(target.value, node.id));
      await target.save();
      setSelectedNode(node.id);
      setView('result');
      message.success('节点已还原');
      void loadList();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '请求失败');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const exportLocal = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ai-workflow-session.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportMarkdown = async () => {
    const target = current.current!;
    setBusy(true);
    try {
      if (target.dirty || !target.value.id) await target.save();
      await autoCodeApi.dumpAIWorkflowMarkdown({ ID: target.value.id });
    } catch {
      /* request layer reports errors */
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const remove = async (row: AiWorkflowSessionRow) => {
    setBusy(true);
    try {
      await autoCodeApi.deleteAIWorkflowSession({ ID: row.id });
      if (current.current?.value.id === row.id) install(newWorkflow(tab));
      if (rows.length === 1 && page > 1) setPage((n) => n - 1);
      else void loadList();
    } catch {
      /* request layer reports errors */
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const reloadSaved = async () => {
    const target = current.current!;
    if (!target.value.id) return;
    const sequence = ++navigationSequence.current;
    setBusy(true);
    try {
      const saved = await autoCodeApi.getAIWorkflowSessionDetail({ ID: target.value.id });
      if (mounted.current && navigationSequence.current === sequence)
        install(hydrateWorkflow(saved));
    } catch {
      /* request layer reports errors */
    } finally {
      if (mounted.current && navigationSequence.current === sequence) setBusy(false);
    }
  };
  const editForm = (field: string, next: unknown) =>
    conversation.edit({ formData: { ...value.formData, [field]: next } });
  const node = value.messages.find(
    (m) => m.id === (selectedNode || value.currentNodeId) && m.role === 'assistant',
  );
  const result = node
    ? (node.snapshot ??
      (node.content
        ? workflowSnapshot({ text: node.content, conversationId: '', messageId: '' })
        : {}))
    : value.resultData;
  const transferAnalysis = () => {
    const source = [
      value.formData.requirement,
      node?.content,
      Object.keys(result).length ? pretty(result) : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    void navigate('workflow', 0, { source });
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card>
        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
          <div>
            <Typography.Title level={4} style={{ margin: '0 0 6px' }}>
              AI 标签
            </Typography.Title>
            <Typography.Text type="secondary">
              分析。输入需求、生成工作流、查看节点输出。
            </Typography.Text>
          </div>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={modeOptions}
            value={tab}
            disabled={busy}
            onChange={(event) =>
              void navigate(
                event.target.value as WorkflowTab,
                activeSessions.current[event.target.value as WorkflowTab] || 0,
              )
            }
          />
        </Space>
      </Card>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Card
          title="替换图片"
          size="small"
          style={{ width: 260, flexGrow: 1, flexBasis: 240, maxWidth: 340 }}
          extra={
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={busy}
              onClick={() => void navigate(tab)}
            >
              label
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input.Search
              placeholder="搜索消息"
              allowClear
              onSearch={(text) => {
                setKeyword(text);
                setPage(1);
              }}
            />
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => void loadList()}
            >
              刷新列表
            </Button>
            <List
              loading={loading}
              dataSource={rows}
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="消息" />,
              }}
              renderItem={(row) => (
                <List.Item
                  style={{
                    background: value.id === row.id ? 'var(--gea-accent-soft, #f0f5ff)' : undefined,
                    padding: 8,
                  }}
                >
                  <div style={{ width: '100%' }}>
                    <Button
                      type="link"
                      block
                      disabled={busy}
                      style={{
                        padding: 0,
                        textAlign: 'left',
                        height: 'auto',
                        whiteSpace: 'normal',
                      }}
                      onClick={() =>
                        void navigate(row.tab === 'workflow' ? 'workflow' : 'analysis', row.id)
                      }
                    >
                      {row.title || '消息'}
                    </Button>
                    <Space style={{ marginTop: 6, justifyContent: 'space-between', width: '100%' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : ''}
                      </Typography.Text>
                      <Popconfirm
                        title="删除此消息？"
                        description="删除后将无法恢复。"
                        onConfirm={() => remove(row)}
                      >
                        <Button size="small" type="text" danger disabled={disabled}>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>
                </List.Item>
              )}
            />
            <Pagination
              simple
              size="small"
              current={page}
              pageSize={10}
              total={total}
              hideOnSinglePage
              onChange={setPage}
            />
          </Space>
        </Card>
        <Space direction="vertical" size="middle" style={{ flex: '5 1 620px', minWidth: 0 }}>
          <Card
            title={
              <Space>
                {value.title || '消息'}
                {generating ? (
                  <Tag color="processing">生成中</Tag>
                ) : (
                  <Tag color={conversation.dirty ? 'orange' : 'green'}>
                    {conversation.dirty || !value.id ? '未保存' : '已保存'}
                  </Tag>
                )}
              </Space>
            }
            extra={
              <Space wrap>
                <Button
                  icon={<SettingOutlined />}
                  disabled={disabled}
                  onClick={() => setSettingsOpen(true)}
                >
                  标签
                </Button>
                <Button disabled={disabled} onClick={() => void save()}>
                  保存
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  disabled={disabled || !value.messages.length}
                  onClick={() => void exportMarkdown()}
                >
                  导出
                </Button>
              </Space>
            }
          >
            {conversation.error && (
              <Alert
                type="error"
                showIcon
                message="错误"
                description={
                  <Space direction="vertical">
                    <span>{conversation.error}</span>
                    {conversation.dirty && (
                      <span>标签页未保存。可重试保存或直接下载本地副本。</span>
                    )}
                    <Space>
                      <Button size="small" onClick={exportLocal}>
                        下载本地副本
                      </Button>
                      {value.id > 0 && (
                        <Popconfirm
                          title="保存此版本？"
                          description="保存当前进度到服务端，并下载 Markdown 文档。"
                          onConfirm={reloadSaved}
                        >
                          <Button size="small" disabled={disabled}>
                            保存并下载版本
                          </Button>
                        </Popconfirm>
                      )}
                      {conversation.dirty && (
                        <Button size="small" disabled={disabled} onClick={() => void save()}>
                          重试保存
                        </Button>
                      )}
                    </Space>
                  </Space>
                }
                style={{ marginBottom: 16 }}
              />
            )}
            <Collapse
              defaultActiveKey={['input']}
              items={[
                {
                  key: 'input',
                  label: tab === 'analysis' ? '需求分析' : '工作流生成',
                  children: (
                    <Form layout="vertical" disabled={disabled}>
                      <Form.Item label={tab === 'analysis' ? '需求' : '来源'} required>
                        <Input.TextArea
                          value={String(
                            value.formData[tab === 'analysis' ? 'requirement' : 'source'] ?? '',
                          )}
                          rows={5}
                          maxLength={tab === 'analysis' ? 8000 : 24000}
                          showCount
                          placeholder={
                            tab === 'analysis'
                              ? '输入需求、用户需求或已有工作流描述'
                              : '描述你的工作流需求'
                          }
                          onChange={(event) =>
                            editForm(
                              tab === 'analysis' ? 'requirement' : 'source',
                              event.target.value,
                            )
                          }
                        />
                      </Form.Item>
                      {tab === 'analysis' ? (
                        <>
                          <Form.Item label="产出类型">
                            <Radio.Group
                              value={value.formData.packageType}
                              options={[
                                { label: '自动选择', value: 'auto' },
                                { label: '完整包', value: 'package' },
                                { label: '插件', value: 'plugin' },
                              ]}
                              onChange={(event) => editForm('packageType', event.target.value)}
                            />
                          </Form.Item>
                          <Form.Item label="业务场景">
                            <Input
                              value={String(value.formData.businessScene ?? '')}
                              maxLength={500}
                              placeholder="例如：OA、ERP、CRM 等"
                              onChange={(event) => editForm('businessScene', event.target.value)}
                            />
                          </Form.Item>
                          <Form.Item>
                            <Checkbox
                              checked={Boolean(value.formData.hasClientPage)}
                              onChange={(event) => editForm('hasClientPage', event.target.checked)}
                            >
                              是否包含客户页面
                            </Checkbox>
                          </Form.Item>
                          {Boolean(value.formData.hasClientPage) && (
                            <>
                              <Form.Item label="客户页面描述">
                                <Input.TextArea
                                  rows={3}
                                  maxLength={2000}
                                  value={String(value.formData.clientPageDescription ?? '')}
                                  onChange={(event) =>
                                    editForm('clientPageDescription', event.target.value)
                                  }
                                />
                              </Form.Item>
                              <Form.Item label="客户页面约束">
                                <Input.TextArea
                                  rows={2}
                                  maxLength={2000}
                                  value={String(value.formData.clientPageConstraints ?? '')}
                                  onChange={(event) =>
                                    editForm('clientPageConstraints', event.target.value)
                                  }
                                />
                              </Form.Item>
                            </>
                          )}
                        </>
                      ) : (
                        <Form.Item label="类型">
                          <Select
                            value={String(value.formData.flowType)}
                            options={workflowTypes}
                            onChange={(next) => editForm('flowType', next)}
                          />
                        </Form.Item>
                      )}
                      <Form.Item label="额外约束">
                        <Input.TextArea
                          rows={2}
                          maxLength={2000}
                          value={String(value.formData.extraConstraints ?? '')}
                          placeholder="例如：权限模块、附件上传、状态字典、导出功能等"
                          onChange={(event) => editForm('extraConstraints', event.target.value)}
                        />
                      </Form.Item>
                      <Space>
                        <Button
                          type="primary"
                          icon={<SendOutlined />}
                          disabled={disabled}
                          onClick={() => void generate()}
                        >
                          {tab === 'analysis' ? '开始分析' : '生成工作流'}
                        </Button>
                        {generating && (
                          <Button
                            icon={<StopOutlined />}
                            disabled={false}
                            onClick={() => void conversation.stop()}
                          >
                            停止
                          </Button>
                        )}
                      </Space>
                    </Form>
                  ),
                },
              ]}
            />
          </Card>
          <Card
            title={
              <Radio.Group
                optionType="button"
                options={[
                  { label: '对话', value: 'conversation' },
                  { label: '节点结果', value: 'result' },
                ]}
                value={view}
                onChange={(event) => setView(event.target.value)}
              />
            }
            extra={
              tab === 'analysis' &&
              node?.status !== 'pending' &&
              Boolean(node?.content || Object.keys(result).length) ? (
                <Button disabled={disabled} onClick={transferAnalysis}>
                  生成工作流
                </Button>
              ) : undefined
            }
          >
            {view === 'result' ? (
              <>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Select
                    placeholder="选择消息"
                    style={{ minWidth: 220 }}
                    value={node?.id}
                    onChange={setSelectedNode}
                    options={value.messages
                      .filter((m) => m.role === 'assistant' && m.status !== 'pending')
                      .map((m, i) => ({
                        value: m.id,
                        label: `节点 ${i + 1} · ${m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : m.id}`,
                      }))}
                  />
                  {node && node.status !== 'pending' && (
                    <Popconfirm
                      title="还原此节点？"
                      description="还原将移除后续所有历史，恢复到该节点状态。"
                      onConfirm={() => restore(node)}
                    >
                      <Button disabled={disabled}>还原节点</Button>
                    </Popconfirm>
                  )}
                </Space>
                <ResultPanel result={result} source={node} />
              </>
            ) : value.messages.length ? (
              <Timeline
                items={value.messages.map((item) => ({
                  key: item.id,
                  color: item.role === 'user' ? 'gray' : item.status === 'failed' ? 'red' : 'blue',
                  children: (
                    <div>
                      <Space wrap style={{ marginBottom: 8 }}>
                        <Tag color={item.role === 'user' ? 'default' : 'blue'}>
                          {item.role === 'user' ? '用户' : 'AI 回复'}
                        </Tag>
                        {item.status && (
                          <Tag
                            color={
                              item.status === 'failed'
                                ? 'error'
                                : item.status === 'pending'
                                  ? 'processing'
                                  : 'default'
                            }
                          >
                            {statuses[item.status]}
                          </Tag>
                        )}
                        <Typography.Text type="secondary">
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                        </Typography.Text>
                        {item.role === 'assistant' && item.status !== 'pending' && (
                          <Button
                            size="small"
                            type="link"
                            onClick={() => {
                              setSelectedNode(item.id);
                              setView('result');
                            }}
                          >
                            查看
                          </Button>
                        )}
                      </Space>
                      <Typography.Paragraph
                        copyable={item.content ? { text: item.content } : false}
                        style={{
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          maxHeight: 500,
                          overflow: 'auto',
                        }}
                      >
                        {item.content ||
                          (item.status === 'pending' ? <Spin size="small" /> : '等待生成')}
                      </Typography.Paragraph>
                      {item.error && (
                        <Alert
                          type={item.status === 'stopped' ? 'warning' : 'error'}
                          message={item.error}
                          showIcon
                        />
                      )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty description="暂无对话记录，开始生成后在此查看" />
            )}
            {value.messages.length > 0 && (
              <div
                style={{
                  borderTop: '1px solid var(--gea-border, #f0f0f0)',
                  paddingTop: 16,
                  marginTop: 16,
                }}
              >
                <Input.TextArea
                  value={followUp}
                  rows={3}
                  maxLength={8000}
                  disabled={disabled}
                  placeholder="输入补充说明，或继续追问调整需求…"
                  onChange={(event) => setFollowUp(event.target.value)}
                />
                <Space style={{ marginTop: 12 }}>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={disabled || !followUp.trim()}
                    onClick={() => void generate(true)}
                  >
                    发送
                  </Button>
                  <Button disabled={disabled} onClick={() => setFollowUp('')}>
                    清空
                  </Button>
                  {generating && (
                    <Button icon={<StopOutlined />} onClick={() => void conversation.stop()}>
                      停止
                    </Button>
                  )}
                </Space>
              </div>
            )}
          </Card>
        </Space>
      </div>
      <Drawer
        title="替换图片"
        width={480}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        extra={
          <Button type="primary" disabled={disabled} onClick={() => void save()}>
            保存
          </Button>
        }
        getContainer={() => document.body}
      >
        <Form layout="vertical" disabled={disabled}>
          <Form.Item label="名称">
            <Input
              maxLength={80}
              value={value.title}
              placeholder="输入会话名称"
              onChange={(event) => conversation.edit({ title: event.target.value })}
            />
          </Form.Item>
          <Collapse
            items={[
              {
                key: 'advanced',
                label: '高级设置',
                children: (
                  <Form.Item
                    label="服务参数"
                    extra="高级服务参数，JSON 对象格式；如温度、最大 token、页面管理等。"
                  >
                    <Input.TextArea
                      rows={10}
                      value={String(value.settings.extraPayload ?? '')}
                      placeholder={'{\n  "temperature": 0.7\n}'}
                      maxLength={10000}
                      onChange={(event) =>
                        conversation.edit({
                          settings: { ...value.settings, extraPayload: event.target.value },
                        })
                      }
                    />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
    </Space>
  );
}
