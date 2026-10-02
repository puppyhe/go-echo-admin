import test from 'node:test';
import assert from 'node:assert/strict';
import {
  delegationInput,
  validateDelegation,
  MAX_DELEGATION_DURATION,
} from '../src/pages/enterprise/collab/delegations/model.ts';
import { delegationsApi } from '../src/pages/enterprise/collab/delegations/api.ts';
const now = Date.parse('2030-01-01T00:00:00Z');
const candidates = {
  users: [{ id: 2, name: 'approvalmessage' }],
  workflows: [{ id: 3, name: 'message', code: 'purchase' }],
};
const input = {
  delegateId: 2,
  workflowId: 0,
  startsAt: '2030-01-02T00:00:00Z',
  endsAt: '2030-01-03T00:00:00Z',
  enabled: true,
  revision: 0,
};
const row = {
  ...input,
  id: 4,
  ownerId: 1,
  revision: 7,
  delegateName: 'approvalmessage',
  workflowName: 'allworkflow',
  state: 'scheduled',
};
const validate = (value, records = [], available = candidates, id) =>
  validateDelegation(value, records, available, id, now);
test('delegation form validates recipient, candidate scope, revision and bounded valid dates', () => {
  validate(input);
  for (const delta of [
    { delegateId: 0 },
    { delegateId: 99 },
    { workflowId: 99 },
    { workflowId: -1 },
    { revision: 1 },
    { revision: NaN },
    { startsAt: 'invalid' },
    { endsAt: input.startsAt },
    { endsAt: '2029-12-31T00:00:00Z' },
    { enabled: 'true' },
  ])
    assert.throws(() => validate({ ...input, ...delta }));
  assert.throws(() => validate({ ...input, revision: 0 }, [], candidates, 4));
  assert.throws(() => validateDelegation(input, [], undefined, undefined, now), /Workflow data is unavailable/);
  validate({
    ...input,
    endsAt: new Date(Date.parse(input.startsAt) + MAX_DELEGATION_DURATION).toISOString(),
  });
  assert.throws(
    () =>
      validate({
        ...input,
        endsAt: new Date(Date.parse(input.startsAt) + MAX_DELEGATION_DURATION + 1).toISOString(),
      }),
    /366/,
  );
  assert.throws(
    () => validate({ ...input, startsAt: '2029-12-30T00:00:00Z', endsAt: '2029-12-31T00:00:00Z' }),
    /future/,
  );
});
test('enabled periods are half-open; specific and all-workflow rules coexist; editing excludes itself', () => {
  assert.throws(() => validate(input, [row]), /overlaps an enabled delegation/);
  validate({ ...input, startsAt: row.endsAt, endsAt: '2030-01-04T00:00:00Z' }, [row]);
  validate({ ...input, startsAt: '2030-01-01T01:00:00Z', endsAt: row.startsAt }, [row]);
  assert.throws(
    () =>
      validate({ ...input, startsAt: '2030-01-02T23:59:59.999Z', endsAt: '2030-01-04T00:00:00Z' }, [
        row,
      ]),
    /overlaps an enabled delegation/,
  );
  validate({ ...input, workflowId: 3 }, [row]);
  validate({ ...input, revision: 7 }, [row], candidates, row.id);
  validate(input, [{ ...row, enabled: false }]);
});
test('disabled rules preserve previous fields and revision without needing an active recipient', () => {
  const disabled = delegationInput({
    ...row,
    enabled: false,
    delegateName: 'DO NOT SEND',
    state: 'active',
    ownerId: 999,
  });
  assert.deepEqual(disabled, { ...input, enabled: false, revision: 7 });
  assert.deepEqual(
    Object.keys(disabled).sort(),
    ['delegateId', 'workflowId', 'startsAt', 'endsAt', 'enabled', 'revision'].sort(),
  );
  validateDelegation(disabled, [row], undefined, row.id, now);
});
test('time zones are compared as instants rather than local date strings', () => {
  validate(
    { ...input, startsAt: '2030-01-03T08:00:00+08:00', endsAt: '2030-01-04T08:00:00+08:00' },
    [row],
  );
  assert.throws(
    () =>
      validate(
        { ...input, startsAt: '2030-01-03T07:59:59+08:00', endsAt: '2030-01-04T08:00:00+08:00' },
        [row],
      ),
    /overlaps an enabled delegation/,
  );
});
test('HTTP contract uses own routes and preserves revision for edits, toggle and delete; API conflicts surface', async () => {
  const oldFetch = globalThis.fetch,
    oldStorage = globalThis.sessionStorage;
  const calls = [];
  globalThis.sessionStorage = {
    getItem: (key) => (key === 'token' ? 'test-session' : null),
    setItem() {},
  };
  let reject = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(
        reject
          ? { code: 409, msg: 'Delegation changed. Refresh before saving.' }
          : {
              code: 0,
              data: url.endsWith('/candidates')
                ? candidates
                : url.endsWith('/delegations') && options.method === 'GET'
                  ? { list: [row] }
                  : row,
            },
      ),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    assert.deepEqual(await delegationsApi.list(), { list: [row] });
    assert.deepEqual(await delegationsApi.candidates(), candidates);
    await delegationsApi.create(input);
    await delegationsApi.update(row.id, delegationInput({ ...row, enabled: false }));
    await delegationsApi.remove(row.id, row.revision);
    assert.deepEqual(
      calls.map((call) => [call.options.method, call.url]),
      [
        ['GET', '/api/enterprise/collab/delegations'],
        ['GET', '/api/enterprise/collab/delegations/candidates'],
        ['POST', '/api/enterprise/collab/delegations'],
        ['PUT', '/api/enterprise/collab/delegations/4'],
        ['DELETE', '/api/enterprise/collab/delegations/4'],
      ],
    );
    assert.deepEqual(JSON.parse(calls[2].options.body), input);
    assert.deepEqual(JSON.parse(calls[3].options.body), { ...input, enabled: false, revision: 7 });
    assert.deepEqual(JSON.parse(calls[4].options.body), { revision: 7 });
    reject = true;
    await assert.rejects(
      delegationsApi.update(row.id, delegationInput(row)),
      (error) => error.code === 409 && error.message === 'Delegation changed. Refresh before saving.',
    );
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.sessionStorage = oldStorage;
  }
});
