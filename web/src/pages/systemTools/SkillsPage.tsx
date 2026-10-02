// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Skill documents, resources and attachments within the configured workspace.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tabs,
  Typography,
} from 'antd';
import {
  CloudDownloadOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { skillsApi, type SkillDetail, type SysSkill } from '../../api/endpoints';

// Internal implementation detail.
type FileKind = 'scripts' | 'resources' | 'references' | 'templates';

// Internal implementation detail.
interface SkillFileApis {
  create: (data: {
    name: string;
    fileName: string;
    scriptType?: string;
  }) => Promise<{ fileName: string; content: string }>;
  get: (data: { name: string; fileName: string }) => Promise<string>;
  save: (data: { name: string; fileName: string; content: string }) => Promise<void>;
}

const KIND_CONFIG: Record<FileKind, { label: string; hint: string; apis: SkillFileApis }> = {
  scripts: {
    label: '脚本',
    hint: '工作流校验的入口脚本，详见 SKILL.md 中 scripts/ 目录下的文件（后缀为 py/js/sh）。',
    apis: {
      create: (d) =>
        skillsApi.createScript({
          name: d.name,
          fileName: d.fileName,
          scriptType: d.scriptType ?? 'py',
        }),
      get: skillsApi.getScript,
      save: skillsApi.saveScript,
    },
  },
  resources: {
    label: '资源',
    hint: '资源文件，为模型提供额外的上下文资料（resources/ 目录，后缀为 .md）。',
    apis: {
      create: (d) => skillsApi.createResource({ name: d.name, fileName: d.fileName }),
      get: skillsApi.getResource,
      save: skillsApi.saveResource,
    },
  },
  references: {
    label: '参考文档',
    hint: '参考资料与引用文档，按需查阅的详细说明（references/ 目录，后缀为 .md）。',
    apis: {
      create: (d) => skillsApi.createReference({ name: d.name, fileName: d.fileName }),
      get: skillsApi.getReference,
      save: skillsApi.saveReference,
    },
  },
  templates: {
    label: '模板',
    hint: '模板文件，可被反复复用的内容骨架（templates/ 目录，后缀为 .md）。',
    apis: {
      create: (d) => skillsApi.createTemplate({ name: d.name, fileName: d.fileName }),
      get: skillsApi.getTemplate,
      save: skillsApi.saveTemplate,
    },
  },
};

// Internal implementation detail.
const SCRIPT_TYPE_OPTIONS = [
  { label: 'Python (.py)', value: 'py' },
  { label: 'JavaScript (.js)', value: 'js' },
  { label: 'Shell (.sh)', value: 'sh' },
];

// Internal implementation detail.
interface NewSkillValues {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  status?: boolean;
}

// Internal implementation detail.
interface NewFileValues {
  fileName: string;
  scriptType?: string;
}

// Internal implementation detail.
function SkillFilesTab({
  skill,
  kind,
  files,
  onChanged,
}: {
  skill: string;
  kind: FileKind;
  files: Record<string, string>;
  onChanged: () => void;
}) {
  const { message } = App.useApp();
  const cfg = KIND_CONFIG[kind];
  const [selected, setSelected] = useState('');
  const [content, setContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<NewFileValues>();
  // Internal implementation detail.
  const pendingRef = useRef('');
  const fileSequence = useRef(0);
  const [fileReady, setFileReady] = useState(false);
  const [fileError, setFileError] = useState('');
  useEffect(
    () => () => {
      fileSequence.current++;
    },
    [],
  );

  const fileNames = useMemo(() => Object.keys(files ?? {}).sort(), [files]);

  const loadFile = useCallback(
    async (fileName: string) => {
      const current = ++fileSequence.current;
      setSelected(fileName);
      setFileReady(false);
      setFileError('');
      setContent('');
      if (!fileName) {
        setContent('');
        return;
      }
      setLoadingFile(true);
      try {
        const text = await cfg.apis.get({ name: skill, fileName });
        if (current !== fileSequence.current) return;
        setContent(text); // Empty content is a valid server value.
        setFileReady(true);
      } catch (error) {
        if (current === fileSequence.current)
          setFileError(error instanceof Error ? error.message : '文件请求失败，请重试');
      } finally {
        if (current === fileSequence.current) setLoadingFile(false);
      }
    },
    [cfg.apis, skill, files],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    if (pending) {
      if (fileNames.includes(pending)) {
        pendingRef.current = '';
        void loadFile(pending);
      }
      return; // documentationcreate newdocumentationfiledocumentationrefreshdocumentationlistdocumentation
    }
    if (!selected || !fileNames.includes(selected)) {
      if (fileNames.length > 0) void loadFile(fileNames[0]);
      else {
        setSelected('');
        setContent('');
      }
    }
  }, [fileNames, selected, loadFile]);

  // Internal implementation detail.
  useEffect(() => {
    pendingRef.current = '';
  }, [skill]);

  const onSave = async () => {
    if (!selected || !fileReady || loadingFile) return;
    setSaving(true);
    try {
      await cfg.apis.save({ name: skill, fileName: selected, content });
      message.success('保存成功');
      onChanged();
    } catch {
      // Internal implementation detail.
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    form.resetFields();
    setCreateOpen(true);
  };

  const onCreate = async () => {
    const values = await form.validateFields();
    setCreating(true);
    try {
      const res = await cfg.apis.create({
        name: skill,
        fileName: values.fileName,
        scriptType: values.scriptType,
      });
      pendingRef.current = res.fileName;
      setSelected('');
      setContent('');
      setCreateOpen(false);
      message.success(`已创建 ${res.fileName}`);
      onChanged();
    } catch {
      // Internal implementation detail.
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Space wrap>
          <Select
            style={{ minWidth: 220 }}
            placeholder={`选择${cfg.label}文件`}
            value={selected || undefined}
            showSearch
            optionFilterProp="label"
            disabled={saving}
            options={fileNames.map((name) => ({ label: name, value: name }))}
            onChange={(value) => void loadFile(value)}
          />
          <Button icon={<PlusOutlined />} onClick={openCreate}>
            新建{cfg.label}
          </Button>
        </Space>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={!selected || !fileReady || loadingFile}
          loading={saving}
          onClick={() => void onSave()}
        >
          保存
        </Button>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        {cfg.hint}
      </Typography.Paragraph>
      {fileError && (
        <Alert
          type="error"
          showIcon
          message={fileError}
          action={<Button onClick={() => void loadFile(selected)}>重试</Button>}
        />
      )}
      {fileNames.length === 0 ? (
        <Empty description={`暂无${cfg.label}`} style={{ padding: '32px 0' }} />
      ) : loadingFile ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      ) : (
        <Input.TextArea
          value={content}
          disabled={!fileReady || saving}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          spellCheck={false}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
        />
      )}

      <Modal
        title={`新建${cfg.label}`}
        open={createOpen}
        onOk={() => void onCreate()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        destroyOnHidden
        width={420}
      >
        <Form<NewFileValues> form={form} layout="vertical" style={{ marginTop: 12 }}>
          {kind === 'scripts' && (
            <Form.Item
              name="scriptType"
              label="类型"
              initialValue="py"
              rules={[{ required: true, message: '请选择类型' }]}
            >
              <Select options={SCRIPT_TYPE_OPTIONS} />
            </Form.Item>
          )}
          <Form.Item
            name="fileName"
            label="文件名"
            rules={[
              { required: true, message: `请输入${cfg.label}文件名` },
              {
                pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
                message: '只能包含字母、数字、点、下划线和连字符，不能包含路径分隔符',
              },
            ]}
          >
            <Input
              placeholder={
                kind === 'scripts'
                  ? '例如 lint.py（文件名，类型为 py）'
                  : '例如 glossary.md（文件名，后缀为 .md）'
              }
              maxLength={64}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function SkillsPage() {
  const { message } = App.useApp();
  const [createForm] = Form.useForm<NewSkillValues>();

  // Internal implementation detail.
  const [skills, setSkills] = useState<SysSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  // Internal implementation detail.
  const [active, setActive] = useState('');
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const [meta, setMeta] = useState({ description: '', version: '', category: '', status: 1 });
  const [savingSkill, setSavingSkill] = useState(false);
  const detailSequence = useRef(0);
  const activeSkill = useRef('');
  useEffect(
    () => () => {
      detailSequence.current++;
    },
    [],
  );
  const [packaging, setPackaging] = useState(false);

  // Internal implementation detail.
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Internal implementation detail.
  const [constraintOpen, setConstraintOpen] = useState(false);
  const [constraint, setConstraint] = useState('');
  const [constraintExists, setConstraintExists] = useState(false);
  const [constraintLoading, setConstraintLoading] = useState(false);
  const [constraintSaving, setConstraintSaving] = useState(false);

  // Internal implementation detail.
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineUrl, setOnlineUrl] = useState('');
  const [downloading, setDownloading] = useState(false);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await skillsApi.getSkillList());
    } catch {
      // Internal implementation detail.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const loadDetail = useCallback(async (name: string) => {
    if (name !== activeSkill.current) return;
    const current = ++detailSequence.current;
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await skillsApi.getSkillDetail({ name });
      if (current !== detailSequence.current || name !== activeSkill.current) return;
      setDetail(d);
      setMarkdown(d.markdown ?? '');
      setMeta({
        description: d.description ?? '',
        version: d.version ?? '',
        category: d.category ?? '',
        status: d.status ?? 1,
      });
    } catch {
      // Internal implementation detail.
    } finally {
      if (current === detailSequence.current) setDetailLoading(false);
    }
  }, []);

  const selectSkill = (name: string) => {
    activeSkill.current = name;
    setActive(name);
    void loadDetail(name);
  };

  // Internal implementation detail.
  const reloadDetail = useCallback(() => {
    if (active) void loadDetail(active);
  }, [active, loadDetail]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(kw) ||
        (skill.description ?? '').toLowerCase().includes(kw),
    );
  }, [skills, keyword]);

  // Internal implementation detail.
  const onSaveSkill = async () => {
    if (!active || detailLoading || detail?.name !== active) return;
    setSavingSkill(true);
    try {
      await skillsApi.saveSkill({
        name: active,
        description: meta.description,
        version: meta.version,
        category: meta.category,
        status: meta.status,
        markdown,
      });
      message.success('保存成功');
      await Promise.all([loadSkills(), loadDetail(active)]);
    } catch {
      // Internal implementation detail.
    } finally {
      setSavingSkill(false);
    }
  };

  const onDeleteSkill = async (name: string) => {
    try {
      await skillsApi.deleteSkill({ name });
      message.success('删除成功');
      if (activeSkill.current === name) {
        activeSkill.current = '';
        detailSequence.current++;
        setActive('');
        setDetail(null);
      }
      await loadSkills();
    } catch {
      // Internal implementation detail.
    }
  };

  const openCreate = () => {
    createForm.resetFields();
    setCreateOpen(true);
  };

  // Internal implementation detail.
  const onCreateSkill = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      await skillsApi.saveSkill({
        name: values.name,
        description: values.description ?? '',
        version: values.version ?? '',
        category: values.category ?? '',
        status: values.status === false ? 0 : 1,
        markdown: '',
      });
      message.success('创建成功');
      setCreateOpen(false);
      await loadSkills();
      selectSkill(values.name);
    } catch {
      // Internal implementation detail.
    } finally {
      setCreating(false);
    }
  };

  // Internal implementation detail.
  const onPackage = async () => {
    if (!active) return;
    setPackaging(true);
    try {
      await skillsApi.packageSkill({ name: active });
      message.success('下载成功');
    } catch {
      // Internal implementation detail.
    } finally {
      setPackaging(false);
    }
  };

  const openConstraint = async () => {
    setConstraintOpen(true);
    setConstraintLoading(true);
    try {
      const res = await skillsApi.getGlobalConstraint();
      setConstraint(res.content);
      setConstraintExists(res.exists);
    } catch {
      // Internal implementation detail.
    } finally {
      setConstraintLoading(false);
    }
  };

  const onSaveConstraint = async () => {
    setConstraintSaving(true);
    try {
      await skillsApi.saveGlobalConstraint({ content: constraint });
      message.success('保存成功');
      setConstraintExists(true);
      setConstraintOpen(false);
    } catch {
      // Internal implementation detail.
    } finally {
      setConstraintSaving(false);
    }
  };

  // Internal implementation detail.
  const onDownloadOnline = async () => {
    const url = onlineUrl.trim();
    if (!url) {
      message.warning('请输入技能 zip 地址');
      return;
    }
    setDownloading(true);
    try {
      await skillsApi.downloadOnlineSkill(url);
      message.success('下载成功');
      setOnlineOpen(false);
      setOnlineUrl('');
      await loadSkills();
    } catch {
      // Internal implementation detail.
    } finally {
      setDownloading(false);
    }
  };

  const tabsItems = useMemo(() => {
    if (!detail) return [];
    return [
      {
        key: 'skill',
        label: 'SKILL.md',
        children: (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                SKILL.md 是技能的说明文档，描述技能的能力、参数与用法；其余标签页分别对应脚本、资源、参考文档、模板以及附件路径。
              </Typography.Text>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingSkill}
                disabled={detailLoading || detail?.name !== active}
                onClick={() => void onSaveSkill()}
              >
                保存
              </Button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto 1fr',
                gap: '8px 8px',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Typography.Text type="secondary">描述</Typography.Text>
              <Input
                value={meta.description}
                onChange={(e) => setMeta((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="简要描述该技能的用途"
                maxLength={255}
              />
              <Typography.Text type="secondary">版本</Typography.Text>
              <Input
                style={{ maxWidth: 200 }}
                value={meta.version}
                onChange={(e) => setMeta((prev) => ({ ...prev, version: e.target.value }))}
                placeholder="例如 v1.0.0"
                maxLength={32}
              />
              <Typography.Text type="secondary">分类</Typography.Text>
              <Input
                value={meta.category}
                onChange={(e) => setMeta((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="例如 文本处理 / 工具"
                maxLength={64}
              />
              <Typography.Text type="secondary">状态</Typography.Text>
              <Space>
                <Switch
                  checked={meta.status === 1}
                  checkedChildren="启用"
                  unCheckedChildren="禁用"
                  onChange={(checked) => setMeta((prev) => ({ ...prev, status: checked ? 1 : 0 }))}
                />
                <Tag color={meta.status === 1 ? 'success' : 'default'}>
                  {meta.status === 1 ? '启用' : '禁用'}
                </Tag>
              </Space>
            </div>
            <Input.TextArea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={18}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
            />
          </div>
        ),
      },
      ...(Object.keys(KIND_CONFIG) as FileKind[]).map((kind) => ({
        key: kind,
        label: KIND_CONFIG[kind].label,
        children: (
          <SkillFilesTab
            key={`${active}:${kind}`}
            skill={active}
            kind={kind}
            files={detail[kind] ?? {}}
            onChanged={reloadDetail}
          />
        ),
      })),
    ];
    // Internal implementation detail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, active, meta, markdown, savingSkill, detailLoading, reloadDetail]);

  return (
    <div>
      {/* label：description + label */}
      <Card
        className="table-card"
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Typography.Text type="secondary">
            项目内的技能存放在 skills/ 目录：SKILL.md 说明文档 + scripts / resources / references /
            templates 以及附件，均通过此处的导入地址来获取。
          </Typography.Text>
          <Button icon={<SafetyCertificateOutlined />} onClick={() => void openConstraint()}>
            全局约束
          </Button>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {/* label：labellist */}
        <Card
          title="技能列表"
          style={{ width: 320, flexShrink: 0 }}
          styles={{ body: { paddingTop: 12 } }}
          loading={loading && skills.length === 0}
        >
          <Space style={{ marginBottom: 8 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建
            </Button>
            <Button icon={<CloudDownloadOutlined />} onClick={() => setOnlineOpen(true)}>
              在线导入
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadSkills()} />
          </Space>
          <Input.Search
            allowClear
            placeholder="搜索技能"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          {filtered.length === 0 ? (
            <Empty description="暂无技能" style={{ padding: '24px 0' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((skill, index) => (
                <div
                  key={`${skill.name}:${index}`}
                  onClick={() => selectSkill(skill.name)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: `1px solid ${active === skill.name ? 'var(--brand-primary)' : '#e9edf3'}`,
                    background: active === skill.name ? '#e6f4ff' : 'transparent',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Typography.Text strong ellipsis style={{ maxWidth: 150 }} title={skill.name}>
                      {skill.name}
                    </Typography.Text>
                    <Space size={4}>
                      {skill.category && <Tag style={{ marginInlineEnd: 0 }}>{skill.category}</Tag>}
                      {skill.version && (
                        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                          {skill.version}
                        </Tag>
                      )}
                      <Tag
                        color={skill.status === 1 ? 'success' : 'default'}
                        style={{ marginInlineEnd: 0 }}
                      >
                        {skill.status === 1 ? 'enable' : 'disable'}
                      </Tag>
                    </Space>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 4,
                    }}
                  >
                    <Typography.Text
                      type="secondary"
                      ellipsis
                      style={{ maxWidth: 170, fontSize: 12 }}
                      title={skill.description}
                    >
                      {skill.description || '暂无描述'}
                    </Typography.Text>
                    <Popconfirm
                      title={`确定删除技能「${skill.name}」？`}
                      description="删除后该技能下的 scripts/resources/references/templates 文件将一并移除。"
                      okText="删除"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void onDeleteSkill(skill.name)}
                    >
                      <Button
                        type="link"
                        size="small"
                        danger
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: 0, height: 'auto' }}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* label：details */}
        <Card style={{ flex: 1, minWidth: 0 }} styles={{ body: { paddingTop: 12 } }}>
          {!active || !detail ? (
            <Empty description="请从左侧选择或新建一个技能" style={{ padding: '96px 0' }} />
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  paddingBottom: 12,
                  marginBottom: 4,
                  borderBottom: '1px solid #e9edf3',
                }}
              >
                <Space size={8} wrap>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {detail.name}
                  </Typography.Title>
                  <Tag>技能</Tag>
                  {detail.category && <Tag>{detail.category}</Tag>}
                  {detail.version && <Tag color="blue">{detail.version}</Tag>}
                  <Tag color={detail.status === 1 ? 'success' : 'default'}>
                    {detail.status === 1 ? '启用' : '禁用'}
                  </Tag>
                </Space>
                <Space>
                  <Button
                    icon={<DownloadOutlined />}
                    loading={packaging}
                    onClick={() => void onPackage()}
                  >
                    打包下载
                  </Button>
                </Space>
              </div>
              <Spin spinning={detailLoading}>
                <Tabs items={tabsItems} defaultActiveKey="skill" style={{ minHeight: 420 }} />
              </Spin>
            </>
          )}
        </Card>
      </div>

      {/* create newlabel */}
      <Modal
        title="新建技能"
        open={createOpen}
        onOk={() => void onCreateSkill()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        destroyOnHidden
        width={480}
      >
        <Form<NewSkillValues> form={createForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[
              { required: true, message: '请输入名称' },
              {
                pattern: /^[A-Za-z0-9][A-Za-z0-9-_]*$/,
                message: '只能包含字母、数字、下划线和连字符（不能包含空格）',
              },
            ]}
          >
            <Input placeholder="例如 code-comment-expert" maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="简要说明该技能能做什么，及其适用范围" maxLength={255} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="version" label="版本" style={{ flex: 1, minWidth: 140 }}>
              <Input placeholder="例如 v1.0.0" maxLength={32} />
            </Form.Item>
            <Form.Item name="category" label="分类" style={{ flex: 1, minWidth: 140 }}>
              <Input placeholder="例如 文本处理" maxLength={64} />
            </Form.Item>
            <Form.Item
              name="status"
              label="状态"
              initialValue={true}
              valuePropName="checked"
              style={{ flex: 1, minWidth: 100 }}
            >
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* labeledit */}
      <Modal
        title="全局约束（skills/global-constraint.md）"
        open={constraintOpen}
        onOk={() => void onSaveConstraint()}
        onCancel={() => setConstraintOpen(false)}
        confirmLoading={constraintSaving}
        width={720}
      >
        {constraintLoading ? (
          <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <Spin />
          </div>
        ) : (
          <>
            {!constraintExists && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="创建/更新说明保存到 skills/global-constraint.md（全局约束文件）。"
              />
            )}
            <Input.TextArea
              value={constraint}
              onChange={(e) => setConstraint(e.target.value)}
              rows={14}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
            />
          </>
        )}
      </Modal>

      {/* labeldownload */}
      <Modal
        title="在线下载"
        open={onlineOpen}
        onOk={() => void onDownloadOnline()}
        onCancel={() => setOnlineOpen(false)}
        confirmLoading={downloading}
        okText="下载"
        width={560}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="在线技能为 ZIP 压缩包地址，后端会下载后解压到 skills/ 目录（约 15 秒处理时间）。"
        />
        <Input
          value={onlineUrl}
          onChange={(e) => setOnlineUrl(e.target.value)}
          placeholder="https://example.com/skills/my-skill.zip"
          spellCheck={false}
        />
      </Modal>
    </div>
  );
}
