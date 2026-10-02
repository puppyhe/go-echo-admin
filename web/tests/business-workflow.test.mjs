import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareAssignee, assigneeLabel } from '../src/pages/enterprise/collab/assigneeModel.ts';
import { prepareSteps } from '../src/pages/enterprise/collab/model.ts';
import { prepareGraph, sequenceToGraph } from '../src/pages/enterprise/collab/graph/graphModel.ts';
import { workflowDraft, persistWorkflow } from '../src/pages/enterprise/collab/workflowModel.ts';
import { collabApi } from '../src/pages/enterprise/collab/api.ts';

const schema = {
  version: 1,
  title: 'purchase order',
  layout: 'vertical',
  fields: [
    { id: 'amount', name: 'amount', label: 'message', type: 'number', options: [], disabled: false },
  ],
};
const step = {
  id: 'manager',
  name: 'departmentmessage',
  approverIds: [],
  assignee: { kind: 'department_leader' },
  mode: 'all',
  condition: { field: 'amount', operator: 'gte', value: '100' },
};
test('dynamic assignments keep their meaning through publishing and graph conversion', () => {
  const prepared = prepareSteps([step], schema)[0];
  assert.equal(prepared.assignee.kind, 'department_leader');
  assert.deepEqual(prepared.approverIds, []);
  assert.equal(prepared.condition.value, 100);
  const graph = prepareGraph(sequenceToGraph([step]), schema);
  const approval = graph.nodes.find((node) => node.type === 'approval');
  assert.equal(approval.assignee.kind, 'department_leader');
  approval.assignee.kind = 'users';
  assert.equal(step.assignee.kind, 'department_leader');
  const role = prepareAssignee({ approverIds: [], assignee: { kind: 'role', ids: [7, 7, 8] } });
  assert.deepEqual(role.assignee.ids, [7, 8]);
  assert.equal(assigneeLabel(role), '2 roles');
  assert.equal(assigneeLabel(step), 'Requester department leader');
  assert.equal(
    sequenceToGraph([{ ...step, approverIds: null }]).nodes.find((node) => node.type === 'approval')
      .assignee.kind,
    'department_leader',
  );
});
test('assignment validation refuses mixed sources and invalid IDs without fabricating candidates', () => {
  for (const input of [
    { approverIds: [1], assignee: { kind: 'role', ids: [7] } },
    { assignee: { kind: 'role', ids: [] } },
    { assignee: { kind: 'users', ids: [] } },
    { assignee: { kind: 'department_leader', ids: [0] } },
    { assignee: { kind: 'role', ids: [true] } },
    { assignee: { kind: 'role', ids: Array.from({ length: 101 }, (_, i) => i + 1) } },
    { approverIds: [] },
  ])
    assert.throws(() => prepareAssignee(input));
  const custom = { assignee: { kind: 'regional_manager', config: { region: 'east' } } };
  const result = prepareAssignee(custom);
  result.assignee.config.region = 'west';
  assert.equal(custom.assignee.config.region, 'east');
});
test('workflow updates and publish preserve the business binding and revision', async () => {
  const value = {
    name: 'messageapproval',
    formId: 0,
    businessType: 'purchase_order',
    revision: 4,
    steps: [step],
    sharedRoleIds: [9],
  };
  const draft = workflowDraft(value);
  assert.equal(draft.businessType, 'purchase_order');
  assert.equal(draft.formId, 0);
  let saved;
  await persistWorkflow(
    {
      saveWorkflow: async (input) => {
        assert.equal(input.businessType, 'purchase_order');
        return { ...input, id: 12, revision: 5 };
      },
      publishWorkflow: async (id, revision) => {
        assert.equal(id, 12);
        assert.equal(revision, 5);
        assert.equal(saved.businessType, 'purchase_order');
        return saved;
      },
    },
    draft,
    undefined,
    true,
    (row) => {
      saved = row;
    },
  );
});
test('business graph operations send server-registered type and schema stays read-only metadata', async (t) => {
  const previous = { fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  globalThis.sessionStorage = { getItem: () => null };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
    return new Response(
      JSON.stringify({
        code: 0,
        data: url.endsWith('/business-types')
          ? [{ type: 'purchase_order', schema }]
          : { valid: true, issues: [] },
      }),
    );
  };
  const choices = await collabApi.businessTypes();
  assert.equal(choices[0].schema.title, 'purchase order');
  await collabApi.validateGraph({
    formId: 0,
    businessType: 'purchase_order',
    graph: sequenceToGraph([step]),
  });
  await collabApi.previewGraph({
    formId: 0,
    businessType: 'purchase_order',
    graph: sequenceToGraph([step]),
    data: { amount: 120 },
  });
  assert.equal(requests[1].body.businessType, 'purchase_order');
  assert.equal(requests[1].body.formId, 0);
  assert.equal(requests[2].body.businessType, 'purchase_order');
  assert.equal(Object.hasOwn(requests[1].body, 'schema'), false);
});
