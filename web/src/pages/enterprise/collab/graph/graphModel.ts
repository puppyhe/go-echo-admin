import { prepareAssignee } from '../assigneeModel';
import { conditionFields, type FormDesign } from '../../../systemTools/formDesign';
import { allowedOperators, conditionValue } from '../model';
import type { GraphNode, GraphNodeType, WorkflowGraph, WorkflowStep } from '../types';

export const nodeLabels: Record<GraphNodeType, string> = {
  start: 'Start',
  approval: 'Approval',
  decision: 'Condition',
  fork: 'Parallel split',
  join: 'Merge',
  success: 'Success',
  failure: 'Failure',
};
export const runLabels: Record<string, string> = {
  dormant: 'Not started',
  pending: 'Pending approval',
  waiting: 'Waiting',
  completed: 'Completed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  failed: 'Failed',
};
export function graphID(prefix = 'node'): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}
export function newNode(type: GraphNodeType, index: number): GraphNode {
  return {
    id: graphID(),
    type,
    name: nodeLabels[type],
    x: 60 + (index % 4) * 210,
    y: 60 + Math.floor(index / 4) * 140,
    ...(type === 'approval' ? { approverIds: [], mode: 'any' as const } : {}),
  };
}
export function removeSelection(graph: WorkflowGraph, selected: string): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== selected),
    edges: graph.edges.filter(
      (e) => e.id !== selected && e.source !== selected && e.target !== selected,
    ),
  };
}
export function moveNode(graph: WorkflowGraph, id: string, x: number, y: number): WorkflowGraph {
  const bound = (value: number) =>
    Math.max(0, Math.min(10000, Number.isFinite(value) ? Math.round(value) : 0));
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === id ? { ...node, x: bound(x), y: bound(y) } : node,
    ),
  };
}
export function connectNodes(graph: WorkflowGraph, source: string, target: string): WorkflowGraph {
  const node = graph.nodes.find((n) => n.id === source);
  if (!node || !graph.nodes.some((n) => n.id === target)) throw new Error('Source or target node was not found');
  if (source === target) throw new Error('A node cannot connect to itself');
  if (graph.edges.some((e) => e.source === source && e.target === target))
    throw new Error('This connection already exists');
  if (graph.edges.length >= 400) throw new Error('A workflow cannot exceed 400 connections');
  const used = graph.edges.filter((e) => e.source === source).map((e) => e.branch);
  const branch = node.type === 'decision' ? (used.includes('true') ? 'false' : 'true') : undefined;
  return {
    ...graph,
    edges: [...graph.edges, { id: graphID('edge'), source, target, ...(branch ? { branch } : {}) }],
  };
}
/** Conditional sequential steps become explicit decision/merge pairs. */
export function sequenceToGraph(steps: WorkflowStep[]): WorkflowGraph {
  const graph: WorkflowGraph = {
    version: 1,
    nodes: [{ id: 'start', type: 'start', name: 'Start', x: 300, y: 40 }],
    edges: [],
  };
  let previous = 'start';
  let y = 160;
  const link = (source: string, target: string, branch?: 'true' | 'false') =>
    graph.edges.push({
      id: `edge_${graph.edges.length}`,
      source,
      target,
      ...(branch ? { branch } : {}),
    });
  steps.forEach((step, index) => {
    const id = `approval_${index}`;
    if (step.condition) {
      const decision = `decision_${index}`,
        join = `join_${index}`;
      graph.nodes.push({
        id: decision,
        type: 'decision',
        name: `${step.name} · Condition`,
        x: 300,
        y,
        condition: structuredClone(step.condition),
      });
      link(previous, decision);
      graph.nodes.push({
        id,
        type: 'approval',
        name: step.name,
        x: 70,
        y: y + 120,
        approverIds: [...(step.approverIds ?? [])],
        ...(step.assignee ? { assignee: structuredClone(step.assignee) } : {}),
        ...(step.ccUserIds?.length ? { ccUserIds: [...step.ccUserIds] } : {}),
        mode: step.mode,
      });
      graph.nodes.push({ id: join, type: 'join', name: 'Merge', x: 300, y: y + 240 });
      link(decision, id, 'true');
      link(decision, join, 'false');
      link(id, join);
      previous = join;
      y += 360;
    } else {
      graph.nodes.push({
        id,
        type: 'approval',
        name: step.name,
        x: 300,
        y,
        approverIds: [...(step.approverIds ?? [])],
        ...(step.assignee ? { assignee: structuredClone(step.assignee) } : {}),
        ...(step.ccUserIds?.length ? { ccUserIds: [...step.ccUserIds] } : {}),
        mode: step.mode,
      });
      link(previous, id);
      previous = id;
      y += 120;
    }
  });
  graph.nodes.push({ id: 'success', type: 'success', name: 'Approved', x: 300, y });
  link(previous, 'success');
  return graph;
}
export function prepareGraph(graph: WorkflowGraph, schema: FormDesign): WorkflowGraph {
  const fields = conditionFields(schema.fields);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.type === 'approval') return { ...node, ...prepareAssignee(node) };
      if (node.type !== 'decision' || !node.condition) return { ...node };
      const field = fields.find((field) => field.name === node.condition?.field);
      if (!field || !allowedOperators(field).includes(node.condition.operator))
        throw new Error(`「${node.name}」condition field is unavailable or has an unsupported operator`);
      return {
        ...node,
        condition: {
          ...node.condition,
          value: conditionValue(field, node.condition.value, node.condition.operator),
        },
      };
    }),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}
