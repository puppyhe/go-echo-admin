import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldFromColumn, goTypeFromColumn, parseHistoryForm } from '../src/domain/autoCode.ts';
import { prepareGeneratedRow } from '../src/features/autoCode/generatedFields.ts';

test('MySQL catalog columns preserve booleans, unsigned keys, nullability and empty defaults', () => {
  const enabled = fieldFromColumn({
    columnName: 'enabled',
    columnType: 'tinyint(1)',
    nullable: false,
    hasDefault: true,
    defaultValue: '0',
  });
  assert.equal(enabled.fieldType, 'bool');
  assert.equal(enabled.defaultValue, 'false');
  assert.equal(enabled.require, false);
  assert.equal(enabled.notNull, true);
  const id = fieldFromColumn({
    columnName: 'id',
    columnType: 'bigint unsigned',
    nullable: false,
    primaryKey: true,
    autoIncrement: true,
  });
  assert.equal(id.fieldType, 'uint64');
  assert.equal(id.form, false);
  assert.equal(id.require, false);
  const title = fieldFromColumn({
    columnName: 'title',
    columnType: 'varchar(120)',
    nullable: false,
    hasDefault: true,
    defaultValue: '',
    dataTypeLong: '120',
  });
  assert.equal(title.hasDefault, true);
  assert.equal(title.require, false);
  assert.equal(title.dataTypeLong, '120');
  assert.equal(
    fieldFromColumn({ columnName: 'amount', columnType: 'int', nullable: false }).require,
    true,
  );
});

test('PostgreSQL catalog columns normalize quoted defaults, serial keys, JSON and timestamps', () => {
  assert.equal(goTypeFromColumn('int8'), 'int64');
  assert.equal(goTypeFromColumn('jsonb'), 'json');
  assert.equal(goTypeFromColumn('date'), 'time.Time');
  assert.equal(goTypeFromColumn('timestamp with time zone'), 'time.Time');
  const title = fieldFromColumn({
    columnName: 'title',
    columnType: 'character varying',
    nullable: true,
    hasDefault: true,
    defaultValue: "'it''s ready'::character varying",
  });
  assert.equal(title.defaultValue, "it's ready");
  assert.equal(title.nullable, true);
  assert.equal(
    fieldFromColumn({
      columnName: 'created_at',
      columnType: 'timestamp',
      defaultValue: 'now()',
      hasDefault: true,
    }).defaultValue,
    'CURRENT_TIMESTAMP',
  );
  assert.equal(
    fieldFromColumn({
      columnName: 'id',
      columnType: 'bigint',
      primaryKey: true,
      autoIncrement: true,
      defaultValue: "nextval('items_id_seq'::regclass)",
      hasDefault: true,
    }).defaultValue,
    '',
  );
  const restored = parseHistoryForm({ fields: [title] }).fields[0];
  assert.equal(restored.nullable, true);
  assert.equal(restored.hasDefault, true);
});

test('generated nullable values round-trip SQL NULL independently from zero and false', () => {
  const fields = ['amount', 'enabled', 'label'].map((key, i) => ({
    key,
    title: key,
    type: ['int', 'bool', 'string'][i],
    form: true,
    nullable: true,
  }));
  const config = { fields, tree: false };
  assert.deepEqual(
    prepareGeneratedRow(config, {}, { id: 1, amount: 2, enabled: true, label: 'old' }),
    { id: 1, amount: null, enabled: null, label: null },
  );
  assert.deepEqual(prepareGeneratedRow(config, { amount: 0, enabled: false, label: 'new' }), {
    amount: 0,
    enabled: false,
    label: 'new',
  });
});

test('database expressions remain database-owned instead of becoming literal values', () => {
  const key = fieldFromColumn({
    columnName: 'key',
    columnType: 'uuid',
    nullable: false,
    primaryKey: true,
    hasDefault: true,
    defaultExpression: true,
    defaultValue: 'gen_random_uuid()',
  });
  assert.equal(key.databaseDefault, true);
  assert.equal(key.require, false);
  assert.equal(parseHistoryForm({ fields: [key] }).fields[0].databaseDefault, true);
});
