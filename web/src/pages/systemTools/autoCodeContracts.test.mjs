import assert from 'node:assert/strict';
import test from 'node:test';
import { autoCodeApi } from '../../api/endpoints.ts';

globalThis.sessionStorage = { getItem: () => null };
let responses = {};
let requests = [];
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url, 'http://test.local').pathname;
  requests.push({ path, options });
  const value = responses[path];
  return value instanceof Response
    ? value
    : new Response(JSON.stringify({ code: 0, data: value }), {
        headers: { 'content-type': 'application/json' },
      });
};

test('generator metadata unwraps real Echo responses and legacy arrays', async () => {
  responses = {
    '/api/autoCode/getDB': { dbs: [{ database: 'admin' }] },
    '/api/autoCode/getTables': { tables: [{ tableName: 'customers' }] },
    '/api/autoCode/getColumn': {
      columns: [{ columnName: 'age', dataType: 'int', columnComment: 'message' }],
    },
    '/api/autoCode/getPackage': { pkgs: [{ id: 3, packageName: 'business', desc: 'message' }] },
  };
  assert.deepEqual(await autoCodeApi.getDB(), ['admin']);
  assert.deepEqual(await autoCodeApi.getTables({ dbName: 'admin' }), ['customers']);
  assert.equal(
    (await autoCodeApi.getColumn({ dbName: 'admin', tableName: 'customers' }))[0].columnType,
    'int',
  );
  const [pkg] = await autoCodeApi.getPackage();
  assert.equal(pkg.ID, 3);
  assert.equal(pkg.packageDesc, 'message');
  responses['/api/autoCode/getDB'] = ['legacy'];
  responses['/api/autoCode/getTables'] = ['legacy_table'];
  assert.deepEqual(await autoCodeApi.getDB(), ['legacy']);
  assert.deepEqual(await autoCodeApi.getTables({ dbName: 'legacy' }), ['legacy_table']);
});

test('preview preserves code text and sends generation, sorting and Excel switches', async () => {
  requests = [];
  responses['/api/autoCode/preview'] = { autoCode: { 'model/customer.go': 'package business\n' } };
  const data = {
    structName: 'Customer',
    hasExcel: true,
    fields: [{ fieldName: 'Name', digitSort: true }],
  };
  assert.deepEqual(await autoCodeApi.preview(data), { 'model/customer.go': 'package business\n' });
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.generateWeb, true);
  assert.equal(body.generateServer, true);
  assert.equal(body.fields[0].sort, true);
  assert.equal(body.fields[0].excel, true);
  assert.equal(data.fields[0].sort, undefined, 'caller state must stay unchanged');
  responses['/api/autoCode/preview'] = { map: { 'web/customer.tsx': 'export default 1;' } };
  assert.deepEqual(await autoCodeApi.preview(data), { 'web/customer.tsx': 'export default 1;' });
});

test('package descriptions use the server desc field', async () => {
  requests = [];
  await autoCodeApi.createPackage({ packageName: 'business', packageDesc: 'message' });
  assert.equal(JSON.parse(requests[0].options.body).desc, 'message');
});

test('basic template generation downloads the returned ZIP', async () => {
  let clicked = 0;
  const link = {
    click: () => {
      clicked += 1;
    },
    href: '',
    download: '',
  };
  globalThis.window = { URL };
  globalThis.document = { createElement: () => link, body: { appendChild() {}, removeChild() {} } };
  responses['/api/autoCode/createTemp'] = new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
    headers: { 'content-type': 'application/zip' },
  });
  await autoCodeApi.createTemp({ structName: 'Customer', onlyTemplate: true, fields: [] });
  assert.equal(clicked, 1);
  assert.equal(link.download, 'Customer.zip');
});
