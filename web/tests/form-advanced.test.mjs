import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Form } from 'antd';
import { FormFields, FormValueView } from '../src/pages/systemTools/formRuntime.tsx';
import {
  conditionFields,
  generateReactForm,
  initialValues,
  parseDesign,
  validateDesign,
  valueError,
  patchFieldTree,
  moveFieldTree,
  removeFieldTree,
} from '../src/pages/systemTools/formDesign.ts';
import { serializeSubmission } from '../src/pages/enterprise/collab/model.ts';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const field = (name, type, extra = {}) => ({
  id: name,
  name,
  type,
  label: name,
  placeholder: '',
  required: false,
  disabled: false,
  options: [],
  ...extra,
});
function schema() {
  return {
    version: 1,
    title: 'nested',
    layout: 'vertical',
    fields: [
      field('summary', 'group', {
        children: [
          field('amount', 'number', { defaultValue: 0, required: true, min: 0, span: 12 }),
          field('enabled', 'switch', { defaultValue: false, required: true }),
          field('empty', 'input', { defaultValue: '' }),
          field('nullable', 'input', { defaultValue: null }),
          field('locked', 'input', { disabled: true, defaultValue: 'not-submitted' }),
        ],
      }),
      field('items', 'subform', {
        initialRows: 2,
        minRows: 1,
        maxRows: 4,
        children: [
          field('name', 'input', { defaultValue: 'item', required: true }),
          field('grid', 'grid', {
            children: [
              field('parts', 'subform', {
                initialRows: 1,
                maxRows: 2,
                children: [
                  field('cost', 'number', { defaultValue: 0, required: true }),
                  field('accepted', 'switch', { defaultValue: false }),
                ],
              }),
            ],
          }),
        ],
      }),
      field('bounds', 'numberRange', { defaultValue: [0, 10], min: 0, max: 100 }),
      field('period', 'dateRange', { defaultValue: ['2026-09-13', '2026-09-14'] }),
      field('color', 'color', { defaultValue: '#000000' }),
      field('help', 'text', { content: '<img src=x onerror=alert(1)>' }),
    ],
  };
}
test('deep defaults preserve zero false null empty and isolate each repeated row', () => {
  const design = schema();
  assert.equal(validateDesign(design), null);
  const initial = initialValues(design);
  assert.equal(initial.amount, 0);
  assert.equal(initial.enabled, false);
  assert.equal(initial.empty, '');
  assert.equal(initial.nullable, null);
  assert.equal(initial.items.length, 2);
  assert.deepEqual(initial.items[0].parts, [{ cost: 0, accepted: false }]);
  initial.items[0].parts[0].cost = 20;
  assert.equal(initial.items[1].parts[0].cost, 0);
  const data = serializeSubmission(design, initial);
  assert.equal(data.items[0].parts[0].cost, 20);
  assert.equal(data.items[1].parts[0].accepted, false);
  assert.equal(data.summary, undefined);
  assert.equal(data.locked, undefined);
  assert.equal(data.help, undefined);
  assert.deepEqual(data.bounds, [0, 10]);
  assert.deepEqual(data.period, ['2026-09-13', '2026-09-14']);
});
test('new schema roundtrip keeps nested typed configuration and strips executable hooks', () => {
  const design = schema();
  design.fields[1].children[0].onChange = 'execute()';
  const parsed = parseDesign(JSON.stringify(design));
  assert.equal(validateDesign(parsed), null);
  assert.deepEqual(initialValues(parsed), initialValues(design));
  assert.equal(parsed.fields[1].children[0].onChange, undefined);
  const candidates = conditionFields(parsed.fields);
  assert.ok(candidates.some((field) => field.name === 'amount'));
  assert.ok(
    !candidates.some(
      (field) => field.name === 'cost' || field.name === 'items' || field.name === 'help',
    ),
  );
  const duplicate = schema();
  duplicate.fields.push(field('amount', 'input'));
  assert.match(validateDesign(duplicate), /字段ID必须唯一/);
  const unsafe = schema();
  unsafe.fields[1].children[0].name = '__proto__';
  assert.throws(() => parseDesign(JSON.stringify(unsafe)), /字段名必须以字母开头/);
});
test('ranges lengths rows and explosive defaults reject malformed definitions or data', () => {
  assert.ok(valueError(field('range', 'numberRange'), [1, null]));
  assert.ok(valueError(field('range', 'numberRange'), [2, 1]));
  assert.ok(valueError(field('range', 'dateRange'), ['2026-02-30', '2026-03-01']));
  assert.ok(valueError(field('color', 'color'), 'url(javascript:x)'));
  assert.equal(valueError(field('zero', 'number', { required: true }), 0), null);
  assert.equal(valueError(field('off', 'switch', { required: true }), false), null);
  assert.ok(valueError(field('empty', 'number'), ''));
  assert.equal(valueError(field('empty', 'input'), ''), null);
  assert.ok(valueError(field('name', 'input', { minLength: 2, maxLength: 4 }), 'x'));
  assert.ok(valueError(field('name', 'input', { maxLength: 4 }), '12345'));
  const initial = initialValues(schema());
  initial.items[0].parts = [null];
  assert.throws(() => serializeSubmission(schema(), initial), /parts.*data is invalid/);
  const huge = {
    version: 1,
    title: 'huge',
    layout: 'vertical',
    fields: [
      field('outer', 'subform', {
        initialRows: 100,
        maxRows: 100,
        children: [
          field('inner', 'subform', {
            initialRows: 100,
            maxRows: 100,
            children: [field('text', 'input')],
          }),
        ],
      }),
    ],
  };
  assert.match(validateDesign(huge), /初始值超出安全限制/);
  assert.throws(() => initialValues(huge), /初始数据超过200个|初始数据超过5000/);
});
test('nested designer operations preserve siblings and do not mutate original schema', () => {
  const original = schema();
  const patched = patchFieldTree(original.fields, 'cost', { label: 'message', defaultValue: 5 });
  assert.equal(initialValues({ ...original, fields: patched }).items[0].parts[0].cost, 5);
  assert.equal(initialValues(original).items[0].parts[0].cost, 0);
  const moved = moveFieldTree(original.fields, 'enabled', -1);
  assert.equal(moved[0].children[0].name, 'enabled');
  assert.equal(original.fields[0].children[0].name, 'amount');
  const removed = removeFieldTree(original.fields, 'parts');
  assert.equal(removed[1].children[1].children.length, 0);
  assert.equal(original.fields[1].children[1].children.length, 1);
});
test('shared renderer renders real nested initial rows; historical content uses snapshot data and escapes markup', () => {
  const design = schema();
  const initial = initialValues(design);
  const form = renderToStaticMarkup(
    React.createElement(
      Form,
      { initialValues: initial },
      React.createElement(FormFields, { fields: design.fields }),
    ),
  );
  assert.match(form, /title="amount"/);
  assert.match(form, /title="cost"/);
  assert.match(form, /value="item"/);
  assert.match(form, /value="0"/);
  assert.match(form, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!form.includes('<img src="x"'));
  initial.items[0].name = '<script>secret</script>';
  initial.amount = 0;
  const history = renderToStaticMarkup(
    React.createElement(FormValueView, { fields: design.fields, data: initial }),
  );
  assert.match(history, /&lt;script&gt;secret&lt;\/script&gt;/);
  assert.ok(!history.includes('<script>secret'));
  const missing = renderToStaticMarkup(
    React.createElement(FormValueView, {
      fields: [field('amount', 'number', { defaultValue: 999 })],
      data: {},
    }),
  );
  assert.ok(missing.includes('—'));
  assert.ok(!missing.includes('999'));
});
test('server snapshots with null or missing options render submitted values without crashing', () => {
  const history = renderToStaticMarkup(
    React.createElement(FormValueView, {
      fields: [
        field('note', 'input', { options: null }),
        field('count', 'number', { options: undefined }),
        field('choice', 'select', { options: null }),
      ],
      data: { note: '审批备注：按原金额报销', count: 0, choice: 'historical-value' },
    }),
  );
  assert.ok(history.includes('审批备注：按原金额报销'));
  assert.match(history, />0</);
  assert.match(history, /historical-value/);
});
test('advanced exported React component typechecks using the same runtime and safely embeds configuration', () => {
  const design = schema();
  design.fields[0].label = '</Form><script>text</script>';
  const generated = generateReactForm(design);
  const fileName = fileURLToPath(new URL('../__generated-advanced-form-test.tsx', import.meta.url));
  const options = {
    strict: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options),
    read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === fileName
      ? ts.createSourceFile(name, generated, languageVersion, true, ts.ScriptKind.TSX)
      : read(name, languageVersion, ...rest);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([fileName], options, host));
  assert.deepEqual(
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
    [],
  );
});
