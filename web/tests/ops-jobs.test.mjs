import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultDefinition,
  editorValues,
  jsonObject,
  taskDefinition,
} from '../src/pages/enterprise/ops/model.ts';

test('job parameters retain false/zero/nested values and reject non-object or oversized JSON', () => {
  const value = jsonObject('{"enabled":false,"count":0,"nested":{"ids":[1,2]}}', 'parameter');
  assert.deepEqual(value, { enabled: false, count: 0, nested: { ids: [1, 2] } });
  for (const raw of [
    'null',
    '[]',
    'false',
    '1',
    '{bad',
    JSON.stringify({ data: 'message'.repeat(20000) }),
  ])
    assert.throws(() => jsonObject(raw, 'parameter'));
});
test('switching executor discards hidden HTTP fields and preserves five/six segment cron', () => {
  const values = {
    ...editorValues(defaultDefinition),
    name: 'Check',
    url: 'https://old.example.com',
    headersJSON: '{"X-Old":"value"}',
  };
  const method = taskDefinition(values);
  assert.deepEqual(method.http, { url: '', method: '', headers: {} });
  assert.equal(method.methodKey, 'system.heartbeat');
  assert.equal(taskDefinition({ ...values, cron: '*/5 * * * * *' }).cron, '*/5 * * * * *');
  assert.throws(() => taskDefinition({ ...values, cron: '@every 1s' }));
  assert.equal(Object.hasOwn(method, 'enabled'), false);
});
test('HTTP task payload requires string headers and body-compatible methods', () => {
  const values = {
    ...editorValues(defaultDefinition),
    executor: 'http',
    name: 'HTTP',
    url: 'https://api.example.com',
    httpMethod: 'POST',
    headersJSON: '{"X-Request":"test"}',
    parametersJSON: '{"count":0}',
  };
  const def = taskDefinition(values);
  assert.equal(def.methodKey, '');
  assert.deepEqual(def.parameters, { count: 0 });
  assert.throws(() => taskDefinition({ ...values, httpMethod: 'GET' }));
  assert.throws(() => taskDefinition({ ...values, headersJSON: '{"X-Count":1}' }));
});
