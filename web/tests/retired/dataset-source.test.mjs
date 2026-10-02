import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogFields,
  emptyConfig,
  parameterInputs,
  removeJoin,
} from '../src/pages/enterprise/analytics/source/model.ts';
import {
  datasetDraftPayload,
  outputFields,
  typedFilters,
} from '../src/pages/enterprise/analytics/model.ts';
const catalog = {
  tables: [
    {
      name: 'exa_customers',
      columns: [
        {
          name: 'customer_name',
          label: 'customer',
          type: 'string',
          aggregates: ['count', 'min', 'max'],
        },
      ],
    },
    {
      name: 'sys_users',
      columns: [{ name: 'id', label: 'ID', type: 'number', aggregates: ['count', 'sum'] }],
    },
  ],
};
const customerConfig = () => ({
  ...emptyConfig(),
  table: { name: 'exa_customers', alias: 'c' },
  fields: [{ key: 'customer', label: 'customername', column: 'c.customer_name' }],
});
test('source metadata and capability selection preserve explicit false and empty aggregate grants', () => {
  const config = customerConfig();
  config.fields[0].filterable = false;
  config.fields[0].aggregates = [];
  const source = catalogFields(config, catalog);
  assert.equal(source.fields[0].type, 'string');
  assert.equal(source.fields[0].filterable, false);
  assert.deepEqual(source.fields[0].aggregates, []);
  assert.equal(
    source.fields[0].column,
    undefined,
    'physical columns never become consumer metadata',
  );
});
test('removing an intermediate join also removes dependent later tables and fields without mutating the original', () => {
  const config = customerConfig();
  config.joins = [
    {
      type: 'left',
      table: { name: 'sys_users', alias: 'u' },
      left: 'c.sys_user_id',
      right: 'u.id',
    },
    { type: 'inner', table: { name: 'sys_users', alias: 'v' }, left: 'u.id', right: 'v.id' },
  ];
  config.fields.push(
    { key: 'uId', column: 'u.id', label: 'ID' },
    { key: 'vId', column: 'v.id', label: 'ID' },
  );
  const next = removeJoin(config, 0);
  assert.equal(next.joins.length, 0);
  assert.deepEqual(
    next.fields.map((f) => f.key),
    ['customer'],
  );
  assert.equal(config.fields.length, 3);
});
test('source draft retains only editable model definition and parameter binding, without copying published access or actor', () => {
  const config = customerConfig();
  const source = catalogFields(config, catalog);
  const input = {
    name: 'table',
    sourceMode: 'table',
    sourceConfig: config,
    source: 'main',
    description: '',
    kind: 'detail',
    columns: ['customer'],
    filters: [{ field: 'customer', operator: 'eq', parameter: 'name', value: 'stale' }],
    groupBy: [],
    metrics: [],
    orderBy: [],
    limit: 10,
    describeRoleIds: [100],
    queryRoleIds: [200],
    ownerId: 99,
    publishedDefinition: { sourceConfig: { sql: 'DO NOT COPY' } },
  };
  const body = datasetDraftPayload(input, source, { code: 'stable', lockVersion: 4 });
  assert.equal(body.sourceConfig, config);
  assert.equal(body.sourceMode, 'table');
  assert.equal(body.ownerId, undefined);
  assert.equal(body.publishedDefinition, undefined);
  assert.deepEqual(body.filters, [{ field: 'customer', operator: 'eq', parameter: 'name' }]);
  assert.equal(body.lockVersion, 4);
});
test('consumer output types resolve from published field metadata even without privileged source catalog', () => {
  const dataset = {
    columns: ['id'],
    groupBy: [],
    metrics: [{ field: '*', aggregate: 'count', alias: 'total' }],
    fields: [{ key: 'id', label: 'ID', type: 'number', aggregates: ['count'] }],
  };
  dataset.metrics = [];
  assert.deepEqual(outputFields(dataset), [{ key: 'id', label: 'ID', type: 'number' }]);
  assert.deepEqual(parameterInputs('{"amount":0,"name":"Alice"}'), { amount: 0, name: 'Alice' });
  assert.throws(() => parameterInputs('[]'), /object/);
  assert.throws(() => parameterInputs('null'), /object/);
  assert.throws(() => parameterInputs('not-json'));
  assert.deepEqual(
    typedFilters([{ field: 'number', operator: 'gte', parameter: 'minimum' }], {
      fields: [{ key: 'number', type: 'number' }],
    }),
    [{ field: 'number', operator: 'gte', parameter: 'minimum' }],
  );
});

test('new source models start empty and registered capability denials survive model overrides', () => {
  assert.equal(emptyConfig().table.name, '');
  assert.deepEqual(emptyConfig().fields, []);
  const config = customerConfig();
  config.fields[0].filterable = true;
  config.fields[0].selectable = true;
  const restricted = structuredClone(catalog);
  restricted.tables[0].columns[0].filterable = false;
  restricted.tables[0].columns[0].selectable = false;
  const source = catalogFields(config, restricted);
  assert.equal(source.fields[0].filterable, false);
  assert.equal(source.fields[0].selectable, false);
});
