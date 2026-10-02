import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { pluginConfigApi } from './api';
import { HierarchyEditor } from './HierarchyEditor';
import {
  flattenTree,
  importResources,
  manifestError,
  menuHierarchy,
  newDetail,
  newDictionary,
  newMenu,
  saveTextFile,
  type ApiConfig,
  type ConfigDocument,
  type ConfigPreview,
  type Counts,
  type Manifest,
} from './model';
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const errorText = (error: unknown) => (error instanceof Error ? error.message : '请求失败');
export const countsText = (c: Counts) =>
  `菜单 ${c.menus} · API ${c.apis} · 字典 ${c.dictionaries} · 明细 ${c.details}`;
export function ConfigDrawer({ name, onClose }: { name: string; onClose: () => void }) {
  const { message } = App.useApp();
  const [document, setDocument] = useState<ConfigDocument>();
  const [draft, setDraft] = useState<Manifest>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ConfigPreview>();
  const [tab, setTab] = useState('menus');
  const [catalog, setCatalog] = useState<Manifest>();
  const [importKind, setImportKind] = useState<'menus' | 'apis' | 'dictionaries'>();
  const [imports, setImports] = useState<string[]>([]);
  const [dictIndex, setDictIndex] = useState(0);
  const [applied, setApplied] = useState<{ created: Counts; skipped: Counts }>();
  const dirty =
    !!document && !!draft && JSON.stringify(document.manifest) !== JSON.stringify(draft);
  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const value = await pluginConfigApi.get(name);
      setDocument(value);
      setDraft(structuredClone(value.manifest));
      setPreview(undefined);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [name]);
  const change = (next: Manifest) => {
    setDraft(next);
    setPreview(undefined);
    setApplied(undefined);
  };
  const save = async () => {
    if (!document || !draft) return;
    const error = manifestError(draft);
    if (error) {
      setError(error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await pluginConfigApi.save(document, draft);
      setDocument(next);
      setDraft(structuredClone(next.manifest));
      message.success('保存成功');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const showPreview = async () => {
    if (!document || !draft) return;
    setBusy(true);
    setError('');
    try {
      setPreview(await pluginConfigApi.preview(document, draft));
      setTab('preview');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!document || dirty) return;
    setBusy(true);
    setError('');
    try {
      const value = await pluginConfigApi.apply(document);
      setApplied(value);
      message.success('配置已应用');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const startImport = async (kind: 'menus' | 'apis' | 'dictionaries') => {
    setBusy(true);
    setError('');
    try {
      const value = await pluginConfigApi.catalog();
      setCatalog(value);
      setImports([]);
      setImportKind(kind);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const importOptions =
    importKind === 'menus'
      ? flattenTree(catalog?.menus ?? []).map((v) => ({
          value: v.key,
          label: `${v.node.title} (${v.node.name})`,
          item: v.node,
        }))
      : importKind === 'apis'
        ? (catalog?.apis ?? []).map((item, i) => ({
            value: String(i),
            label: `${item.method} ${item.path} · ${item.description}`,
            item,
          }))
        : (catalog?.dictionaries ?? []).map((item, i) => ({
            value: String(i),
            label: `${item.name} (${item.type})`,
            item,
          }));
  const doImport = () => {
    if (!draft || !importKind) return;
    try {
      const selected = importOptions.filter((v) => imports.includes(v.value));
      change(
        importResources(
          draft,
          importKind,
          selected.map((v) => v.item) as Manifest[typeof importKind],
        ),
      );
      setImportKind(undefined);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const close = () => {
    if (dirty) {
      Modal.confirm({
        title: '保存配置并关闭编辑？',
        okText: '关闭',
        cancelText: '继续编辑',
        onOk: onClose,
      });
    } else onClose();
  };
  const externalParents = flattenTree(catalog?.menus ?? []).map((v) => ({
    value: v.node.name,
    label: `${v.node.title} (${v.node.name})`,
  }));
  const d = draft?.dictionaries[dictIndex];
  return (
    <>
      <Drawer
        open
        title={`配置 · ${name}`}
        width={1120}
        onClose={close}
        extra={
          <Space>
            <Popconfirm title="放弃修改" disabled={!dirty} onConfirm={() => void load()}>
              <Button
                onClick={() => {
                  if (!dirty) void load();
                }}
                disabled={busy}
              >
                重新加载
              </Button>
            </Popconfirm>
            <Button onClick={() => void showPreview()} disabled={!draft} loading={busy}>
              校验并预览
            </Button>
            <Button type="primary" disabled={!draft} loading={busy} onClick={() => void save()}>
              保存配置
            </Button>
          </Space>
        }
        getContainer={() => window.document.body}
      >
        <Spin spinning={busy}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type="info"
              showIcon
              message="本页面可查看并配置插件的菜单、API、字典明细以及角色权限。"
              description="保存配置后需点击“应用到系统”才会真正生效。应用前请先确认角色与权限配置是否正确。"
            />
            {error && (
              <Alert type="error" showIcon message={error} closable onClose={() => setError('')} />
            )}
            {document?.warnings.map((v) => (
              <Alert key={v} type="warning" showIcon message={v} />
            ))}
            {draft && document ? (
              <>
                <Space wrap>
                  <Tag>{document.pluginType}</Tag>
                  <Tag>{countsText(document.counts)}</Tag>
                  {dirty && <Tag color="orange">未保存</Tag>}
                  <Typography.Text type="secondary">
                    版本 {document.revision.slice(0, 12)}
                  </Typography.Text>
                  <Popconfirm
                    title="应用到系统？"
                    description="将使用当前配置覆盖系统中的角色与权限。"
                    onConfirm={() => void apply()}
                  >
                    <Button disabled={dirty || !!document.warnings.length} loading={busy}>
                      应用到系统
                    </Button>
                  </Popconfirm>
                </Space>
                {applied && (
                  <Alert
                    type="success"
                    message={`新建：${countsText(applied.created)}`}
                    description={`保留：${countsText(applied.skipped)}`}
                  />
                )}
                <Form layout="vertical">
                  <Form.Item label="插件描述">
                    <Input.TextArea
                      maxLength={2000}
                      rows={2}
                      value={draft.description}
                      onChange={(e) => change({ ...draft, description: e.target.value })}
                    />
                  </Form.Item>
                </Form>
                <Tabs
                  activeKey={tab}
                  onChange={setTab}
                  items={[
                    {
                      key: 'menus',
                      label: `菜单 (${flattenTree(draft.menus).length})`,
                      children: (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Button onClick={() => void startImport('menus')}>从系统菜单导入</Button>
                          <HierarchyEditor
                            value={draft.menus}
                            onChange={(menus) => change({ ...draft, menus: menuHierarchy(menus) })}
                            create={newMenu}
                            label={(v) => v.title}
                            render={(v, patch, isRoot) => (
                              <Form layout="vertical">
                                <Form.Item label="菜单名称（路由标识）" required>
                                  <Input
                                    maxLength={100}
                                    value={v.name}
                                    onChange={(e) => patch({ name: e.target.value })}
                                  />
                                </Form.Item>
                                <Form.Item label="菜单标题" required>
                                  <Input
                                    maxLength={120}
                                    value={v.title}
                                    onChange={(e) => patch({ title: e.target.value })}
                                  />
                                </Form.Item>
                                <Form.Item label="路由路径" required>
                                  <Input
                                    maxLength={500}
                                    value={v.path}
                                    onChange={(e) => patch({ path: e.target.value })}
                                    placeholder="/example 为子菜单"
                                  />
                                </Form.Item>
                                <Form.Item label="组件路径" required={!v.children?.length}>
                                  <Input
                                    maxLength={500}
                                    value={v.component}
                                    onChange={(e) => patch({ component: e.target.value })}
                                    placeholder="view/xxx/index.vue（自定义 React 页面）"
                                  />
                                </Form.Item>
                                {isRoot && (
                                  <Form.Item
                                    label="上级系统菜单"
                                    extra="可挂载到已有的系统菜单下，最多选择一个；也可从系统菜单中导入。"
                                  >
                                    <Select
                                      mode="tags"
                                      maxCount={1}
                                      value={v.parentName ? [v.parentName] : []}
                                      options={externalParents}
                                      onChange={(values) =>
                                        patch({ parentName: values.at(-1) || undefined })
                                      }
                                      placeholder="请选择菜单"
                                    />
                                  </Form.Item>
                                )}
                                <Form.Item label="图标">
                                  <Input
                                    maxLength={100}
                                    value={v.icon}
                                    onChange={(e) => patch({ icon: e.target.value })}
                                  />
                                </Form.Item>
                                <Form.Item label="排序">
                                  <InputNumber
                                    min={-100000}
                                    max={100000}
                                    value={v.sort}
                                    onChange={(n) => patch({ sort: n ?? 0 })}
                                  />
                                </Form.Item>
                                <Space>
                                  <Checkbox
                                    checked={v.hidden}
                                    onChange={(e) => patch({ hidden: e.target.checked })}
                                  >
                                    隐藏菜单
                                  </Checkbox>
                                  <Checkbox
                                    checked={v.keepAlive}
                                    onChange={(e) => patch({ keepAlive: e.target.checked })}
                                  >
                                    缓存页面
                                  </Checkbox>
                                </Space>
                              </Form>
                            )}
                          />
                        </Space>
                      ),
                    },
                    {
                      key: 'apis',
                      label: `API (${draft.apis.length})`,
                      children: (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Space>
                            <Button
                              onClick={() =>
                                change({
                                  ...draft,
                                  apis: [
                                    ...draft.apis,
                                    { path: '', method: 'GET', description: '', apiGroup: name },
                                  ],
                                })
                              }
                            >
                              创建 API
                            </Button>
                            <Button onClick={() => void startImport('apis')}>
                              从系统 API 导入
                            </Button>
                          </Space>
                          <Table<ApiConfig>
                            rowKey={(row) => String(draft.apis.indexOf(row))}
                            pagination={false}
                            dataSource={draft.apis}
                            scroll={{ x: 800 }}
                            columns={[
                              {
                                title: '方法',
                                width: 120,
                                render: (_, v, i) => (
                                  <Select
                                    style={{ width: 110 }}
                                    value={v.method}
                                    options={methods.map((value) => ({ value, label: value }))}
                                    onChange={(method) =>
                                      change({
                                        ...draft,
                                        apis: draft.apis.map((item, j) =>
                                          j === i ? { ...item, method } : item,
                                        ),
                                      })
                                    }
                                  />
                                ),
                              },
                              {
                                title: '路径',
                                render: (_, v, i) => (
                                  <Input
                                    maxLength={500}
                                    value={v.path}
                                    placeholder="/plugin/resource/:id"
                                    onChange={(e) =>
                                      change({
                                        ...draft,
                                        apis: draft.apis.map((item, j) =>
                                          j === i ? { ...item, path: e.target.value } : item,
                                        ),
                                      })
                                    }
                                  />
                                ),
                              },
                              {
                                title: '分组',
                                render: (_, v, i) => (
                                  <Input
                                    maxLength={120}
                                    value={v.apiGroup}
                                    onChange={(e) =>
                                      change({
                                        ...draft,
                                        apis: draft.apis.map((item, j) =>
                                          j === i ? { ...item, apiGroup: e.target.value } : item,
                                        ),
                                      })
                                    }
                                  />
                                ),
                              },
                              {
                                title: '描述',
                                render: (_, v, i) => (
                                  <Input
                                    maxLength={500}
                                    value={v.description}
                                    onChange={(e) =>
                                      change({
                                        ...draft,
                                        apis: draft.apis.map((item, j) =>
                                          j === i ? { ...item, description: e.target.value } : item,
                                        ),
                                      })
                                    }
                                  />
                                ),
                              },
                              {
                                title: '删除',
                                width: 70,
                                render: (_, __, i) => (
                                  <Button
                                    danger
                                    type="link"
                                    onClick={() =>
                                      change({
                                        ...draft,
                                        apis: draft.apis.filter((_, j) => i !== j),
                                      })
                                    }
                                  >
                                    删除
                                  </Button>
                                ),
                              },
                            ]}
                          />
                        </Space>
                      ),
                    },
                    {
                      key: 'dictionaries',
                      label: `字典 (${draft.dictionaries.length})`,
                      children: (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Space wrap>
                            <Button
                              onClick={() => {
                                setDictIndex(draft.dictionaries.length);
                                change({
                                  ...draft,
                                  dictionaries: [...draft.dictionaries, newDictionary()],
                                });
                              }}
                            >
                              新建字典
                            </Button>
                            <Button onClick={() => void startImport('dictionaries')}>
                              从系统字典导入
                            </Button>
                            <Select
                              style={{ minWidth: 240 }}
                              value={d ? dictIndex : undefined}
                              placeholder="选择字典"
                              options={draft.dictionaries.map((item, i) => ({
                                value: i,
                                label: `${item.name} (${item.type || 'type'})`,
                              }))}
                              onChange={setDictIndex}
                            />
                            {d && (
                              <Popconfirm
                                title="删除字典？"
                                onConfirm={() => {
                                  change({
                                    ...draft,
                                    dictionaries: draft.dictionaries.filter(
                                      (_, i) => i !== dictIndex,
                                    ),
                                  });
                                  setDictIndex(0);
                                }}
                              >
                                <Button danger>删除字典</Button>
                              </Popconfirm>
                            )}
                          </Space>
                          {d ? (
                            <>
                              <Card size="small">
                                <Form layout="vertical">
                                  <Space wrap align="start">
                                    <Form.Item label="字典名称" required>
                                      <Input
                                        value={d.name}
                                        maxLength={120}
                                        onChange={(e) =>
                                          change({
                                            ...draft,
                                            dictionaries: draft.dictionaries.map((v, i) =>
                                              i === dictIndex ? { ...v, name: e.target.value } : v,
                                            ),
                                          })
                                        }
                                      />
                                    </Form.Item>
                                    <Form.Item label="字典类型" required>
                                      <Input
                                        value={d.type}
                                        maxLength={100}
                                        onChange={(e) =>
                                          change({
                                            ...draft,
                                            dictionaries: draft.dictionaries.map((v, i) =>
                                              i === dictIndex ? { ...v, type: e.target.value } : v,
                                            ),
                                          })
                                        }
                                      />
                                    </Form.Item>
                                    <Form.Item label="状态">
                                      <Checkbox
                                        checked={d.status}
                                        onChange={(e) =>
                                          change({
                                            ...draft,
                                            dictionaries: draft.dictionaries.map((v, i) =>
                                              i === dictIndex
                                                ? { ...v, status: e.target.checked }
                                                : v,
                                            ),
                                          })
                                        }
                                      >
                                        启用
                                      </Checkbox>
                                    </Form.Item>
                                  </Space>
                                  <Form.Item label="字典描述">
                                    <Input
                                      maxLength={2000}
                                      value={d.description}
                                      onChange={(e) =>
                                        change({
                                          ...draft,
                                          dictionaries: draft.dictionaries.map((v, i) =>
                                            i === dictIndex
                                              ? { ...v, description: e.target.value }
                                              : v,
                                          ),
                                        })
                                      }
                                    />
                                  </Form.Item>
                                </Form>
                              </Card>
                              <HierarchyEditor
                                key={dictIndex}
                                value={d.details}
                                onChange={(details) =>
                                  change({
                                    ...draft,
                                    dictionaries: draft.dictionaries.map((v, i) =>
                                      i === dictIndex ? { ...v, details } : v,
                                    ),
                                  })
                                }
                                create={newDetail}
                                label={(v) => `${v.label} (${v.value})`}
                                render={(v, patch) => (
                                  <Form layout="vertical">
                                    <Form.Item label="明细名称" required>
                                      <Input
                                        value={v.label}
                                        maxLength={200}
                                        onChange={(e) => patch({ label: e.target.value })}
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      label="明细值"
                                      required
                                      extra="值为 0 时表示无明细；字典树结构仅保留末级明细。"
                                    >
                                      <Input
                                        value={v.value}
                                        maxLength={500}
                                        onChange={(e) => patch({ value: e.target.value })}
                                      />
                                    </Form.Item>
                                    <Form.Item label="排序">
                                      <InputNumber
                                        value={v.sort}
                                        min={-100000}
                                        max={100000}
                                        onChange={(n) => patch({ sort: n ?? 0 })}
                                      />
                                    </Form.Item>
                                    <Form.Item label="扩展说明">
                                      <Input.TextArea
                                        rows={2}
                                        value={v.extend}
                                        maxLength={2000}
                                        onChange={(e) => patch({ extend: e.target.value })}
                                      />
                                    </Form.Item>
                                    <Checkbox
                                      checked={v.status}
                                      onChange={(e) => patch({ status: e.target.checked })}
                                    >
                                      启用
                                    </Checkbox>
                                  </Form>
                                )}
                              />
                            </>
                          ) : (
                            <Empty description="暂无字典，请先新建或导入" />
                          )}
                        </Space>
                      ),
                    },
                    {
                      key: 'preview',
                      label: '预览',
                      children: preview ? (
                        <Tabs
                          items={preview.files.map((file) => ({
                            key: file.path,
                            label: file.path,
                            children: (
                              <Space direction="vertical" style={{ width: '100%' }}>
                                <Button
                                  onClick={() =>
                                    saveTextFile(
                                      file.path.split('/').at(-1) ?? 'source.txt',
                                      file.content,
                                    )
                                  }
                                >
                                  下载文件
                                </Button>
                                <pre
                                  style={{
                                    maxHeight: 600,
                                    overflow: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    padding: 16,
                                    background: 'var(--surface-muted, #f7f8fa)',
                                    borderRadius: 8,
                                  }}
                                >
                                  {file.content}
                                </pre>
                              </Space>
                            ),
                          }))}
                        />
                      ) : (
                        <Empty description="点击校验并预览后预览" />
                      ),
                    },
                    {
                      key: 'files',
                      label: `文件 (${document.files.length})`,
                      children: (
                        <Table
                          size="small"
                          rowKey={(v) => `${v.side}/${v.path}`}
                          dataSource={document.files}
                          columns={[
                            { title: '类型', dataIndex: 'side' },
                            { title: '文件', dataIndex: 'path' },
                            { title: '大小', dataIndex: 'size' },
                          ]}
                          pagination={{ pageSize: 15 }}
                        />
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              !busy && !error && <Empty />
            )}
          </Space>
        </Spin>
      </Drawer>
      <Modal
        open={!!importKind}
        title="导入系统配置"
        onCancel={() => setImportKind(undefined)}
        onOk={doImport}
        okButtonProps={{ disabled: !imports.length }}
      >
        <Alert
          type="info"
          message="导入系统配置会覆盖菜单、API 和字典的全部配置，请谨慎操作。"
          style={{ marginBottom: 16 }}
        />
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          value={imports}
          onChange={setImports}
          options={importOptions.map(({ value, label }) => ({ value, label }))}
          placeholder="搜索并选择"
        />
      </Modal>
    </>
  );
}
