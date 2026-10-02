import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canImportAPI,
  emptyQuery,
  filterValue,
  legacyQuery,
  prepareQuery,
  tableFields,
} from '../src/pages/systemTools/exportBuilder/model.ts';
const catalog = {
  limit: 10000,
  tables: [
    {
      key: 'exa_customers',
      label: 'customer',
      fields: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'customer_name', label: 'name', type: 'string' },
      ],
    },
    {
      key: 'sys_users',
      label: 'user',
      fields: [{ key: 'nick_name', label: 'nickname', type: 'string' }],
    },
  ],
  relations: [],
};
test('old API seed mapping and export limit survive conversion without raw SQL', () => {
  const row = {
    tableName: 'sys_apis',
    fieldList: JSON.stringify(
      ['path', 'method', 'description', 'api_group'].map((name) => ({ name, header: name })),
    ),
    limit: 9999,
    whereCond: 'deleted_at IS NULL',
    orderCond: 'id DESC',
    sql: '',
  };
  const query = legacyQuery(row);
  assert.equal(query.limit, 9999);
  assert.equal(query.sort[0].field, 'sys_apis.id');
  assert.equal(query.sort[0].direction, 'desc');
  assert.equal(canImportAPI(query), true);
  assert.throws(() => legacyQuery({ ...row, sql: 'select password from sys_users' }));
  assert.throws(() => legacyQuery({ ...row, whereCond: 'id IN (select id from sys_users)' }));
  assert.equal(canImportAPI({ ...query, table: 'sys_users' }), false);
});
test('joined fields and mapped headers retain explicit order, zero and false', () => {
  const query = {
    ...emptyQuery('exa_customers'),
    joins: [
      {
        table: 'sys_users',
        type: 'left',
        left: 'exa_customers.sys_user_id',
        right: 'sys_users.id',
      },
    ],
    fields: [
      { field: 'sys_users.nick_name', header: 'message' },
      { field: 'exa_customers.id', header: 'ID' },
    ],
    filters: [{ field: 'exa_customers.id', operator: 'eq', value: 0 }],
  };
  const result = prepareQuery(query, catalog);
  assert.equal(result.fields[0].header, 'message');
  assert.equal(result.filters[0].value, 0);
  assert.equal(tableFields(result, catalog).length, 3);
  assert.equal(filterValue(false, 'boolean', 'eq'), false);
  assert.equal(filterValue('001', 'string', 'eq'), '001');
  assert.deepEqual(filterValue(['0', '1'], 'number', 'between'), [0, 1]);
  assert.throws(() => filterValue(['1'], 'number', 'between'));
  assert.throws(() => filterValue('', 'number', 'eq'));
});
test('mapping and parameter validation reject duplicate headers, unknown fields and reserved names', () => {
  const query = {
    ...emptyQuery('exa_customers'),
    fields: [{ field: 'exa_customers.id', header: 'ID' }],
  };
  assert.throws(() =>
    prepareQuery(
      {
        ...query,
        fields: [...query.fields, { field: 'exa_customers.customer_name', header: 'ID' }],
      },
      catalog,
    ),
  );
  assert.throws(() =>
    prepareQuery(
      { ...query, fields: [{ field: 'sys_users.password', header: 'password' }] },
      catalog,
    ),
  );
  assert.throws(() =>
    prepareQuery(
      { ...query, filters: [{ field: 'exa_customers.id', operator: 'eq', parameter: 'limit' }] },
      catalog,
    ),
  );
  assert.throws(() => prepareQuery({ ...query, limit: 10001 }, catalog));
  const result = prepareQuery(
    { ...query, filters: [{ field: 'exa_customers.id', operator: 'eq', parameter: 'userId' }] },
    catalog,
  );
  assert.equal(result.filters[0].parameter, 'userId');
  assert.equal('value' in result.filters[0], false);
});
test('structured persisted query is isolated from editor mutations', () => {
  const stored = {
    query: {
      ...emptyQuery('exa_customers'),
      fields: [{ field: 'exa_customers.id', header: 'ID' }],
    },
  };
  const edited = legacyQuery(stored);
  edited.fields[0].header = 'Changed';
  assert.equal(stored.query.fields[0].header, 'ID');
});
