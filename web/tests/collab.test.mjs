import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedOperators,
  conditionValue,
  displayValue,
  prepareSteps,
  serializeSubmission,
} from '../src/pages/enterprise/collab/model.ts';

const field = (name, type, extra = {}) => ({
  id: name,
  name,
  label: name,
  type,
  placeholder: '',
  required: false,
  disabled: false,
  options: [],
  ...extra,
});
const schema = {
  version: 1,
  title: 'message',
  layout: 'vertical',
  fields: [
    field('amount', 'number'),
    field('urgent', 'switch'),
    field('date', 'date'),
    field('time', 'time'),
    field('locked', 'input', { disabled: true }),
    field('tags', 'checkbox', { options: [{ label: 'message', value: 'travel' }] }),
  ],
};
const step = () => ({
  id: 'manager',
  name: 'messageapproval',
  approverIds: [1, 2, 1],
  mode: 'all',
  condition: { field: 'amount', operator: 'gte', value: '100' },
});

test('approval conditions preserve numeric/boolean/array semantics and unique approvers', () => {
  const [result] = prepareSteps([step()], schema);
  assert.equal(result.condition.value, 100);
  assert.deepEqual(result.approverIds, [1, 2]);
  assert.equal(conditionValue(schema.fields[1], 'false'), false);
  assert.deepEqual(conditionValue(schema.fields[5], ['travel']), ['travel']);
  assert.equal(conditionValue(schema.fields[5], 'travel', 'contains'), 'travel');
  assert.deepEqual(allowedOperators(schema.fields[1]), ['eq', 'ne']);
});

test('publishing refuses stale/disabled conditions, invalid approvers and duplicate nodes', () => {
  assert.throws(
    () =>
      prepareSteps(
        [{ ...step(), condition: { field: 'deleted', operator: 'eq', value: '' } }],
        schema,
      ),
    /condition field is unavailable/,
  );
  assert.throws(
    () =>
      prepareSteps(
        [{ ...step(), condition: { field: 'locked', operator: 'eq', value: '' } }],
        schema,
      ),
    /condition field is unavailable/,
  );
  assert.throws(() => prepareSteps([{ ...step(), approverIds: [] }], schema), /at least one approver/);
  assert.throws(() => prepareSteps([step(), step()], schema), /IDs must be present and unique/);
  assert.throws(
    () =>
      prepareSteps(
        [{ ...step(), condition: { field: 'urgent', operator: 'gt', value: 1 } }],
        schema,
      ),
    /unsupported operator/,
  );
  assert.throws(() => conditionValue(schema.fields[0], 'not-number'), /number/);
});

test('submission uses local calendar values, strips unknown/disabled fields and preserves false', () => {
  const formats = [];
  const values = {
    amount: 0,
    urgent: false,
    date: {
      format: (pattern) => {
        formats.push(pattern);
        return '2026-09-13';
      },
    },
    time: {
      format: (pattern) => {
        formats.push(pattern);
        return '09:15:00';
      },
    },
    locked: 'tampered',
    injected: 'hidden',
    tags: ['travel'],
  };
  assert.deepEqual(serializeSubmission(schema, values), {
    amount: 0,
    urgent: false,
    date: '2026-09-13',
    time: '09:15:00',
    tags: ['travel'],
  });
  assert.deepEqual(formats, ['YYYY-MM-DD', 'HH:mm:ss']);
  assert.throws(() => serializeSubmission(schema, { amount: Infinity }), /must contain finite numbers/);
  assert.throws(() => serializeSubmission(schema, { tags: [{}] }), /data is invalid/);
});

test('historic values show labels and conceal password control values', () => {
  assert.equal(displayValue(schema.fields[5], ['travel']), 'message');
  assert.equal(displayValue(schema.fields[1], false), 'Off');
  assert.equal(displayValue(field('secret', 'password'), 'private'), '••••••••');
  assert.equal(
    displayValue(field('body', 'textarea'), '<script>alert(1)</script>'),
    '<script>alert(1)</script>',
  );
});
