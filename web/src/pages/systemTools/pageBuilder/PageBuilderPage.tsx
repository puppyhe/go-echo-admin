import { useEffect, useRef, useState } from 'react';
import {
  App,
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CodeOutlined,
  DownloadOutlined,
  HistoryOutlined,
  PlusOutlined,
  RobotOutlined,
  SaveOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { pageBuilderApi } from './api';
import {
  designInput,
  htmlFileName,
  initialBrief,
  runGeneration,
  versionLabels,
  type Brief,
  type Design,
  type Version,
} from './model';
import './pageBuilder.css';
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '请求失败，请重试。';
const options = (values: string[]) => values.map((value) => ({ value }));
function Preview({ html, width }: { html: string; width: string }) {
  if (!html) return <Empty description="保存或生成页面后即可预览。" />;
  return (
    <div className="page-builder-preview">
      <iframe
        title="页面预览"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
        style={{ width: width === 'desktop' ? '100%' : width === 'tablet' ? 768 : 375 }}
      />
    </div>
  );
}
export default function PageBuilderPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<{ title: string; brief: Brief }>();
  const [design, setDesign] = useState<Design>();
  const [source, setSource] = useState('');
  const [raw, setRaw] = useState('');
  const [instruction, setInstruction] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [configured, setConfigured] = useState<boolean>();
  const [configError, setConfigError] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('preview');
  const [width, setWidth] = useState('desktop');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [history, setHistory] = useState<Design[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [viewedVersion, setViewedVersion] = useState<Version>();
  const controller = useRef<AbortController>();
  const historyRequest = useRef(0);
  const activeDesign = useRef<Design>();
  const mounted = useRef(true);
  const locked = busy || generating;
  function apply(value?: Design) {
    activeDesign.current = value;
    setDesign(value);
    setSource(value?.source ?? '');
    form.setFieldsValue({
      title: value?.title ?? 'page',
      brief: value?.brief ?? initialBrief(),
    });
    setDirty(false);
  }
  async function loadConfig() {
    setConfigError('');
    try {
      const result = await pageBuilderApi.config();
      if (mounted.current) setConfigured(result.configured);
    } catch (err) {
      if (mounted.current) setConfigError(errorText(err));
    }
  }
  useEffect(() => {
    mounted.current = true;
    void loadConfig();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || generating) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, generating]);
  async function loadHistory(next = page, q = query) {
    const seq = ++historyRequest.current;
    setHistoryBusy(true);
    try {
      const result = await pageBuilderApi.list(next, q);
      if (seq === historyRequest.current) {
        setHistory(result.list);
        setTotal(result.total);
        setPage(next);
      }
    } catch (err) {
      void message.error(errorText(err));
    } finally {
      if (seq === historyRequest.current) setHistoryBusy(false);
    }
  }
  async function loadVersions() {
    const current = activeDesign.current;
    if (!current) return;
    setBusy(true);
    try {
      setVersions((await pageBuilderApi.versions(current.id)).list);
      setVersionsOpen(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  function confirmSwitch(action: () => void) {
    if (dirty)
      modal.confirm({
        title: '切换前保存修改？',
        content: '未保存的修改将会丢失。',
        okText: '保存',
        onOk: action,
      });
    else action();
  }
  async function save() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setBusy(true);
    setError('');
    try {
      const saved = await pageBuilderApi.save(
        designInput(values, source, design?.revision),
        design?.id,
      );
      apply(saved);
      void message.success('页面已保存，预览已更新');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const abort = new AbortController();
    controller.current = abort;
    setGenerating(true);
    setError('');
    setRaw('');
    setTab('output');
    try {
      const result = await runGeneration(
        pageBuilderApi,
        designInput(values, source, design?.revision),
        design?.id,
        instruction,
        abort.signal,
        (saved) => {
          if (mounted.current) apply(saved);
        },
        (progress) => {
          if (mounted.current) setRaw(progress.text);
        },
      );
      if (!mounted.current) return;
      apply(result.current);
      setInstruction('');
      if (result.version.status === 'conflict') {
        setViewedVersion(result.version);
        setError(result.version.error);
      } else {
        setTab('preview');
        void message.success('页面保存成功');
      }
    } catch (err) {
      if (mounted.current)
        setError(abort.signal.aborted ? '生成已停止，已保留部分结果。' : errorText(err));
    } finally {
      if (mounted.current) setGenerating(false);
      controller.current = undefined;
    }
  }
  function download(value = source, title = form.getFieldValue('title') || 'page') {
    const url = URL.createObjectURL(new Blob([value], { type: 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = htmlFileName(title);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const sourceEditor = (
    <Input.TextArea
      className="page-builder-source"
      value={source}
      rows={25}
      disabled={locked}
      spellCheck={false}
      onChange={(event) => {
        setSource(event.target.value);
        setDirty(true);
      }}
      placeholder="粘贴 HTML 或直接编辑源码，保存后即可预览。"
    />
  );
  return (
    <div className="page-builder-page">
      <Card className="page-builder-heading">
        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <RobotOutlined /> AI 页面输出
            </Typography.Title>
            <Typography.Text type="secondary">
              描述页面需求与源码，然后生成并查看带版本管理的 HTML 输出。
            </Typography.Text>
          </div>
          <Space wrap>
            <Tag>
              {design ? `版本 ${design.revision}` : '未命名页面'}
              {dirty ? ' · 未保存' : ''}
            </Tag>
            <Button
              icon={<PlusOutlined />}
              disabled={locked}
              onClick={() =>
                confirmSwitch(() => {
                  apply();
                  setRaw('');
                  setInstruction('');
                  setError('');
                })
              }
            >
              新建页面
            </Button>
            <Button
              icon={<HistoryOutlined />}
              disabled={locked}
              onClick={() => {
                setHistoryOpen(true);
                void loadHistory(1);
              }}
            >
              页面历史
            </Button>
            <Button disabled={locked || !design} onClick={() => void loadVersions()}>
              页面版本
            </Button>
          </Space>
        </Space>
      </Card>
      {configError && (
        <Alert
          type="error"
          showIcon
          message={`AI 配置错误：${configError}`}
          action={<Button onClick={() => void loadConfig()}>重试</Button>}
        />
      )}
      {configured === false && (
        <Alert
          showIcon
          type="warning"
          message="未配置 AI 服务"
          description="请先配置 AI 服务地址，然后在此编辑并预览生成的 HTML。"
        />
      )}
      {error && (
        <Alert type="warning" showIcon closable onClose={() => setError('')} message={error} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card title="页面需求说明">
            <Form
              form={form}
              layout="vertical"
              initialValues={{ title: '未命名页面', brief: initialBrief() }}
              disabled={locked}
              onValuesChange={() => setDirty(true)}
            >
              <Form.Item
                label="页面标题"
                name="title"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input maxLength={120} />
              </Form.Item>
              <Form.Item
                label="用途"
                name={['brief', 'purpose']}
                rules={[{ required: true, whitespace: true }]}
              >
                <AutoComplete
                  options={options([
                    '企业官网',
                    '产品落地页',
                    '数据看板',
                    '文档中心',
                    '营销活动页',
                  ])}
                  maxLength={120}
                />
              </Form.Item>
              <Form.Item
                label="版块"
                name={['brief', 'sections']}
                rules={[
                  {
                    validator: (_, value: string[]) =>
                      value?.length > 25 || value?.some((item) => item.length > 100 || !item.trim())
                        ? Promise.reject(
                            new Error('版块数量不能超过 25 个；每个版块需为 1 至 100 个字符。'),
                          )
                        : Promise.resolve(),
                  },
                ]}
              >
                <Select
                  mode="tags"
                  tokenSeparators={['，', ',']}
                  options={options([
                    '首屏横幅',
                    '关于我们',
                    '服务介绍',
                    '产品特性',
                    '用户评价',
                    '价格方案',
                    '联系我们',
                  ])}
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="样式" name={['brief', 'style']}>
                    <AutoComplete
                      options={options([
                        '简洁现代',
                        '极简',
                        '大胆醒目',
                        '商务专业',
                        '活泼有趣',
                        '杂志编辑风',
                        '科技技术风',
                      ])}
                      maxLength={120}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="布局" name={['brief', 'layout']}>
                    <AutoComplete
                      options={options(['单页结构', '左右分栏', '长滚动', '网格布局', '数据看板'])}
                      maxLength={120}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="配色" name={['brief', 'colors']}>
                <AutoComplete
                  options={options(['蓝白配色', '中性色', '暗色模式', '暖色调', '自定义'])}
                  maxLength={120}
                  placeholder="例如，#005DFB"
                />
              </Form.Item>
              <Form.Item label="响应式" name={['brief', 'responsive']} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item label="详情" name={['brief', 'details']}>
                <Input.TextArea
                  rows={3}
                  maxLength={4000}
                  showCount
                  placeholder="描述目标受众、语气风格、内容要点和数据需求"
                />
              </Form.Item>
            </Form>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.TextArea
                value={instruction}
                disabled={locked}
                onChange={(event) => setInstruction(event.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="描述需要修改的内容，例如：保留页头并新增价格版块"
              />
              {generating ? (
                <Button
                  danger
                  block
                  icon={<StopOutlined />}
                  onClick={() => controller.current?.abort()}
                >
                  停止生成
                </Button>
              ) : (
                <Button
                  type="primary"
                  block
                  icon={<RobotOutlined />}
                  loading={busy}
                  disabled={configured !== true || !!configError}
                  onClick={() => void generate()}
                >
                  {source ? '重新生成' : '生成'}
                </Button>
              )}
              <Button block icon={<SaveOutlined />} disabled={locked} onClick={() => void save()}>
                保存并更新预览
              </Button>
              <Typography.Text type="secondary">
                生成前请先保存。模型将接收当前的需求说明与源码；生成结果限制在 512 KB 以内。
              </Typography.Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={16}>
          <Card
            title={
              <Space>
                <CodeOutlined />
                页面输出 {generating && <Spin size="small" />}
              </Space>
            }
            extra={
              <Space>
                <Button disabled={!source} icon={<DownloadOutlined />} onClick={() => download()}>
                  下载 HTML
                </Button>
                <Button
                  disabled={!source}
                  onClick={() =>
                    void navigator.clipboard.writeText(source).then(
                      () => message.success('已复制'),
                      () => message.error('复制失败，请手动选中源码复制。'),
                    )
                  }
                >
                  复制
                </Button>
              </Space>
            }
          >
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                {
                  key: 'preview',
                  label: '预览',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Segmented
                        value={width}
                        onChange={(value) => setWidth(String(value))}
                        options={[
                          { label: '桌面端', value: 'desktop' },
                          { label: '平板端', value: 'tablet' },
                          { label: '移动端', value: 'mobile' },
                        ]}
                      />
                      <Alert
                        type="info"
                        message={
                          dirty
                            ? '保存最新修改以刷新预览。'
                            : '预览基于已保存的页面；下载会导出当前 HTML。'
                        }
                      />
                      <Preview html={design?.source ? design.previewHtml : ''} width={width} />
                    </Space>
                  ),
                },
                { key: 'source', label: 'HTML 源码', children: sourceEditor },
                {
                  key: 'output',
                  label: generating ? '生成中…' : '生成结果',
                  children: (
                    <Input.TextArea
                      className="page-builder-source"
                      value={raw}
                      readOnly
                      rows={28}
                      placeholder="生成的内容将显示在此处，可按需复制。"
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Drawer
        title="页面历史"
        open={historyOpen}
        width={620}
        onClose={() => setHistoryOpen(false)}
        getContainer={() => document.body}
      >
        <Input.Search
          placeholder="按名称搜索页面"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={() => void loadHistory(1)}
          allowClear
        />
        <List
          loading={historyBusy}
          dataSource={history}
          pagination={{
            current: page,
            total,
            pageSize: 10,
            onChange: (next) => void loadHistory(next),
          }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="open"
                  disabled={locked}
                  type="link"
                  onClick={() =>
                    confirmSwitch(() => {
                      setBusy(true);
                      void pageBuilderApi
                        .get(item.id)
                        .then((value) => {
                          apply(value);
                          setRaw('');
                          setInstruction('');
                          setHistoryOpen(false);
                          setError('');
                        })
                        .catch((err) => setError(errorText(err)))
                        .finally(() => setBusy(false));
                    })
                  }
                >
                  停止生成
                </Button>,
                <Popconfirm
                  key="remove"
                  title="删除此页面及其所有版本？"
                  onConfirm={async () => {
                    try {
                      await pageBuilderApi.remove(item.id, item.revision);
                      if (design?.id === item.id) {
                        apply();
                        setRaw('');
                      }
                      await loadHistory();
                    } catch (err) {
                      void message.error(errorText(err));
                    }
                  }}
                >
                  <Button type="link" danger disabled={locked}>
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={item.title}
                description={`版本 ${item.revision} · ${new Date(item.updatedAt).toLocaleString()}`}
              />
            </List.Item>
          )}
        />
      </Drawer>
      <Drawer
        title="页面版本"
        extra={
          <Button loading={busy} onClick={() => void loadVersions()}>
            刷新
          </Button>
        }
        open={versionsOpen}
        width={860}
        onClose={() => setVersionsOpen(false)}
        getContainer={() => document.body}
      >
        <Table
          rowKey="id"
          dataSource={versions}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 650 }}
          columns={[
            { title: '版本', dataIndex: 'id' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value) => <Tag>{versionLabels[value] ?? value}</Tag>,
            },
            { title: '修订号', dataIndex: 'revision' },
            {
              title: '指令',
              dataIndex: 'instruction',
              ellipsis: true,
              render: (value) => value || '无指令',
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              render: (value) => new Date(value).toLocaleString(),
            },
            {
              title: '操作',
              render: (_, item) => (
                <Button
                  type="link"
                  onClick={() => {
                    void pageBuilderApi
                      .version(item.designId, item.id)
                      .then(setViewedVersion)
                      .catch((err) => message.error(errorText(err)));
                  }}
                >
                  查看
                </Button>
              ),
            },
          ]}
        />
      </Drawer>
      <Drawer
        title={`版本 #${viewedVersion?.id ?? ''}`}
        open={!!viewedVersion}
        width="85%"
        onClose={() => setViewedVersion(undefined)}
        extra={
          <Space>
            <Button
              disabled={!viewedVersion?.source}
              onClick={() => download(viewedVersion!.source)}
            >
              下载
            </Button>
            <Button
              type="primary"
              disabled={
                !viewedVersion ||
                (!viewedVersion.source && viewedVersion.status !== 'complete') ||
                locked
              }
              onClick={() =>
                confirmSwitch(() => {
                  setSource(viewedVersion!.source);
                  form.setFieldValue('brief', viewedVersion!.brief);
                  setDirty(true);
                  setViewedVersion(undefined);
                  setVersionsOpen(false);
                  setTab('source');
                })
              }
            >
              使用此版本
            </Button>
          </Space>
        }
        getContainer={() => document.body}
      >
        {viewedVersion?.error && <Alert type="warning" message={viewedVersion.error} />}
        <Tabs
          items={[
            {
              key: 'preview',
              label: '预览',
              children: (
                <Preview
                  html={viewedVersion?.source ? viewedVersion.previewHtml : ''}
                  width="desktop"
                />
              ),
            },
            {
              key: 'source',
              label: '源码',
              children: (
                <Input.TextArea
                  className="page-builder-source"
                  readOnly
                  value={viewedVersion?.source}
                  rows={28}
                />
              ),
            },
            {
              key: 'raw',
              label: '源码',
              children: (
                <Input.TextArea
                  className="page-builder-source"
                  readOnly
                  value={viewedVersion?.rawText}
                  rows={28}
                />
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  );
}
