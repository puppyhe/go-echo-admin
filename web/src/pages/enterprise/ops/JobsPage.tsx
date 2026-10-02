import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import {
  opsApi,
  type Definition,
  type Job,
  type ListQuery,
  type Method,
  type Page,
  type Run,
  type Settings,
  type Template,
} from './api';
import {
  defaultDefinition,
  editorValues,
  running,
  statusLabels,
  taskDefinition,
  type EditorValues,
} from './model';
import { formatTime, LoadError } from '../shared';

const emptyPage = <T,>(): Page<T> => ({ list: [], total: 0, page: 1, pageSize: 20 });
type Editor = { kind: 'job' | 'template'; current?: Job | Template };
export default function JobsPage() {
  const { message } = App.useApp();
  const [tab, setTab] = useState('jobs');
  const [jobs, setJobs] = useState<Page<Job>>(emptyPage);
  const [runs, setRuns] = useState<Page<Run>>(emptyPage);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [settings, setSettings] = useState<Settings>();
  const [jobQuery, setJobQuery] = useState<ListQuery>({ page: 1, pageSize: 20 });
  const [runQuery, setRunQuery] = useState<ListQuery>({ page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detail, setDetail] = useState<Run>();
  const [detailError, setDetailError] = useState('');
  const [form] = Form.useForm<EditorValues>();
  const [settingsForm] = Form.useForm<Settings>();
  const executor = Form.useWatch('executor', form);
  const serial = useRef(0);
  const load = useCallback(async () => {
    const current = ++serial.current;
    setLoading(true);
    setError('');
    try {
      const [config, templateData, jobData, runData] = await Promise.all([
        opsApi.settings(),
        opsApi.templates(),
        opsApi.jobs(jobQuery),
        opsApi.runs(runQuery),
      ]);
      if (current === serial.current) {
        setSettings(config);
        setTemplates(templateData.list ?? []);
        setMethods(templateData.methods ?? []);
        setJobs(jobData);
        setRuns(runData);
      }
    } catch (e) {
      if (current === serial.current)
        setError(e instanceof Error ? e.message : '任务请求失败');
    } finally {
      if (current === serial.current) setLoading(false);
    }
  }, [jobQuery, runQuery]);
  useEffect(() => {
    void load();
    return () => {
      serial.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!detail || !running(detail.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      void opsApi
        .runDetail(detail.id)
        .then((value) => {
          if (active) {
            setDetail(value);
            if (!running(value.status)) void load();
          }
        })
        .catch((e: unknown) => {
          if (active) setDetailError(e instanceof Error ? e.message : '状态请求失败');
        });
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [detail?.id, detail?.status, load]);
  const openEditor = async (
    kind: Editor['kind'],
    current?: Job | Template,
    preset?: Definition,
  ) => {
    if (kind === 'job' && current) {
      try {
        current = await opsApi.job(current.id);
      } catch {
        return;
      }
    }
    form.resetFields();
    form.setFieldsValue(editorValues(preset ?? current?.definition ?? defaultDefinition));
    setEditor({ kind, current });
  };
  const save = async () => {
    if (!editor) return;
    try {
      const definition = taskDefinition(await form.validateFields());
      setBusy(true);
      if (editor.kind === 'job') await opsApi.saveJob(definition, editor.current);
      else await opsApi.saveTemplate(definition, editor.current);
      message.success(editor.kind === 'job' ? '保存成功' : '保存成功');
      setEditor(undefined);
      await load();
    } catch (e) {
      if (e instanceof Error && e.name !== 'ApiError') message.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const showRun = async (id: number) => {
    setDetailError('');
    try {
      setDetail(await opsApi.runDetail(id));
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : '请求失败');
    }
  };
  const trigger = async (job: Job) => {
    try {
      const run = await opsApi.run(job.id);
      setDetailError('');
      setDetail(run);
      message.success('任务已提交');
      await load();
    } catch {
      /* request helper displays failure */
    }
  };
  const pagination = <T,>(
    data: Page<T>,
    query: ListQuery,
    setQuery: (value: ListQuery) => void,
  ) => ({
    current: query.page,
    pageSize: query.pageSize,
    total: data.total,
    showSizeChanger: true,
    showTotal: (total: number) => `共 ${total} 条`,
    onChange: (page: number, pageSize: number) => setQuery({ ...query, page, pageSize }),
  });
  return (
    <div style={{ padding: 20 }}>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          任务管理
        </Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            刷新
          </Button>
          <Button
            icon={<SettingOutlined />}
            disabled={!settings}
            onClick={() => {
              settingsForm.setFieldsValue(settings!);
              setSettingsOpen(true);
            }}
          >
            配置
          </Button>
        </Space>
      </Space>
      <Alert
        type={settings?.workerEnabled ? 'success' : 'info'}
        showIcon
        message={
          settings
            ? `${settings.workerEnabled ? '已启用' : '已关闭'} · HTTP ${settings.httpEnabled ? '已启用' : '已关闭'}`
            : '配置'
        }
        description="任务详情。默认不启用。"
        style={{ marginBottom: 16 }}
      />
      <LoadError error={error} retry={load} />
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'jobs',
            label: '任务管理',
            children: (
              <>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Input.Search
                    allowClear
                    placeholder="搜索任务名称"
                    onSearch={(keyword) => setJobQuery({ ...jobQuery, keyword, page: 1 })}
                    style={{ width: 240 }}
                  />
                  <Select
                    allowClear
                    placeholder="执行方式"
                    style={{ width: 130 }}
                    options={[
                      { value: 'method', label: 'Method' },
                      { value: 'http', label: 'HTTP' },
                    ]}
                    onChange={(executor) => setJobQuery({ ...jobQuery, executor, page: 1 })}
                  />
                  <Select
                    allowClear
                    placeholder="启用状态"
                    style={{ width: 130 }}
                    options={[
                      { value: 'yes', label: '启用' },
                      { value: 'no', label: '禁用' },
                    ]}
                    onChange={(value) =>
                      setJobQuery({
                        ...jobQuery,
                        enabled: value === undefined ? undefined : value === 'yes',
                        page: 1,
                      })
                    }
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => void openEditor('job')}
                  >
                    新建任务
                  </Button>
                  <Select
                    placeholder="从模板创建"
                    style={{ width: 200 }}
                    value={undefined}
                    options={templates.map((item) => ({ value: item.key, label: item.name }))}
                    onChange={(key) => {
                      const item = templates.find((item) => item.key === key);
                      if (item) void openEditor('job', undefined, item.definition);
                    }}
                  />
                </Space>
                <Table<Job>
                  rowKey="id"
                  dataSource={jobs.list}
                  loading={loading}
                  scroll={{ x: 1300 }}
                  pagination={pagination(jobs, jobQuery, setJobQuery)}
                  columns={[
                    {
                      title: '任务',
                      dataIndex: 'name',
                      render: (name, row) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text strong>{name}</Typography.Text>
                          <Typography.Text type="secondary">
                            {row.group || '—'} · R{row.revision}
                          </Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: '执行方式',
                      render: (_, row) =>
                        row.executor === 'http' ? (
                          <Tag color="blue">HTTP · {row.definition.http.method}</Tag>
                        ) : (
                          <Tag>
                            {methods.find((item) => item.key === row.definition.methodKey)?.name ??
                              row.definition.methodKey}
                          </Tag>
                        ),
                    },
                    {
                      title: 'Cron / 时区',
                      render: (_, row) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text code>{row.definition.cron}</Typography.Text>
                          <Typography.Text type="secondary">
                            {row.definition.timezone}
                          </Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: '启用状态',
                      render: (_, row) => (
                        <Space>
                          <Switch
                            size="small"
                            checked={row.enabled}
                            checkedChildren="启用"
                            unCheckedChildren="禁用"
                            onChange={async (enabled) => {
                              try {
                                await opsApi.enabled(row, enabled);
                                await load();
                              } catch {
                                /* request helper */
                              }
                            }}
                          />
                          {row.activeRunId > 0 && (
                            <Button type="link" onClick={() => void showRun(row.activeRunId)}>
                              #{row.activeRunId}
                            </Button>
                          )}
                        </Space>
                      ),
                    },
                    {
                      title: '下次运行 / 上次运行',
                      render: (_, row) => (
                        <Space direction="vertical" size={0}>
                          <span>{formatTime(row.nextRunAt)}</span>
                          <Typography.Text type="secondary">
                            {formatTime(row.lastRunAt)}
                          </Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: '操作',
                      width: 290,
                      render: (_, row) => (
                        <Space size={0}>
                          <Button
                            type="link"
                            disabled={!!row.activeRunId}
                            onClick={() => void openEditor('job', row)}
                          >
                            编辑
                          </Button>
                          <Popconfirm
                            title="确认触发任务？"
                            description={
                              row.executor === 'http' ? 'HTTP 任务需要配置权限。' : undefined
                            }
                            onConfirm={() => trigger(row)}
                          >
                            <Button type="link" disabled={!!row.activeRunId}>
                              触发
                            </Button>
                          </Popconfirm>
                          <Button
                            type="link"
                            onClick={() => {
                              setRunQuery({ page: 1, pageSize: 20, jobId: row.id });
                              setTab('runs');
                            }}
                          >
                            运行记录
                          </Button>
                          <Popconfirm
                            title="确认删除任务？将保留运行记录。"
                            onConfirm={async () => {
                              await opsApi.deleteJob(row.id);
                              await load();
                            }}
                          >
                            <Button type="link" danger disabled={!!row.activeRunId}>
                              删除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'templates',
            label: '模板管理',
            children: (
              <>
                <Button
                  icon={<PlusOutlined />}
                  type="primary"
                  style={{ marginBottom: 16 }}
                  onClick={() => void openEditor('template')}
                >
                  新建模板
                </Button>
                <Table<Template>
                  rowKey="key"
                  dataSource={templates}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    {
                      title: '类型',
                      render: (_, row) => <Tag>{row.builtin ? '内置' : '自定义'}</Tag>,
                    },
                    {
                      title: '执行方式',
                      render: (_, row) =>
                        row.definition.executor === 'http' ? 'HTTP' : row.definition.methodKey,
                    },
                    {
                      title: 'Cron',
                      render: (_, row) => (
                        <Typography.Text code>{row.definition.cron}</Typography.Text>
                      ),
                    },
                    {
                      title: '操作',
                      render: (_, row) => (
                        <Space>
                          <Button
                            type="link"
                            onClick={() => void openEditor('job', undefined, row.definition)}
                          >
                            创建任务
                          </Button>
                          {!row.builtin && (
                            <>
                              <Button type="link" onClick={() => void openEditor('template', row)}>
                                编辑
                              </Button>
                              <Popconfirm
                                title="确认删除模板？创建的任务将保持原样。"
                                onConfirm={async () => {
                                  await opsApi.deleteTemplate(row.id);
                                  await load();
                                }}
                              >
                                <Button type="link" danger>
                                  删除
                                </Button>
                              </Popconfirm>
                            </>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'runs',
            label: '运行记录',
            children: (
              <>
                <Form
                  layout="inline"
                  style={{ gap: 12, marginBottom: 16 }}
                  onFinish={(values: {
                    keyword?: string;
                    status?: string;
                    trigger?: string;
                    dates?: [Dayjs, Dayjs];
                  }) =>
                    setRunQuery({
                      page: 1,
                      pageSize: runQuery.pageSize,
                      jobId: runQuery.jobId,
                      keyword: values.keyword,
                      status: values.status,
                      trigger: values.trigger,
                      startCreatedAt: values.dates?.[0].startOf('day').toISOString(),
                      endCreatedAt: values.dates?.[1].endOf('day').toISOString(),
                    })
                  }
                >
                  <Form.Item name="keyword">
                    <Input allowClear placeholder="任务名称" />
                  </Form.Item>
                  <Form.Item name="status">
                    <Select
                      allowClear
                      placeholder="状态"
                      style={{ width: 140 }}
                      options={Object.entries(statusLabels).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name="trigger">
                    <Select
                      allowClear
                      placeholder="触发方式"
                      style={{ width: 130 }}
                      options={[
                        { value: 'manual', label: '手动' },
                        { value: 'cron', label: 'Cron' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="dates">
                    <DatePicker.RangePicker />
                  </Form.Item>
                  <Form.Item>
                    <Button htmlType="submit" type="primary">
                      查询
                    </Button>
                  </Form.Item>
                  {runQuery.jobId && (
                    <Tag closable onClose={() => setRunQuery({ page: 1, pageSize: 20 })}>
                      任务 #{runQuery.jobId}
                    </Tag>
                  )}
                </Form>
                <Table<Run>
                  rowKey="id"
                  dataSource={runs.list}
                  loading={loading}
                  pagination={pagination(runs, runQuery, setRunQuery)}
                  scroll={{ x: 1150 }}
                  columns={[
                    { title: 'ID', dataIndex: 'id' },
                    { title: '任务', dataIndex: 'jobName' },
                    { title: '版本', dataIndex: 'jobRevision', render: (value) => `R${value}` },
                    {
                      title: '触发方式',
                      dataIndex: 'trigger',
                      render: (value) => (value === 'cron' ? 'Cron' : '手动'),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (value) => (
                        <Tag
                          color={value === 'success' ? 'green' : running(value) ? 'blue' : 'red'}
                        >
                          {statusLabels[value] ?? value}
                        </Tag>
                      ),
                    },
                    { title: '创建时间', dataIndex: 'createdAt', render: formatTime },
                    { title: '耗时', dataIndex: 'durationMs', render: (value) => `${value} ms` },
                    {
                      title: '错误信息',
                      render: (_, row) =>
                        row.error || (row.httpStatus ? `HTTP ${row.httpStatus}` : '—'),
                    },
                    {
                      title: '操作',
                      render: (_, row) => (
                        <Button type="link" onClick={() => void showRun(row.id)}>
                          详情
                        </Button>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Drawer
        width="min(850px,96vw)"
        title={`${editor?.current ? '编辑' : '新建'}${editor?.kind === 'template' ? '模板' : '任务'}`}
        open={!!editor}
        onClose={() => {
          if (!busy) setEditor(undefined);
        }}
        extra={
          <Button type="primary" loading={busy} onClick={() => void save()}>
            保存
          </Button>
        }
        getContainer={() => document.body}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="name" label="任务名称" rules={[{ required: true, max: 120 }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="group" label="分组" rules={[{ max: 80 }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="executor" label="执行方式" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'method', label: 'Method' },
                { value: 'http', label: 'HTTP 请求' },
              ]}
            />
          </Form.Item>
          {executor === 'method' ? (
            <Form.Item
              name="methodKey"
              label="方法"
              rules={[{ required: true }]}
              extra={
                methods.find((item) => item.key === form.getFieldValue('methodKey'))?.description
              }
            >
              <Select
                options={methods.map((item) => ({
                  value: item.key,
                  label: `${item.name} (${item.key})`,
                }))}
                onChange={(key) => {
                  const item = methods.find((item) => item.key === key);
                  form.setFieldValue(
                    'parametersJSON',
                    JSON.stringify(item?.example ?? {}, null, 2),
                  );
                }}
              />
            </Form.Item>
          ) : (
            <Card size="small" title="HTTP 请求" style={{ marginBottom: 20 }}>
              <Alert
                type="info"
                showIcon
                message="支持 HTTPS 443 地址，建议配置请求和响应。"
                style={{ marginBottom: 12 }}
              />
              <Form.Item name="url" label="地址" rules={[{ required: true, type: 'url' }]}>
                <Input placeholder="https://api.example.com/jobs" />
              </Form.Item>
              <Form.Item name="httpMethod" label="请求方法" rules={[{ required: true }]}>
                <Select
                  options={['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="headersJSON"
                label="请求头 JSON"
                extra="建议设置 Accept、Content-Type 等头部信息。"
              >
                <Input.TextArea rows={3} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Card>
          )}
          <Form.Item
            name="parametersJSON"
            label={executor === 'http' ? '请求体 JSON' : '参数 JSON'}
            extra={
              executor === 'http'
                ? 'GET/HEAD 请求请留空 {}，查询参数放在地址栏。'
                : '参数由方法定义。'
            }
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={6} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={15}>
              <Form.Item
                name="cron"
                label="Cron 表达式"
                rules={[{ required: true }]}
                extra="格式：分 时 日 月 周；注意：秒可选用 6 位格式。"
              >
                <Input placeholder="*/5 * * * *" />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item name="timezone" label="时区" rules={[{ required: true }]}>
                <Select
                  showSearch
                  options={[
                    'Asia/Shanghai',
                    'UTC',
                    'Asia/Tokyo',
                    'Europe/London',
                    'America/New_York',
                  ].map((value) => ({ value, label: value }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="timeoutSeconds"
            label="超时（秒）"
            rules={[{ required: true, type: 'number', min: 1, max: 300 }]}
          >
            <InputNumber min={1} max={300} precision={0} />
          </Form.Item>
        </Form>
      </Drawer>
      <Modal
        title="系统配置"
        open={settingsOpen}
        confirmLoading={busy}
        onCancel={() => {
          if (!busy) setSettingsOpen(false);
        }}
        onOk={async () => {
          try {
            const values = await settingsForm.validateFields();
            setBusy(true);
            const saved = await opsApi.saveSettings({
              ...values,
              revision: settings?.revision ?? 0,
            });
            setSettings(saved);
            setSettingsOpen(false);
            message.success('配置保存成功');
          } catch {
            /* form/request helper */
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form form={settingsForm} layout="vertical">
          <Form.Item
            name="workerEnabled"
            label="Cron 任务"
            valuePropName="checked"
            extra="关闭时将暂停所有 Cron 任务。"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="httpEnabled" label="HTTP 接口" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="allowedHosts"
            label="允许的主机"
            extra="配置允许请求的 API 主机，用逗号分隔。"
          >
            <Select mode="tags" tokenSeparators={[',', '，', ' ']} placeholder="api.example.com" />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        title={`运行 #${detail?.id ?? ''}`}
        open={!!detail}
        width="min(800px,96vw)"
        onClose={() => setDetail(undefined)}
        extra={<Button onClick={() => detail && void showRun(detail.id)}>刷新</Button>}
        getContainer={() => document.body}
      >
        <LoadError error={detailError} retry={() => detail && showRun(detail.id)} />
        {detail && (
          <>
            <Descriptions
              bordered
              column={2}
              size="small"
              items={[
                { key: 'job', label: '任务', children: detail.jobName },
                { key: 'revision', label: '任务版本', children: `R${detail.jobRevision}` },
                {
                  key: 'status',
                  label: '状态',
                  children: statusLabels[detail.status] ?? detail.status,
                },
                { key: 'actor', label: '用户', children: `#${detail.actorId}` },
                { key: 'start', label: '开始时间', children: formatTime(detail.startedAt) },
                { key: 'end', label: '结束时间', children: formatTime(detail.finishedAt) },
                { key: 'duration', label: '耗时', children: `${detail.durationMs} ms` },
                { key: 'http', label: 'HTTP 状态', children: detail.httpStatus || '—' },
                { key: 'bytes', label: '响应大小', children: `${detail.responseBytes} 字节` },
                {
                  key: 'key',
                  label: '触发键',
                  span: 2,
                  children: (
                    <Typography.Text copyable style={{ wordBreak: 'break-all' }}>
                      {detail.occurrenceKey}
                    </Typography.Text>
                  ),
                },
              ]}
            />
            {detail.error && (
              <Alert
                style={{ marginTop: 16 }}
                type="error"
                showIcon
                message={detail.error}
                description={detail.errorCode}
              />
            )}
            <Typography.Title level={5}>结果</Typography.Title>
            <Input.TextArea
              readOnly
              value={JSON.stringify(detail.result ?? {}, null, 2)}
              autoSize={{ minRows: 4, maxRows: 20 }}
              style={{ fontFamily: 'monospace' }}
            />
            {running(detail.status) && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                状态每 2 秒自动刷新。
              </Typography.Paragraph>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
