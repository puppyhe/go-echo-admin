import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftVersionLabel,
  filterCheckupIssues,
  persistWorkflow,
  workflowDraft,
} from '../src/pages/enterprise/collab/workflowModel.ts';
const workflow = {
  id: 9,
  name: 'message',
  code: 'purchase',
  category: 'message',
  enabled: true,
  description: '',
  formId: 2,
  steps: [{ id: 'step-1' }],
  sharedRoleIds: [888, 900],
  status: 'draft',
  revision: 4,
  version: 2,
  publishedDefinition: { name: 'messagereleasemessage', formId: 1, steps: [] },
};
test('workflow setting changes preserve revision and current grants without overwriting published snapshots', () => {
  const draft = workflowDraft(workflow);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.revision, 4);
  assert.deepEqual(draft.sharedRoleIds, [888, 900]);
  assert.equal(draft.formId, 2);
  assert.ok(!('publishedDefinition' in draft));
  assert.ok(!('version' in draft));
  assert.equal(draftVersionLabel(workflow), 'v3');
  assert.equal(draftVersionLabel({ status: 'published', version: 2 }), '—');
  assert.equal(workflow.publishedDefinition.formId, 1);
});
test('separate publishing uses the returned draft revision and preserves its ID when publication fails', async () => {
  const calls = [];
  let saved;
  const publishError = new Error('The published form is unavailable');
  const api = {
    async saveWorkflow(input, id) {
      calls.push(['save', id, input.status]);
      return { ...workflow, id: 42, revision: 8 };
    },
    async publishWorkflow(id, revision) {
      calls.push(['publish', id, revision]);
      assert.equal(saved.id, 42);
      throw publishError;
    },
  };
  await assert.rejects(
    () =>
      persistWorkflow(
        api,
        { ...workflowDraft(workflow), status: 'published' },
        undefined,
        true,
        (row) => {
          saved = row;
        },
      ),
    (error) => error === publishError,
  );
  assert.deepEqual(calls, [
    ['save', undefined, 'draft'],
    ['publish', 42, 8],
  ]);
  calls.length = 0;
  await persistWorkflow(api, workflowDraft(saved), saved.id, false, () => {});
  assert.deepEqual(
    calls,
    [['save', 42, 'draft']],
    'retry updates saved identity rather than creating a duplicate',
  );
});
test('checkup filtering preserves aggregated issues and never invents request links for private instances', () => {
  const privateIssue = {
    workflowId: 9,
    workflowName: 'message',
    scope: 'runtime',
    severity: 'error',
    code: 'pending_without_task',
    message: 'message',
    count: 4,
  };
  const issues = [
    privateIssue,
    { ...privateIssue, workflowId: 10, requestId: 99, count: 1 },
    { ...privateIssue, scope: 'definition', severity: 'warning' },
  ];
  const rows = filterCheckupIssues(issues, {
    scope: 'runtime',
    keyword: 'message',
    workflowId: 9,
    severity: 'error',
  });
  assert.deepEqual(rows, [privateIssue]);
  assert.equal(rows[0].count, 4);
  assert.equal(rows[0].requestId, undefined);
  assert.equal(filterCheckupIssues(issues, { scope: 'definition' }).length, 1);
});
