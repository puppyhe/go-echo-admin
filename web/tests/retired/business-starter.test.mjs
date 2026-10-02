import test from 'node:test';
import assert from 'node:assert/strict';
import { productForm, priceInCents, toProductInput } from '../src/pages/business/product/model.ts';
import { productApi } from '../src/pages/business/product/api.ts';
import { customerApi } from '../src/pages/example/customer/api.ts';
import { request, ApiError } from '../src/api/request.ts';
import { bindMessageApi } from '../src/api/feedback.ts';
import { componentKey, registeredComponentPaths, resolvePage } from '../src/routes/pageRegistry.ts';
import { pageRegistrationHint } from '../src/routes/pageKeys.ts';

const envelope = (data) => new Response(JSON.stringify({ code: 0, data }));

test('product form converts yuan to integer cents without submitting row ownership or search fields', () => {
  assert.equal(priceInCents(0), 0);
  assert.equal(priceInCents(0.29), 29);
  assert.equal(priceInCents(123.45), 12345);
  assert.equal(priceInCents(10_000_000_000), 1_000_000_000_000);
  for (const value of [-1, 1.001, NaN, Infinity, '12', null, 1e20, 10_000_000_000.01])
    assert.throws(() => priceInCents(value));
  const row = { id: 42, name: 'message', code: 'SKU-1', priceCents: 29, status: 'enabled', note: '' };
  assert.equal(productForm(row).priceYuan, 0.29);
  assert.deepEqual(
    toProductInput({ ...productForm(row), name: ' message ', keyword: 'ignored', ownerId: 999 }),
    {
      name: 'message',
      code: 'SKU-1',
      priceCents: 29,
      status: 'enabled',
      note: '',
    },
  );
});

test('product API follows the documented paths and passes only supported query parameters', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined });
    return envelope({ id: 42 });
  };
  const input = { name: 'message', code: 'SKU-1', priceCents: 29, status: 'enabled', note: '' };
  await productApi.list({ page: 2, pageSize: 10, keyword: 'x', status: 'enabled', ownerId: 99 });
  await productApi.get(42);
  await productApi.create(input);
  await productApi.update(42, input);
  await productApi.remove({ id: 42 });
  assert.deepEqual(
    calls.map(({ url, method }) => [method, url]),
    [
      ['GET', '/api/products?page=2&pageSize=10&keyword=x&status=enabled'],
      ['GET', '/api/products/42'],
      ['POST', '/api/products'],
      ['PUT', '/api/products/42'],
      ['DELETE', '/api/products/42'],
    ],
  );
  assert.deepEqual(calls[3].body, input);
  assert.equal(calls[4].body, undefined);
});

test('legacy customer adapters normalize lowercase response IDs and preserve update payloads', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : undefined });
    if (url.includes('customerList'))
      return envelope({ list: [{ id: 7, customerName: 'customer' }], total: 1, page: 1, pageSize: 10 });
    return envelope({ customer: { id: 7, customerName: 'customer', customerPhoneData: '0123' } });
  };
  assert.equal((await customerApi.list({ page: 1, pageSize: 10 })).list[0].ID, 7);
  assert.equal((await customerApi.get(7)).ID, 7);
  await customerApi.update(7, {
    customerName: ' customer ',
    customerPhoneData: ' 0123 ',
    keyword: 'ignored',
  });
  assert.deepEqual(calls[2].body, { ID: 7, customerName: 'customer', customerPhoneData: '0123' });
});

test('new page keys and legacy Vue aliases resolve to the same registered React page', () => {
  assert.ok(registeredComponentPaths.includes('business/product'));
  assert.ok(
    registeredComponentPaths.every((key) => !key.endsWith('.vue') && !key.startsWith('view/')),
  );
  assert.equal(componentKey(' view/business/product/index.vue '), 'business/product');
  assert.equal(
    resolvePage('business/product').Page,
    resolvePage('view/business/product/index.vue').Page,
  );
  assert.equal(resolvePage('business/missing').registered, false);
  assert.match(pageRegistrationHint('business/missing'), /src\/routes\/pageRegistry\.ts/);
});

test('request errors expose structured fields and correlation IDs in the shared notification', async (t) => {
  const originalFetch = globalThis.fetch;
  const messages = [];
  bindMessageApi({ error: (msg) => messages.push(msg) });
  t.after(() => {
    globalThis.fetch = originalFetch;
    bindMessageApi(null);
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 1,
        msg: 'messageencodingmessage',
        errorCode: 'CONFLICT',
        field: 'code',
        requestId: 'body-id',
      }),
      { headers: { 'X-Request-ID': 'header-id' } },
    );
  await assert.rejects(request('/products'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 1);
    assert.equal(error.errorCode, 'CONFLICT');
    assert.equal(error.field, 'code');
    assert.equal(error.requestId, 'header-id');
    assert.match(error.message, /labelencodinglabel.*label：header-id/);
    return true;
  });
  assert.equal(messages.length, 1);
  await assert.rejects(request('/products', { skipError: true }), /header-id/);
  assert.equal(messages.length, 1);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 1, msg: 'parametererror', requestId: 'body-id' }));
  await assert.rejects(
    request('/products', { skipError: true }),
    (error) => error.requestId === 'body-id',
  );
  globalThis.fetch = async () =>
    new Response('gateway failure', { status: 502, headers: { 'X-Request-ID': 'gateway-id' } });
  await assert.rejects(
    request('/products', { skipError: true }),
    (error) => error.code === 502 && error.requestId === 'gateway-id',
  );
});
