import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fieldValue,
  generatedSearch,
  prepareGeneratedRow,
  flattenGeneratedRows,
} from '../src/features/autoCode/generatedFields.ts';
import { parseHistoryForm } from '../src/domain/autoCode.ts';
const field = (key, type, extra = {}) => ({
  key,
  title: key,
  type,
  form: true,
  table: true,
  detail: true,
  search: '',
  required: false,
  ...extra,
});
test('generated row retains hidden fields and primary key while updating zero, false, JSON and clearing text', () => {
  const fields = [
    field('key', 'string', { primaryKey: true }),
    field('amount', 'float64'),
    field('enabled', 'bool'),
    field('label', 'string'),
    field('hidden', 'string', { form: false }),
    field('payload', 'json'),
  ];
  const config = { primaryKey: 'key', fields, tree: false };
  const row = prepareGeneratedRow(
    config,
    { amount: 0, enabled: false, label: '', payload: '{"ok":true}' },
    { key: "a'b", amount: 5, enabled: true, label: 'old', hidden: 'keep', children: [{ id: 1 }] },
  );
  assert.deepEqual(row, {
    key: "a'b",
    amount: 0,
    enabled: false,
    label: '',
    hidden: 'keep',
    payload: { ok: true },
  });
  assert.equal(Object.hasOwn(prepareGeneratedRow(config, {}), 'amount'), false);
});
test('generated filters preserve typed false/zero, validate ranges and reject invalid numeric values', () => {
  const fields = [
    field('enabled', 'bool', { search: '=' }),
    field('amount', 'float64', { search: 'BETWEEN' }),
    field('ids', 'uint', { search: 'IN' }),
  ];
  assert.deepEqual(generatedSearch(fields, { enabled: false, amount: '0,10', ids: '0,2,3' }), {
    enabled: false,
    amount: [0, 10],
    ids: [0, 2, 3],
  });
  assert.throws(() => generatedSearch(fields, { amount: '1' }), /message/);
  assert.throws(() => generatedSearch(fields, { ids: '-1' }), /message/);
  assert.throws(() => fieldValue(field('amount', 'float64'), 'NaN'), /message/);
  assert.throws(() => fieldValue(field('count', 'int64'), '9007199254740993'), /message/);
});
test('generated relation and complex controls produce actual typed arrays and date JSON', () => {
  assert.deepEqual(
    fieldValue(field('categories', 'uint', { dataSource: { association: 2 } }), ['0', '2']),
    [0, 2],
  );
  assert.deepEqual(fieldValue(field('tags', '[]string'), '["a","b"]'), ['a', 'b']);
  assert.throws(() => fieldValue(field('files', 'file'), '{}'), /JSONmessage/);
  assert.throws(() => fieldValue(field('payload', 'json'), '{broken'), /JSON/);
  assert.equal(
    fieldValue(field('at', 'time.Time'), '2026-01-01T08:00:00+08:00'),
    '2026-01-01T00:00:00.000Z',
  );
  assert.deepEqual(
    flattenGeneratedRows([{ id: 1, children: [{ id: 2 }] }]).map((row) => row.id),
    [1, 2],
  );
});
test('generator history retains independent filenames and advanced field settings', () => {
  const form = parseHistoryForm({
    package: 'business',
    packageName: 'ordersClient',
    humpPackageName: 'orderStore',
    treeJson: 'name',
    isTree: true,
    fields: [
      {
        fieldName: 'Status',
        fieldJson: 'status',
        columnName: 'status',
        fieldType: 'int',
        defaultValue: '0',
        fieldIndexType: 'index',
        form: false,
        table: false,
        desc: true,
        excel: true,
        dictType: 'status',
        dataSource: { table: 'statuses', label: 'name', value: 'id', association: 1 },
      },
    ],
  });
  assert.equal(form.package, 'business');
  assert.equal(form.packageName, 'ordersClient');
  assert.equal(form.humpPackageName, 'orderStore');
  assert.equal(form.treeJson, 'name');
  assert.equal(form.fields[0].form, false);
  assert.equal(form.fields[0].table, false);
  assert.equal(form.fields[0].defaultValue, '0');
  assert.equal(form.fields[0].dataSource.table, 'statuses');
});
