import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connectNodes,
  moveNode,
  prepareGraph,
  removeSelection,
  sequenceToGraph,
} from '../src/pages/enterprise/collab/graph/graphModel.ts';
import { workflowDraft } from '../src/pages/enterprise/collab/workflowModel.ts';
const scalar = (type, name) => ({
  id: name,
  type,
  name,
  label: name,
  options: [],
  required: false,
  disabled: false,
});

test('graph edit operations preserve the source, clamp drag coordinates and delete connected edges', () => {
  const original = sequenceToGraph([
    { id: 'old-step', name: 'approval', approverIds: [3], mode: 'all' },
  ]);
  const moved = moveNode(original, 'approval_0', -99, 12000);
  assert.equal(moved.nodes[1].x, 0);
  assert.equal(moved.nodes[1].y, 10000);
  assert.equal(original.nodes[1].x, 300);
  const removed = removeSelection(moved, 'approval_0');
  assert.equal(removed.nodes.length, 2);
  assert.equal(removed.edges.length, 0);
  assert.equal(original.edges.length, 2);
  assert.equal(removeSelection(original, original.edges[0].id).nodes.length, 3);
  assert.equal(removeSelection(original, original.edges[0].id).edges.length, 1);
});
test('connecting validates endpoints and labels decision branches without inventing execution behavior', () => {
  const graph = {
    version: 1,
    nodes: ['source', 'yes', 'no'].map((id, i) => ({
      id,
      type: i ? 'success' : 'decision',
      name: id,
      x: 0,
      y: 0,
    })),
    edges: [],
  };
  const one = connectNodes(graph, 'source', 'yes');
  const two = connectNodes(one, 'source', 'no');
  assert.deepEqual(
    two.edges.map((e) => e.branch),
    ['true', 'false'],
  );
  assert.equal(graph.edges.length, 0);
  assert.throws(() => connectNodes(two, 'source', 'yes'), /already exists/);
  assert.throws(() => connectNodes(two, 'source', 'source'), /itself/);
  assert.throws(() => connectNodes(two, 'source', 'missing'), /not found/);
});
test('sequential conversion preserves approval policy and conditional skipped paths through explicit merges', () => {
  const steps = [
    {
      id: '9-uuid',
      name: 'message',
      approverIds: [3, 4],
      mode: 'all',
      condition: { field: 'amount', operator: 'gt', value: 100 },
    },
    { id: 'next', name: 'message', approverIds: [5], mode: 'any' },
  ];
  const graph = sequenceToGraph(steps);
  const decision = graph.nodes.find((n) => n.type === 'decision');
  const approval = graph.nodes.find((n) => n.id === 'approval_0');
  const join = graph.nodes.find((n) => n.type === 'join');
  assert.deepEqual(approval.approverIds, [3, 4]);
  assert.equal(approval.mode, 'all');
  assert.deepEqual(decision.condition, steps[0].condition);
  assert.ok(
    graph.edges.some(
      (e) => e.source === decision.id && e.target === join.id && e.branch === 'false',
    ),
  );
  assert.ok(graph.edges.some((e) => e.source === approval.id && e.target === join.id));
  assert.ok(graph.nodes.every((n) => /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(n.id)));
  graph.nodes[1].condition.value = 500;
  assert.equal(steps[0].condition.value, 100);
});
test('graph conditions use typed values in layout containers and exclude subform fields', () => {
  const schema = {
    fields: [
      {
        ...scalar('group', ''),
        children: [scalar('switch', 'enabled'), scalar('number', 'amount')],
      },
      { ...scalar('subform', 'lines'), children: [scalar('number', 'secret')] },
    ],
  };
  const graph = sequenceToGraph([
    {
      id: 'one',
      name: 'messageapproval',
      approverIds: [3],
      mode: 'any',
      condition: { field: 'enabled', operator: 'eq', value: 'false' },
    },
  ]);
  const normalized = prepareGraph(graph, schema);
  assert.equal(normalized.nodes.find((n) => n.type === 'decision').condition.value, false);
  assert.equal(graph.nodes.find((n) => n.type === 'decision').condition.value, 'false');
  graph.nodes.find((n) => n.type === 'decision').condition = {
    field: 'amount',
    operator: 'gte',
    value: '0',
  };
  assert.equal(prepareGraph(graph, schema).nodes[1].condition.value, 0);
  graph.nodes[1].condition.field = 'secret';
  assert.throws(() => prepareGraph(graph, schema), /condition field/);
});
test('workflow settings preserve current graph and revision, without copying historical authorization', () => {
  const graph = sequenceToGraph([]);
  const draft = workflowDraft({
    executionMode: 'graph',
    graph,
    revision: 5,
    sharedRoleIds: [900],
    publishedDefinition: { sharedRoleIds: [901], graph: sequenceToGraph([]) },
  });
  assert.equal(draft.graph, graph);
  assert.equal(draft.executionMode, 'graph');
  assert.equal(draft.revision, 5);
  assert.deepEqual(draft.sharedRoleIds, [900]);
  assert.equal(draft.publishedDefinition, undefined);
});
