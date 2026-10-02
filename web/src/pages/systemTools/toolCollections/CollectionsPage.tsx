import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { session } from '../../../api/request';
import { authorityApi } from '../../../api/endpoints';
import {
  bindingForAPI,
  collectionsApi,
  newDefinition,
  type Artifact,
  type Binding,
  type Collection,
  type Definition,
  type Kind,
  type Parameter,
  type RegisteredAPI,
  type Revision,
  type Summary,
  type ValueSchema,
} from './api';
const statuses = [
  { value: 'draft', label: '草稿' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已禁用' },
];
const types = ['string', 'integer', 'number', 'boolean', 'object', 'array'];
type EditableParameter = Parameter & { schemaText: string };
export default function CollectionsPage({ kind }: { kind: Kind }) {
  const { message } = App.useApp();
  const userID = session.getSnapshot()?.ID;
  const [rows, setRows] = useState<Summary[]>([]);
  const [apis, setAPIs] = useState<RegisteredAPI[]>([]);
  const [roles, setRoles] = useState<{ value: number; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Collection | null>(null);
  const [definition, setDefinition] = useState<Definition>(() => newDefinition(kind));
  const [open, setOpen] = useState(false);
  const [selectedAPI, setSelectedAPI] = useState<number>();
  const [parameterIndex, setParameterIndex] = useState<number | null>(null);
  const [parameters, setParameters] = useState<EditableParameter[]>([]);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [previewID, setPreviewID] = useState<number>();
  const [history, setHistory] = useState<{ row: Summary; items: Revision[] } | null>(null);
  const [form] = Form.useForm();
  const sequence = useRef(0);
  const editorSequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const result = await collectionsApi.list(kind);
      if (current === sequence.current) setRows(result.list ?? []);
    } catch {
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [kind]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
      editorSequence.current++;
    };
  }, [load]);
  useEffect(() => {
    let live = true;
    void collectionsApi
      .apis()
      .then((result) => {
        if (live) setAPIs(result.list ?? []);
      })
      .catch(() => {});
    void authorityApi
      .getAuthorityList({ page: 1, pageSize: 100 })
      .then((result) => {
        if (live)
          setRoles(
            result.list.map((role) => ({ value: role.authorityId, label: role.authorityName })),
          );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const patch = (value: Partial<Definition>) =>
    setDefinition((previous) => ({ ...previous, ...value }));
  const start = async (row?: Summary) => {
    const current = ++editorSequence.current;
    try {
      const record = row ? await collectionsApi.get(row.id) : null;
      if (current !== editorSequence.current) return;
      const data = record?.definition ?? newDefinition(kind);
      setEditing(record);
      setDefinition(data);
      form.resetFields();
      form.setFieldsValue(data);
      setSelectedAPI(undefined);
      setOpen(true);
    } catch {}
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      if (!definition.bindings.length) {
        message.error('请先添加至少一个API');
        return;
      }
      setSaving(true);
      const result = await collectionsApi.save(
        editing?.id,
        { ...definition, ...values, kind },
        editing?.lockVersion ?? 0,
      );
      setEditing(result);
      setDefinition(result.definition);
      setOpen(false);
      message.success('保存成功');
      void load();
    } catch {
    } finally {
      setSaving(false);
    }
  };
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await operation();
      message.success('操作成功');
      void load();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const updateBinding = (index: number, value: Partial<Binding>) =>
    patch({
      bindings: definition.bindings.map((binding, current) =>
        current === index ? { ...binding, ...value } : binding,
      ),
    });
  const configure = (index: number) => {
    setParameterIndex(index);
    setParameters(
      definition.bindings[index].parameters.map((parameter) => ({
        ...parameter,
        schemaText: JSON.stringify(parameter.schema, null, 2),
      })),
    );
  };
  const saveParameters = () => {
    try {
      const parsed = parameters.map(({ schemaText, ...parameter }) => ({
        ...parameter,
        schema: JSON.parse(schemaText) as ValueSchema,
      }));
      if (parameterIndex !== null) updateBinding(parameterIndex, { parameters: parsed });
      setParameterIndex(null);
    } catch {
      message.error('参数schema不是合法的JSON');
    }
  };
  const apiOptions = apis.map((api) => ({
    value: api.id,
    label: `${api.apiGroup} · ${api.method} ${api.path} · ${api.description}`,
  }));
  const title = 'AI CLI 管理';
  const filtered = rows.filter((row) =>
    (row.name + row.displayName).toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message={'管理 API、CLI 工具和技能集合'}
        description="预览、下载、调用 API。查看详情；服务地址、签名与 Token 配置。"
      />
      <Card
        title={title}
        extra={
          <Space>
            <Input.Search
              placeholder="输入名称进行搜索"
              allowClear
              onChange={(event) => setFilter(event.target.value)}
              style={{ width: 220 }}
            />
            <Button onClick={() => void load()} loading={loading}>
              刷新
            </Button>
            <Button type="primary" onClick={() => void start()}>
              创建{'CLI'}
            </Button>
          </Space>
        }
      >
        <Table<Summary>
          rowKey="id"
          dataSource={filtered}
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 条` }}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '显示名称', dataIndex: 'displayName' },
            {
              title: '版本',
              dataIndex: 'version',
              render: (value, row) => (
                <Space>
                  {value}
                  <Tag>r{row.lockVersion}</Tag>
                </Space>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value) => (
                <Tag
                  color={
                    value === 'enabled' ? 'green' : value === 'disabled' ? 'default' : 'orange'
                  }
                >
                  {statuses.find((status) => status.value === value)?.label}
                </Tag>
              ),
            },
            { title: 'API 数量', dataIndex: 'apiCount', width: 80 },
            {
              title: '操作',
              width: 410,
              render: (_, row) => (
                <Space wrap>
                  {row.ownerId === userID && (
                    <Button
                      type="link"
                      size="small"
                      disabled={!row.accessible}
                      onClick={() => void start(row)}
                    >
                      编辑
                    </Button>
                  )}
                  <Button
                    type="link"
                    size="small"
                    disabled={!row.accessible}
                    onClick={() => {
                      void collectionsApi
                        .preview(row.id)
                        .then((result) => {
                          setArtifact(result);
                          setPreviewID(row.id);
                        })
                        .catch(() => {});
                    }}
                  >
                    预览
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    disabled={!row.accessible}
                    onClick={() =>
                      void collectionsApi.download(row.id, row.lockVersion).catch(() => {})
                    }
                  >
                    下载
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    disabled={!row.accessible}
                    onClick={() => {
                      void collectionsApi
                        .history(row.id)
                        .then((result) => setHistory({ row, items: result.list }))
                        .catch(() => {});
                    }}
                  >
                    版本历史
                  </Button>
                  {!row.accessible && <Tag color="warning">无API权限</Tag>}
                  {row.ownerId === userID && (
                    <Popconfirm
                      title="确定要调用删除接口，删除该记录吗？"
                      onConfirm={() => mutate(() => collectionsApi.remove(row))}
                    >
                      <Button type="link" size="small" danger disabled={busy}>
                        删除
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Drawer
        title={`${editing ? '编辑' : '创建'}${'CLI'}集合`}
        width={1050}
        open={open}
        onClose={() => {
          if (!saving) {
            editorSequence.current++;
            setOpen(false);
          }
        }}
        extra={
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        }
        getContainer={() => document.body}
      >
        <Form form={form} layout="vertical" disabled={saving}>
          <Space align="start" style={{ width: '100%' }} wrap>
            <Form.Item
              name="name"
              label="名称"
              rules={[
                {
                  required: true,
                  pattern: /^[a-z][a-z0-9_-]{0,63}$/,
                  message: '请输入名称，仅支持小写字母、数字、下划线和连字符',
                },
              ]}
            >
              <Input placeholder="请输入 CLI 工具标识名" style={{ width: 260 }} />
            </Form.Item>
            <Form.Item name="displayName" label="显示名称" rules={[{ required: true }]}>
              <Input maxLength={100} style={{ width: 260 }} />
            </Form.Item>
            <Form.Item name="version" label="版本" rules={[{ required: true }]}>
              <Input placeholder="1.0.0" style={{ width: 130 }} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select options={statuses} style={{ width: 130 }} />
            </Form.Item>
          </Space>
          {kind === 'cli' && (
            <>
              <Space align="start">
                <Form.Item name="command" label="命令" rules={[{ required: true }]}>
                  <Input placeholder="请输入 CLI 启动命令" style={{ width: 260 }} />
                </Form.Item>
                <Form.Item name="skillName" label="技能名称" rules={[{ required: true }]}>
                  <Input placeholder="请输入技能名称" style={{ width: 260 }} />
                </Form.Item>
              </Space>
              <Form.Item name="skillDescription" label="技能描述" rules={[{ required: true }]}>
                <Input.TextArea rows={2} maxLength={1000} />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="sharedRoleIds"
            label="共享角色"
            extra="启用后，所选角色可查看该集合的详情及 API 调用权限。"
          >
            <Select mode="multiple" allowClear options={roles} />
          </Form.Item>
        </Form>
        <Space style={{ marginBottom: 16, width: '100%' }}>
          <Select
            showSearch
            optionFilterProp="label="
            placeholder="搜索并选择接口"
            options={apiOptions}
            value={selectedAPI}
            onChange={setSelectedAPI}
            style={{ width: 700 }}
          />
          <Button
            disabled={!selectedAPI || saving}
            onClick={() => {
              const api = apis.find((item) => item.id === selectedAPI);
              if (!api) return;
              let binding = bindingForAPI(api);
              let suffix = 2;
              while (definition.bindings.some((item) => item.name === binding.name)) {
                binding = { ...binding, name: `api_${api.id}_${suffix++}` };
              }
              patch({ bindings: [...definition.bindings, binding] });
              setSelectedAPI(undefined);
            }}
          >
            添加接口
          </Button>
        </Space>
        <Table<Binding>
          rowKey={(row) => String(definition.bindings.indexOf(row))}
          pagination={false}
          dataSource={definition.bindings}
          columns={[
            {
              title: '接口',
              width: 290,
              render: (_, binding) => {
                const api = apis.find((item) => item.id === binding.apiId);
                return (
                  <Typography.Text code>
                    {api?.method ?? binding.method} {api?.path ?? binding.path}
                  </Typography.Text>
                );
              },
            },
            {
              title: '接口名称',
              width: 175,
              render: (_, binding, index) => (
                <Input
                  value={binding.name}
                  onChange={(event) => updateBinding(index, { name: event.target.value })}
                />
              ),
            },
            {
              title: '描述',
              render: (_, binding, index) => (
                <Input
                  value={binding.description}
                  onChange={(event) => updateBinding(index, { description: event.target.value })}
                />
              ),
            },
            {
              title: '参数',
              width: 105,
              render: (_, binding, index) => (
                <Button onClick={() => configure(index)}>配置 ({binding.parameters.length})</Button>
              ),
            },
            {
              title: '操作',
              width: 70,
              render: (_, __, index) => (
                <Button
                  danger
                  type="link"
                  onClick={() =>
                    patch({
                      bindings: definition.bindings.filter((_, current) => current !== index),
                    })
                  }
                >
                  移除
                </Button>
              ),
            },
          ]}
        />
      </Drawer>
      <Modal
        title="配置接口参数"
        width={1050}
        open={parameterIndex !== null}
        onCancel={() => setParameterIndex(null)}
        onOk={saveParameters}
        okText="保存参数"
      >
        <Alert
          type="info"
          message="参数可位于 path、query 或 body 中，支持 JSON 格式。object 类型可直接编辑 schema；参数名称、字段详情等。"
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical" style={{ width: '100%' }}>
          {parameters.map((parameter, index) => (
            <Card
              key={index}
              size="small"
              extra={
                <Button
                  type="link"
                  danger
                  onClick={() =>
                    setParameters((previous) => previous.filter((_, current) => current !== index))
                  }
                >
                  移除参数
                </Button>
              }
            >
              <Space wrap>
                <Input
                  placeholder="参数名称"
                  value={parameter.name}
                  style={{ width: 180 }}
                  onChange={(event) =>
                    setParameters((previous) =>
                      previous.map((item, current) =>
                        current === index ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Select
                  value={parameter.in}
                  style={{ width: 100 }}
                  options={['path', 'query', 'body'].map((value) => ({ value, label: value }))}
                  onChange={(value) =>
                    setParameters((previous) =>
                      previous.map((item, current) =>
                        current === index ? { ...item, in: value } : item,
                      ),
                    )
                  }
                />
                <Select
                  value={parameter.schema.type}
                  style={{ width: 130 }}
                  options={types.map((value) => ({ value, label: value }))}
                  onChange={(type) => {
                    const schema: ValueSchema =
                      type === 'object'
                        ? { type, properties: {}, required: [] }
                        : type === 'array'
                          ? { type, items: { type: 'string' } }
                          : { type };
                    setParameters((previous) =>
                      previous.map((item, current) =>
                        current === index
                          ? { ...item, schema, schemaText: JSON.stringify(schema, null, 2) }
                          : item,
                      ),
                    );
                  }}
                />
                <Checkbox
                  checked={parameter.required}
                  onChange={(event) =>
                    setParameters((previous) =>
                      previous.map((item, current) =>
                        current === index ? { ...item, required: event.target.checked } : item,
                      ),
                    )
                  }
                >
                  必需
                </Checkbox>
                <Input
                  placeholder="参数描述"
                  value={parameter.description}
                  style={{ width: 310 }}
                  onChange={(event) =>
                    setParameters((previous) =>
                      previous.map((item, current) =>
                        current === index ? { ...item, description: event.target.value } : item,
                      ),
                    )
                  }
                />
              </Space>
              <Input.TextArea
                value={parameter.schemaText}
                rows={
                  parameter.schema.type === 'object' || parameter.schema.type === 'array' ? 5 : 2
                }
                style={{ fontFamily: 'monospace', marginTop: 10 }}
                onChange={(event) =>
                  setParameters((previous) =>
                    previous.map((item, current) =>
                      current === index ? { ...item, schemaText: event.target.value } : item,
                    ),
                  )
                }
              />
            </Card>
          ))}
          <Button
            onClick={() =>
              setParameters((previous) => [
                ...previous,
                {
                  name: '',
                  in: 'query',
                  description: '',
                  required: false,
                  schema: { type: 'string' },
                  schemaText: '{"type":"string"}',
                },
              ])
            }
          >
            添加参数
          </Button>
        </Space>
      </Modal>
      <Modal
        title={`preview · r${artifact?.revision ?? ''}`}
        width="90vw"
        open={!!artifact}
        onCancel={() => setArtifact(null)}
        footer={
          <Button
            type="primary"
            onClick={() => {
              if (previewID)
                void collectionsApi.download(previewID, artifact?.revision).catch(() => {});
            }}
          >
            下载所有文件
          </Button>
        }
      >
        <Alert type="warning" showIcon message={artifact?.warning} style={{ marginBottom: 12 }} />
        <Tabs
          items={Object.entries(artifact?.files ?? {}).map(([name, content]) => ({
            key: name,
            label: name,
            children: (
              <pre
                style={{
                  maxHeight: '60vh',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {content}
              </pre>
            ),
          }))}
        />
      </Modal>
      <Modal
        title="版本信息"
        open={!!history}
        onCancel={() => setHistory(null)}
        footer={null}
        width={700}
      >
        <Table<Revision>
          rowKey="revision"
          dataSource={history?.items ?? []}
          columns={[
            { title: '版本号', dataIndex: 'revision', render: (value) => `r${value}` },
            { title: '版本', dataIndex: 'version' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value) => statuses.find((status) => status.value === value)?.label,
            },
            {
              title: '提交消息',
              dataIndex: 'createdAt',
              render: (value) => new Date(value).toLocaleString(),
            },
            {
              title: '操作',
              render: (_, row) =>
                history?.row.ownerId === userID && (
                  <Popconfirm
                    title="版本历史，是否保留此版本？查看详情？"
                    onConfirm={() =>
                      mutate(async () => {
                        if (!history) return;
                        await collectionsApi.restore(
                          history.row.id,
                          row.revision,
                          history.row.lockVersion,
                        );
                        setHistory(null);
                      })
                    }
                  >
                    <Button type="link" disabled={busy}>
                      恢复
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
          pagination={false}
        />
      </Modal>
    </Space>
  );
}
