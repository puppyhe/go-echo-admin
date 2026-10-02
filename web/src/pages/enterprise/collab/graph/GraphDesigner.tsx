import { AssigneeEditor } from '../AssigneeEditor';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  List,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  LinkOutlined,
  PlusOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { conditionFields, type FormDesign } from '../../../systemTools/formDesign';
import { collabApi } from '../api';
import { allowedOperators, operatorLabels, statusLabels } from '../model';
import type {
  GraphIssue,
  GraphNode,
  GraphNodeType,
  GraphPreview,
  UserChoice,
  WorkflowGraph,
} from '../types';
import { GraphCanvas } from './GraphCanvas';
import CCUserSelect from '../receipts/CCUserSelect';
import {
  createGraphHistory,
  recordGraph,
  finishGraphGroup,
  undoGraph,
  redoGraph,
  graphEqual,
  graphShortcut,
  type GraphHistory,
} from './graphHistory';
import { graphImage, graphPNG, graphRasterSize, downloadGraph } from './graphExport';
import {
  connectNodes,
  moveNode,
  newNode,
  nodeLabels,
  prepareGraph,
  removeSelection,
} from './graphModel';

interface Props {
  graph: WorkflowGraph;
  onChange: (graph: WorkflowGraph) => void;
  formId?: number;
  businessType?: string;
  schema?: FormDesign;
  users: UserChoice[];
  disabled?: boolean;
}
export function GraphDesigner({
  graph,
  onChange,
  formId,
  businessType,
  schema,
  users,
  disabled,
}: Props) {
  const { message } = App.useApp();
  const [selected, setSelected] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [source, setSource] = useState<string>();
  const [issues, setIssues] = useState<GraphIssue[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [data, setData] = useState('{}');
  const [approvals, setApprovals] = useState<Record<string, 'approve' | 'reject'>>({});
  const [preview, setPreview] = useState<GraphPreview>();
  const [initialHistory] = useState(() => createGraphHistory(graph));
  const history = useRef(initialHistory);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const [dragging, setDragging] = useState(false);
  const dragHistory = useRef<GraphHistory>();
  const dragGroup = useRef<string>();
  const moveSerial = useRef(0);
  const requestSerial = useRef(0);
  const alive = useRef(true);
  const sourceKey = `${businessType ?? ''}:${formId ?? 0}`;
  const currentForm = useRef(sourceKey);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const updateHistory = (next: GraphHistory) => {
    history.current = next;
    setCounts({ undo: next.past.length, redo: next.future.length });
  };
  const invalidate = () => {
    requestSerial.current++;
    setBusy(false);
    setIssues(null);
    setPreview(undefined);
    setError('');
  };
  const restore = (next: GraphHistory) => {
    updateHistory(next);
    onChange(structuredClone(next.present));
    setSource(undefined);
    setSelected(undefined);
    invalidate();
  };
  useLayoutEffect(() => {
    if (currentForm.current !== sourceKey) {
      currentForm.current = sourceKey;
      updateHistory(createGraphHistory(graph));
      setSelected(undefined);
      setSource(undefined);
      setData('{}');
      setApprovals({});
      invalidate();
    } else if (!graphEqual(history.current.present, graph)) {
      // An explicit replacement from the parent (e.g. converting sequential
      // steps) is one undoable edit in the current document.
      updateHistory(recordGraph(history.current, graph));
      setSelected(undefined);
      setSource(undefined);
      invalidate();
    }
  }, [graph, sourceKey]);
  useEffect(() => {
    invalidate();
  }, [schema]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestSerial.current++;
    };
  }, []);
  const finishGroup = () => {
    history.current = finishGraphGroup(history.current);
  };
  const travel = (direction: 'undo' | 'redo') => {
    if (disabled || dragging) return;
    const next = direction === 'undo' ? undoGraph(history.current) : redoGraph(history.current);
    if (next !== history.current) restore(next);
  };
  const exportImage = async (format: string) => {
    if (exportLock.current || dragging) return;
    exportLock.current = true;
    setExporting(true);
    try {
      const image = graphImage(history.current.present);
      const blob =
        format === 'png'
          ? await graphPNG(image)
          : new Blob([image.svg], { type: 'image/svg+xml;charset=utf-8' });
      if (!alive.current) return;
      downloadGraph(blob, `workflow-${new Date().toISOString().slice(0, 10)}.${format}`);
      const size = format === 'png' ? graphRasterSize(image.width, image.height) : image;
      message.success(`${format.toUpperCase()} 导出完成 · ${size.width} × ${size.height}`);
    } catch (e) {
      if (alive.current) message.error(e instanceof Error ? e.message : '导出失败');
    } finally {
      exportLock.current = false;
      if (alive.current) setExporting(false);
    }
  };
  const node = graph.nodes.find((item) => item.id === selected);
  const edge = graph.edges.find((item) => item.id === selected);
  const fields = schema
    ? conditionFields(schema.fields).filter((field) => !field.disabled && field.type !== 'password')
    : [];
  const field = fields.find((item) => item.name === node?.condition?.field);
  const change = (value: WorkflowGraph, group?: string) => {
    if (disabled) return;
    updateHistory(recordGraph(history.current, value, group));
    onChange(value);
    invalidate();
  };
  const patch = (value: Partial<GraphNode>, group?: string) =>
    change(
      {
        ...graph,
        nodes: graph.nodes.map((item) => (item.id === node?.id ? { ...item, ...value } : item)),
      },
      group,
    );
  const condition = (value: Partial<NonNullable<GraphNode['condition']>>) =>
    patch({ condition: { field: '', operator: 'eq', value: '', ...node?.condition, ...value } });
  const select = (id: string) => {
    finishGroup();
    if (!connecting || !graph.nodes.some((item) => item.id === id)) {
      setSelected(id);
      return;
    }
    if (!source) {
      setSource(id);
      setSelected(id);
      return;
    }
    try {
      const updated = connectNodes(graph, source, id);
      change(updated);
      setSelected(updated.edges.at(-1)?.id);
      setSource(undefined);
    } catch (e) {
      message.warning(e instanceof Error ? e.message : '无法连接节点');
    }
  };
  const validate = async () => {
    if ((!formId && !businessType) || !schema) {
      message.warning('验证前请选择业务对象');
      return;
    }
    const request = ++requestSerial.current;
    setBusy(true);
    setError('');
    try {
      const result = await collabApi.validateGraph({
        formId: businessType ? 0 : formId,
        businessType,
        graph: prepareGraph(graph, schema),
      });
      if (!alive.current || request !== requestSerial.current) return;
      setIssues(result.issues);
      if (result.valid) message.success('图形验证通过');
    } catch (e) {
      if (alive.current && request === requestSerial.current)
        setError(e instanceof Error ? e.message : '图形验证失败');
    } finally {
      if (alive.current && request === requestSerial.current) setBusy(false);
    }
  };
  const simulate = async () => {
    if ((!formId && !businessType) || !schema) return;
    const request = ++requestSerial.current;
    setBusy(true);
    setError('');
    setPreview(undefined);
    try {
      const values: unknown = JSON.parse(data);
      if (!values || Array.isArray(values) || typeof values !== 'object')
        throw new Error('表单数据必须是 JSON 对象');
      const chosen = Object.fromEntries(
        Object.entries(approvals).filter(([id]) =>
          graph.nodes.some((n) => n.id === id && n.type === 'approval'),
        ),
      );
      const result = await collabApi.previewGraph({
        formId: businessType ? 0 : formId,
        businessType,
        graph: prepareGraph(graph, schema),
        data: values as Record<string, unknown>,
        approvals: chosen,
      });
      if (alive.current && request === requestSerial.current) setPreview(result);
    } catch (e) {
      if (alive.current && request === requestSerial.current)
        setError(e instanceof Error ? e.message : '工作流预览失败');
    } finally {
      if (alive.current && request === requestSerial.current) setBusy(false);
    }
  };
  return (
    <div
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLElement;
        const text = !!target.closest(
          'input,textarea,select,[contenteditable="true"],[role="combobox"]',
        );
        const action = graphShortcut(event, text);
        if (action && !disabled && !dragging) {
          event.preventDefault();
          event.stopPropagation();
          travel(action);
        }
      }}
    >
      <Alert
        showIcon
        type="info"
        message="编辑节点和边，然后在保存前验证图形。"
        style={{ marginBottom: 12 }}
      />
      <Space wrap>
        <Button
          icon={<UndoOutlined />}
          title="撤销 (Ctrl / ⌘ Z)"
          disabled={disabled || dragging || !counts.undo}
          onClick={() => travel('undo')}
        >
          撤销
        </Button>
        <Button
          icon={<RedoOutlined />}
          title="重做 (Ctrl / ⌘ Shift Z)"
          disabled={disabled || dragging || !counts.redo}
          onClick={() => travel('redo')}
        >
          重做
        </Button>
        <Dropdown
          menu={{
            items: [
              { key: 'svg', label: '下载 SVG' },
              { key: 'png', label: '下载 PNG' },
            ],
            onClick: ({ key }) => void exportImage(key),
          }}
          disabled={exporting || dragging || !graph.nodes.length}
        >
          <Button icon={<DownloadOutlined />} loading={exporting}>
            导出
          </Button>
        </Dropdown>
        {(Object.keys(nodeLabels) as GraphNodeType[]).map((type) => (
          <Button
            key={type}
            size="small"
            icon={<PlusOutlined />}
            disabled={disabled || graph.nodes.length >= 200}
            onClick={() => {
              const added = newNode(type, graph.nodes.length);
              change({ ...graph, nodes: [...graph.nodes, added] });
              setSelected(added.id);
            }}
          >
            {nodeLabels[type]}
          </Button>
        ))}
        <Button
          icon={<LinkOutlined />}
          type={connecting ? 'primary' : 'default'}
          disabled={disabled}
          onClick={() => {
            setConnecting(!connecting);
            setSource(undefined);
          }}
        >
          连接节点
        </Button>
        <Button
          danger
          icon={<DeleteOutlined />}
          disabled={disabled || !selected}
          onClick={() => {
            if (selected) change(removeSelection(graph, selected));
            setSelected(undefined);
            setSource(undefined);
          }}
        >
          删除所选
        </Button>
        <Button
          loading={busy}
          disabled={disabled || (!formId && !businessType)}
          onClick={() => void validate()}
        >
          验证图形
        </Button>
        <Button
          disabled={disabled || (!formId && !businessType)}
          onClick={() => {
            setError('');
            setPreviewOpen(true);
          }}
        >
          预览
        </Button>
      </Space>
      {connecting && (
        <Alert
          type="info"
          message={
            source
              ? `已选择 ${graph.nodes.find((n) => n.id === source)?.name}；请选择目标节点`
              : '选择一个节点继续'
          }
          style={{ marginTop: 12 }}
        />
      )}
      {error && !previewOpen && (
        <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />
      )}
      {issues && (
        <Alert
          style={{ marginTop: 12 }}
          type={issues.length ? 'error' : 'success'}
          showIcon
          message={issues.length ? `${issues.length} 个验证问题` : '图形验证通过'}
          description={
            issues.length ? (
              <List
                size="small"
                dataSource={issues}
                renderItem={(issue) => (
                  <List.Item>
                    <Button
                      type="link"
                      style={{ whiteSpace: 'normal', height: 'auto', textAlign: 'left' }}
                      onClick={() => setSelected(issue.nodeId || issue.edgeId)}
                    >
                      {issue.message}
                    </Button>
                  </List.Item>
                )}
              />
            ) : undefined
          }
        />
      )}
      <div className="workflow-graph-designer">
        <GraphCanvas
          graph={graph}
          selected={selected}
          onSelect={select}
          connecting={connecting}
          onMoveStart={(id) => {
            dragHistory.current = history.current;
            dragGroup.current = `move:${id}:${++moveSerial.current}`;
            setDragging(true);
          }}
          onMove={
            disabled
              ? undefined
              : (id, x, y) => change(moveNode(history.current.present, id, x, y), dragGroup.current)
          }
          onMoveEnd={(_, cancelled) => {
            if (dragHistory.current && cancelled) restore(dragHistory.current);
            else if (
              dragHistory.current &&
              graphEqual(dragHistory.current.present, history.current.present)
            )
              updateHistory(dragHistory.current);
            else finishGroup();
            dragHistory.current = undefined;
            dragGroup.current = undefined;
            setDragging(false);
          }}
        />
        <Card
          size="small"
          title={node ? nodeLabels[node.type] : edge ? '边缘配置' : '工作流图'}
          className="workflow-graph-inspector"
        >
          <Form layout="vertical" disabled={disabled}>
            {!node && !edge && (
              <Typography.Text type="secondary">选择节点或边以编辑其配置。</Typography.Text>
            )}
            {node && (
              <>
                <Form.Item label="节点名称">
                  <Input
                    value={node.name}
                    maxLength={200}
                    onChange={(event) => patch({ name: event.target.value }, `name:${node.id}`)}
                    onBlur={finishGroup}
                  />
                </Form.Item>
                <Typography.Paragraph
                  type="secondary"
                  copyable={{ text: node.id }}
                  style={{ fontSize: 11, overflowWrap: 'anywhere' }}
                >
                  {node.id}
                </Typography.Paragraph>
                {node.type === 'approval' && (
                  <>
                    <Form.Item label="审批" required>
                      <AssigneeEditor
                        value={node}
                        users={users}
                        disabled={disabled}
                        onChange={patch}
                      />
                    </Form.Item>
                    <Form.Item label="审批模式">
                      <Select
                        value={node.mode ?? 'any'}
                        options={[
                          { value: 'any', label: '任一审批人' },
                          { value: 'all', label: '所有审批人' },
                        ]}
                        onChange={(mode) => patch({ mode })}
                      />
                    </Form.Item>
                    <Form.Item label="抄送用户" extra="审批运行时通知这些用户。">
                      <CCUserSelect
                        value={node.ccUserIds}
                        onChange={(ccUserIds) => patch({ ccUserIds })}
                        disabled={disabled}
                        options={users.map((user) => ({
                          value: user.id,
                          label: `${user.nickName || user.username} (${user.username})`,
                        }))}
                      />
                    </Form.Item>
                  </>
                )}
                {node.type === 'decision' && (
                  <>
                    <Form.Item label="字段" required>
                      <Select
                        value={node.condition?.field || undefined}
                        options={fields.map((item) => ({
                          value: item.name,
                          label: `${item.label} (${item.name})`,
                        }))}
                        onChange={(name) =>
                          condition({
                            field: name,
                            operator: 'eq',
                            value:
                              fields.find((f) => f.name === name)?.type === 'checkbox' ? [] : '',
                          })
                        }
                      />
                    </Form.Item>
                    <Form.Item label="分支">
                      <Select
                        value={node.condition?.operator ?? 'eq'}
                        options={allowedOperators(field).map((value) => ({
                          value,
                          label: operatorLabels[value],
                        }))}
                        onChange={(operator) =>
                          condition({
                            operator,
                            value: field?.type === 'checkbox' && operator !== 'contains' ? [] : '',
                          })
                        }
                      />
                    </Form.Item>
                    <Form.Item label="值" required>
                      {field?.type === 'switch' ? (
                        <Select
                          value={
                            node.condition?.value === '' ? undefined : String(node.condition?.value)
                          }
                          options={[
                            { value: 'true', label: '是' },
                            { value: 'false', label: '否' },
                          ]}
                          onChange={(value) => condition({ value })}
                        />
                      ) : field && ['number', 'slider', 'rate'].includes(field.type) ? (
                        <InputNumber
                          style={{ width: '100%' }}
                          value={
                            typeof node.condition?.value === 'number' ? node.condition.value : null
                          }
                          onChange={(value) => condition({ value })}
                        />
                      ) : field?.type === 'checkbox' && node.condition?.operator !== 'contains' ? (
                        <Select
                          mode="multiple"
                          value={
                            Array.isArray(node.condition?.value)
                              ? (node.condition.value as string[])
                              : []
                          }
                          options={field.options}
                          onChange={(value) => condition({ value })}
                        />
                      ) : field?.options.length ? (
                        <Select
                          value={String(node.condition?.value ?? '')}
                          options={field.options}
                          onChange={(value) => condition({ value })}
                        />
                      ) : (
                        <Input
                          value={String(node.condition?.value ?? '')}
                          onChange={(event) => condition({ value: event.target.value })}
                        />
                      )}
                    </Form.Item>
                  </>
                )}
                {node.type === 'join' && (
                  <Typography.Text type="secondary">
                    此节点合并传入的分支后再继续工作流。
                  </Typography.Text>
                )}
              </>
            )}
            {edge && (
              <>
                <Typography.Paragraph>
                  {graph.nodes.find((n) => n.id === edge.source)?.name} →{' '}
                  {graph.nodes.find((n) => n.id === edge.target)?.name}
                </Typography.Paragraph>
                {graph.nodes.find((n) => n.id === edge.source)?.type === 'decision' && (
                  <Form.Item label="分支">
                    <Select
                      value={edge.branch}
                      options={[
                        { value: 'true', label: '是' },
                        { value: 'false', label: '否' },
                      ]}
                      onChange={(branch) =>
                        change({
                          ...graph,
                          edges: graph.edges.map((item) =>
                            item.id === edge.id ? { ...item, branch } : item,
                          ),
                        })
                      }
                    />
                  </Form.Item>
                )}
              </>
            )}
          </Form>
        </Card>
      </div>
      <Drawer
        open={previewOpen}
        title="工作流预览"
        width="min(1100px, 100vw)"
        onClose={() => {
          setPreviewOpen(false);
          invalidate();
        }}
        getContainer={() => document.body}
      >
        <Alert
          type="info"
          showIcon
          message="预览使用当前表单数据和已选择的审批决策。"
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical">
          <Form.Item
            label="表单数据 (JSON)"
            extra={
              fields.length
                ? `字段：${fields.map((f) => `${f.name} (${f.label})`).join('，')}`
                : undefined
            }
          >
            <Input.TextArea
              rows={6}
              value={data}
              onChange={(event) => {
                setData(event.target.value);
                invalidate();
              }}
              spellCheck={false}
            />
          </Form.Item>
          <Space wrap>
            {graph.nodes
              .filter((n) => n.type === 'approval')
              .map((n) => (
                <Form.Item key={n.id} label={n.name}>
                  <Select
                    style={{ width: 150 }}
                    value={approvals[n.id]}
                    allowClear
                    placeholder="选择结果"
                    options={[
                      { value: 'approve', label: '已通过' },
                      { value: 'reject', label: '已拒绝' },
                    ]}
                    onChange={(outcome) => {
                      const next = { ...approvals };
                      if (outcome) next[n.id] = outcome;
                      else delete next[n.id];
                      setApprovals(next);
                      invalidate();
                    }}
                  />
                </Form.Item>
              ))}
          </Space>
        </Form>
        <Button type="primary" loading={busy} onClick={() => void simulate()}>
          预览
        </Button>
        {error && <Alert style={{ marginTop: 16 }} showIcon type="error" message={error} />}
        {preview && (
          <>
            <Typography.Paragraph style={{ marginTop: 16 }}>
              状态：
              <Tag
                color={
                  preview.status === 'approved'
                    ? 'green'
                    : preview.status === 'rejected'
                      ? 'red'
                      : 'blue'
                }
              >
                {statusLabels[preview.status]}
              </Tag>
            </Typography.Paragraph>
            <GraphCanvas graph={graph} nodeRuns={preview.nodeRuns} edgeRuns={preview.edgeRuns} />
          </>
        )}
      </Drawer>
    </div>
  );
}
