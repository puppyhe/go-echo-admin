import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCC, unreadOwnReceipts } from '../src/pages/enterprise/collab/receipts/model.ts';
import { prepareSteps } from '../src/pages/enterprise/collab/model.ts';
import { sequenceToGraph } from '../src/pages/enterprise/collab/graph/graphModel.ts';

const schema = { version: 1, title: 'Test', layout: 'vertical', fields: [] };
const step = { id: 'a', name: 'Copy', approverIds: [1], mode: 'any', ccUserIds: [4, 5, 4] };
test('CC preparation validates IDs and preserves optional old definitions', () => {
  assert.equal(normalizeCC(undefined), undefined);
  assert.equal(normalizeCC([]), undefined);
  for (const ids of [[0], [-1], [1.1], [Number.MAX_SAFE_INTEGER + 1], Array(101).fill(1)])
    assert.throws(() => normalizeCC(ids), /at most 100 users/);
  const result = prepareSteps([step], schema)[0];
  assert.deepEqual(result.ccUserIds, [4, 5]);
  assert.equal(
    Object.hasOwn(prepareSteps([{ ...step, ccUserIds: undefined }], schema)[0], 'ccUserIds'),
    false,
  );
});
test('sequence to graph preserves CC for ordinary and conditional approvals without aliases', () => {
  const ordinary = { ...step };
  const conditional = {
    ...step,
    id: 'b',
    condition: { field: 'amount', operator: 'gt', value: 100 },
  };
  const graph = sequenceToGraph([ordinary, conditional]);
  const approvals = graph.nodes.filter((node) => node.type === 'approval');
  assert.equal(approvals.length, 2);
  for (const node of approvals) {
    assert.deepEqual(node.ccUserIds, step.ccUserIds);
    node.ccUserIds.push(99);
  }
  assert.deepEqual(step.ccUserIds, [4, 5, 4]);
  assert.ok(
    graph.nodes.filter((node) => node.type !== 'approval').every((node) => !node.ccUserIds),
  );
});
test('read controls target only own unread node receipts and retain repeated later node', () => {
  const rows = [
    { id: 1, userId: 5, nodeId: 'a', readAt: null },
    { id: 2, userId: 4, nodeId: 'a', readAt: null },
    { id: 3, userId: 5, nodeId: 'b', readAt: '2026-09-13T00:00:00Z' },
    { id: 4, userId: 5, nodeId: 'c', readAt: null },
  ];
  assert.deepEqual(
    unreadOwnReceipts(rows, 5).map((row) => row.id),
    [1, 4],
  );
  assert.deepEqual(unreadOwnReceipts(rows, 0), []);
  assert.deepEqual(unreadOwnReceipts(undefined, 5), []);
});
