import assert from 'node:assert/strict';
import test from 'node:test';
import {
  datasetDraftPayload,
  outputFields,
  roleIDs,
  typedFilters,
} from '../src/pages/enterprise/analytics/model.ts';

const source = {
  key: 'requests',
  label: 'message',
  fields: [
    { key: 'id', label: 'message', type: 'number', aggregates: ['count'] },
    { key: 'status', label: 'status', type: 'string', aggregates: ['count'] },
    { key: 'createdAt', label: 'createmessage', type: 'datetime', aggregates: ['min', 'max'] },
    { key: 'enabled', label: 'enable', type: 'boolean', aggregates: ['count'] },
  ],
  ownerScoped: true,
};
const dataset = { columns: ['id', 'status'], groupBy: [], metrics: [] };
test('analytics output metadata uses group-only queries and aggregate result types', () => {
  assert.deepEqual(outputFields({ ...dataset, columns: [], groupBy: ['status'] }, source), [
    { key: 'status', label: 'status', type: 'string' },
  ]);
  const fields = outputFields(
    {
      ...dataset,
      columns: [],
      metrics: [
        { field: '*', aggregate: 'count', alias: 'totalCount' },
        { field: 'createdAt', aggregate: 'min', alias: 'firstCreated' },
      ],
    },
    source,
  );
  assert.deepEqual(
    fields.map((field) => field.type),
    ['number', 'datetime'],
  );
  assert.deepEqual(
    outputFields(dataset, source).map((field) => field.key),
    ['id', 'status'],
  );
});
test('filter editor turns tag lists into typed IN values and drops stale null comparison values', () => {
  assert.deepEqual(
    typedFilters(
      [
        { field: 'id', operator: 'in', value: ['1', '2'] },
        { field: 'enabled', operator: 'eq', value: 'false' },
        { field: 'id', operator: 'isNull', value: 'old' },
      ],
      source,
    ),
    [
      { field: 'id', operator: 'in', value: [1, 2] },
      { field: 'enabled', operator: 'eq', value: false },
      { field: 'id', operator: 'isNull' },
    ],
  );
  for (const value of ['', ' ', true, [], {}, Infinity])
    assert.throws(() => typedFilters([{ field: 'id', operator: 'eq', value }], source));
  assert.throws(() => typedFilters([{ field: 'id', operator: 'in', value: [] }], source));
  assert.throws(() => typedFilters([{ field: 'missing', operator: 'eq', value: 1 }], source));
});
test('shared role IDs reject coerced booleans and objects and keep unique numeric identities', () => {
  assert.deepEqual(roleIDs(['888', 888, '9']), [888, 9]);
  for (const values of [[true], [0], ['-1'], [{}], ['1.2'], ['9007199254740992']])
    assert.throws(() => roleIDs(values));
});

const editor = {
  name: 'message',
  code: 'request_summary',
  description: '',
  source: 'requests',
  kind: 'detail',
  columns: ['id', 'status'],
  groupBy: [],
  metrics: [],
  filters: [],
  orderBy: [],
  limit: 100,
};
test('dataset drafts keep describe and query policies separate, including explicit revocation', () => {
  const payload = datasetDraftPayload(
    { ...editor, describeRoleIds: ['100', 100], queryRoleIds: [], sharedRoleIds: [100] },
    source,
  );
  assert.deepEqual(payload.describeRoleIds, [100]);
  assert.deepEqual(payload.queryRoleIds, []);
  assert.equal(Object.hasOwn(payload, 'sharedRoleIds'), false);
  assert.throws(() => datasetDraftPayload({ ...editor, queryRoleIds: [true] }, source));
});
test('dataset draft saves preserve server code and CAS while excluding publication and owner fields', () => {
  const payload = datasetDraftPayload(
    {
      ...editor,
      code: 'changed',
      ownerId: 9,
      draftRevision: 999,
      publishedRevision: 999,
      publishedDefinition: { name: 'forged' },
      lockVersion: 999,
    },
    source,
    { code: 'stable_code', lockVersion: 4 },
  );
  assert.equal(payload.code, 'stable_code');
  assert.equal(payload.lockVersion, 4);
  for (const key of ['ownerId', 'publishedRevision', 'draftRevision', 'publishedDefinition'])
    assert.equal(Object.hasOwn(payload, key), false);
});
test('dataset draft mode switches discard hidden aggregate fields and convert source filters', () => {
  const input = {
    ...editor,
    groupBy: ['status'],
    metrics: [{ field: '*', aggregate: 'count', alias: 'total' }],
    filters: [{ field: 'id', operator: 'eq', value: '42' }],
  };
  const detail = datasetDraftPayload(input, source);
  assert.deepEqual(detail.groupBy, []);
  assert.deepEqual(detail.metrics, []);
  assert.equal(detail.filters[0].value, 42);
  const aggregate = datasetDraftPayload({ ...input, kind: 'aggregate' }, source);
  assert.deepEqual(aggregate.columns, []);
  assert.deepEqual(aggregate.groupBy, ['status']);
  assert.throws(() => datasetDraftPayload({ ...editor, source: 'customers' }, source));
});
