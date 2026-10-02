import test from 'node:test';
import assert from 'node:assert/strict';
import { parameterValues } from '../src/pages/enterprise/reports/api.ts';
import { downloadRequest } from '../src/api/download.ts';

test('messageparametermessagefieldmessageretainmessage0，messagedefault value', () => {
  const fields = [
    { key: 'status', label: 'status', type: 'string', required: false, defaultValue: 'approved' },
    { key: 'amount', label: 'message', type: 'number', required: true },
    { key: 'day', label: 'message', type: 'date', required: true },
  ];
  assert.deepEqual(parameterValues(fields, { amount: 0, day: '2024-02-29', admin: true }), {
    status: 'approved',
    amount: 0,
    day: '2024-02-29',
  });
  assert.deepEqual(parameterValues(fields, { status: '', amount: '12.5', day: '2024-02-29' }), {
    status: null,
    amount: 12.5,
    day: '2024-02-29',
  });
});
test('messageparametermessage、messageobjectmessage', () => {
  const field = { key: 'n', label: 'message', type: 'number', required: true };
  for (const value of ['', null, undefined, false, [], {}, ' ', Infinity])
    assert.throws(() => parameterValues([field], { n: value }));
  for (const value of ['2025-02-29', '2026-13-01', '2026-01-40', 'bad'])
    assert.throws(() => parameterValues([{ ...field, type: 'date' }], { n: value }), /message/);
});
test('downloadretainmessagequeryparametermessageduplicateaddmessage', () => {
  const result = downloadRequest(
    '/api/enterprise/report?format=xlsx',
    'https://admin.example',
    'secret',
    { id: 4 },
  );
  assert.equal(result.url, 'https://admin.example/api/enterprise/report?format=xlsx&id=4');
  assert.equal(result.headers['x-token'], 'secret');
  assert.equal(result.redirect, 'error');
});
test('messagedownloadaddressmessagetoken', () => {
  const result = downloadRequest(
    'https://files.example/report.xlsx',
    'https://admin.example',
    'secret',
  );
  assert.deepEqual(result.headers, {});
  assert.equal(result.redirect, 'follow');
});

test('messagedefault valuemessagenull，RFC3339messagebackendmessageparametercompatibility', () => {
  const optional = {
    key: 'status',
    label: 'status',
    type: 'string',
    required: false,
    defaultValue: 'approved',
  };
  assert.deepEqual(parameterValues([optional], {}), { status: 'approved' });
  for (const value of ['', null, undefined])
    assert.deepEqual(parameterValues([optional], { status: value }), { status: null });
  const date = { key: 'createdAt', label: 'createmessage', type: 'date', required: true };
  assert.deepEqual(parameterValues([date], { createdAt: '2026-09-13T12:30:00+08:00' }), {
    createdAt: '2026-09-13T12:30:00+08:00',
  });
  assert.throws(
    () => parameterValues([date], { createdAt: '2026-02-30T12:30:00+08:00' }),
    /label/,
  );
});
