import assert from 'node:assert/strict';
import test from 'node:test';
import {
  templateValues,
  validateTemplateVariables,
  validClockTime,
  validTimezone,
} from '../src/pages/enterprise/notifications/managementModel.ts';

test('template validation accepts declared dot variables and rejects undeclared or executable expressions', () => {
  const variables = [{ name: 'name', type: 'string', required: true }];
  assert.doesNotThrow(() => validateTemplateVariables(variables, 'message {{.name}}，{{ .name }}'));
  for (const content of [
    '{{name}}',
    '{{.missing}}',
    '{{if .name}}',
    '{{.user.name}}',
    '{{printf "%s" .name}}',
    '{{.name}',
    '{{.name}}}}',
  ])
    assert.throws(() => validateTemplateVariables(variables, content));
  assert.throws(() => validateTemplateVariables([...variables, ...variables], ''));
  assert.throws(() => validateTemplateVariables([{ name: '__proto__' }], ''));
});
test('template samples preserve false and zero, omit absent optional variables, and enforce declared types', () => {
  const variables = [
    { name: 'count', type: 'number', required: true },
    { name: 'ok', type: 'boolean', required: true },
    { name: 'note', type: 'string', required: false },
  ];
  assert.deepEqual(
    templateValues(variables, { count: 0, ok: false, note: '', ignored: 'never submitted' }),
    { count: 0, ok: false },
  );
  assert.deepEqual(templateValues(variables, { count: '12', ok: true }), { count: 12, ok: true });
  for (const count of ['', null, [], {}, true, Infinity, ' '])
    assert.throws(() => templateValues(variables, { count, ok: true }));
  assert.throws(() => templateValues(variables, { count: 1, ok: 'false' }));
  assert.throws(() => templateValues(variables, { count: 1, ok: true, note: 123 }));
});
test('quiet hour controls use valid local times and IANA timezone identifiers', () => {
  assert.ok(validClockTime('22:00'));
  assert.ok(validClockTime('00:00'));
  assert.ok(validClockTime('23:59'));
  for (const value of ['24:00', '22:60', '8:00', '', '22:00:00']) assert.ok(!validClockTime(value));
  assert.ok(validTimezone('Asia/Shanghai'));
  assert.ok(validTimezone('UTC'));
  assert.ok(!validTimezone('Mars/Olympus'));
  assert.ok(!validTimezone(''));
});

test('quiet hours distinguish disabled defaults from incomplete or zero-length intervals', async () => {
  const { quietRangeError, utf8Length, webhookHostsError } = await import(
    '../src/pages/enterprise/notifications/managementModel.ts'
  );
  assert.equal(quietRangeError('', ''), null);
  assert.notEqual(quietRangeError('', '', true), null);
  assert.equal(quietRangeError('22:00', '08:00', true), null);
  assert.notEqual(quietRangeError('22:00', '22:00'), null);
  assert.notEqual(quietRangeError('22:00', ''), null);
  assert.equal(utf8Length('通知'), 6);
  assert.equal(utf8Length('message'), 7);
  assert.equal(utf8Length('🔔'), 4);
  assert.equal(webhookHostsError(['hooks.example.com', '*.example.com']), null);
  assert.notEqual(webhookHostsError(['https://example.com/path']), null);
  assert.notEqual(webhookHostsError(['example.com:443']), null);
});
