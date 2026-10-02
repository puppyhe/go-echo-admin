import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseCents, availablePurchaseWorkflows } from '../src/pages/business/purchase/model.ts';
import { purchaseApi } from '../src/pages/business/purchase/api.ts';

test('purchase amount entry uses yuan and converts exactly to bounded integer cents', () => {
  assert.equal(purchaseCents(0.29), 29);
  assert.equal(purchaseCents(120.56), 12056);
  assert.equal(purchaseCents(10000000000), 1000000000000);
  for (const value of [0, -1, 1.001, NaN, Infinity, '12', 10000000000.01])
    assert.throws(() => purchaseCents(value));
});
test('purchase workflow choices exclude forms, unpublished and disabled workflows', () => {
  const rows = [
    { id: 1, businessType: 'purchase_order', status: 'published', enabled: true },
    { id: 2, businessType: 'purchase_order', status: 'draft', enabled: true },
    { id: 3, businessType: 'purchase_order', status: 'published', enabled: false },
    { id: 4, businessType: '', status: 'published', enabled: true },
  ];
  assert.deepEqual(
    availablePurchaseWorkflows(rows).map((row) => row.id),
    [1],
  );
  assert.equal(rows.length, 4);
});
test('purchase mutations preserve revision and prior request identity without accepting client workflow data', async (t) => {
  const old = { fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage };
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  globalThis.sessionStorage = { getItem: () => null };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ code: 0, data: { id: 99 } }));
  };
  const row = { id: 17, version: 4, approvalRequestId: 31, title: 'client-only', amountCents: 777 };
  await purchaseApi.submit(row, 9);
  await purchaseApi.delete(row);
  assert.deepEqual(calls[0], {
    url: '/api/business/purchases/17/submit',
    method: 'POST',
    body: { version: 4, workflowId: 9, previousRequestId: 31 },
  });
  assert.deepEqual(calls[1].body, { version: 4 });
});
