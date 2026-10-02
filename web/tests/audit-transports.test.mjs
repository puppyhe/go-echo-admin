import test from 'node:test';
import assert from 'node:assert/strict';
import { request, session } from '../src/api/request.ts';
import { downloadByUrl } from '../src/api/download.ts';
import { autoCodeApi } from '../src/api/endpoints.ts';
import { pluginConfigApi } from '../src/pages/systemTools/pluginConfig/api.ts';
import { pageBuilderApi } from '../src/pages/systemTools/pageBuilder/api.ts';
import { normalizeServerInfo } from '../src/api/normalize.ts';

function environment(t) {
  const old = Object.fromEntries(
    ['fetch', 'window', 'document', 'sessionStorage'].map((key) => [key, globalThis[key]]),
  );
  const memory = new Map([['token', 'session-token']]);
  const redirects = [],
    downloads = [],
    blobs = [];
  globalThis.sessionStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  // Tokens are memory-only; seed the active page session explicitly.
  session.setToken('session-token');
  globalThis.window = {
    location: {
      origin: 'https://app.example',
      pathname: '/workspace',
      assign: (value) => redirects.push(value),
    },
    URL: {
      createObjectURL: (blob) => {
        blobs.push(blob);
        return 'blob:download';
      },
      revokeObjectURL: () => {},
    },
  };
  globalThis.document = {
    body: { appendChild: () => {}, removeChild: () => {} },
    createElement: () => ({
      click() {
        downloads.push(this.download);
      },
    }),
  };
  t.after(() => {
    for (const [key, value] of Object.entries(old))
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
  });
  return { memory, redirects, downloads, blobs };
}
const response = (body, headers = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
  });

test('plugin analysis sends actual ZIP bytes in an authenticated multipart body', async (t) => {
  environment(t);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/autoCode/analyzePlugin');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.headers['x-token'], 'session-token');
    assert.ok(options.body instanceof FormData);
    assert.equal(options.body.get('plug').name, 'local.zip');
    assert.equal(await options.body.get('plug').text(), 'ZIP fixture');
    return response({ code: 0, data: { pluginName: 'local' } });
  };
  assert.equal(
    (await pluginConfigApi.analyze(new File(['ZIP fixture'], 'local.zip'))).pluginName,
    'local',
  );
});

test('version JSON attachments download exact bytes while JSON errors never become files', async (t) => {
  const state = environment(t);
  const version = { version: { code: 'v1' }, menus: [], apis: [], dictionaries: [] };
  globalThis.fetch = async () =>
    response(version, {
      'content-disposition': "attachment; filename*=UTF-8''version.json",
      'new-token': 'renewed',
    });
  await downloadByUrl('/sysVersion/downloadVersionJson');
  assert.deepEqual(state.downloads, ['version.json']);
  assert.deepEqual(JSON.parse(await state.blobs[0].text()), version);
  assert.equal(session.getToken(), 'renewed');
  await downloadByUrl('/sysVersion/downloadVersionJson', { filename: 'custom.json' });
  assert.equal(state.downloads[1], 'custom.json');
  globalThis.fetch = async () => response({ code: 1, msg: 'messageexportpermission' });
  await assert.rejects(downloadByUrl('/sysVersion/downloadVersionJson'), /messageexportpermission/);
  assert.equal(state.downloads.length, 2);
});

test('JSON, AI streaming, page generation and GET/POST downloads all route restricted sessions to password recovery', async (t) => {
  const state = environment(t);
  globalThis.fetch = async () => response({ code: 428, msg: 'message' });
  const operations = [
    () => request('/protected', { skipError: true }),
    () => autoCodeApi.llmAutoSSE({}, () => assert.fail('must not receive model output')),
    () =>
      pageBuilderApi.generate(1, 1, '', new AbortController().signal, () =>
        assert.fail('must not receive model output'),
      ),
    () => downloadByUrl('/private/export'),
    () => autoCodeApi.pubPlug({ pluginName: 'local' }),
  ];
  for (const operation of operations) {
    await assert.rejects(operation(), (error) => error.code === 428);
    assert.equal(session.getToken(), 'session-token');
  }
  assert.deepEqual(
    state.redirects,
    operations.map(() => '/login?passwordChange=1'),
  );
  assert.equal(state.downloads.length, 0);
});

test('streaming unauthorized response clears the session and navigates to login', async (t) => {
  const state = environment(t);
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(
    autoCodeApi.llmAutoSSE({}, () => {}),
    (error) => error.code === 401,
  );
  assert.equal(session.getToken(), '');
  assert.deepEqual(state.redirects, ['/login']);
});

test('third-party download errors and renewal headers cannot clear or replace the app session', async (t) => {
  const state = environment(t);
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers['x-token'], undefined);
    return new Response('denied', { status: 401, headers: { 'new-token': 'untrusted' } });
  };
  await assert.rejects(downloadByUrl('https://files.example/asset.zip'), /401/);
  assert.equal(session.getToken(), 'session-token');
  assert.deepEqual(state.redirects, []);
});

test('dictionary parent and path adapters carry dictionary identity and unwrap actual response envelopes', async (t) => {
  environment(t);
  const { sysDictionaryDetailApi } = await import('../src/api/endpoints.ts');
  globalThis.fetch = async (url) => {
    const parsed = new URL(url, 'https://app.example');
    if (parsed.pathname.endsWith('getDictionaryPath')) {
      assert.equal(parsed.searchParams.get('id'), '4');
      return response({
        code: 0,
        data: {
          path: [
            { id: 1, value: '001' },
            { id: 4, value: '004' },
          ],
        },
      });
    }
    assert.equal(parsed.searchParams.get('sysDictionaryID'), '9');
    assert.equal(parsed.searchParams.get('parentID'), '0');
    assert.equal(parsed.searchParams.get('includeChildren'), 'true');
    return response({ code: 0, data: { list: [{ id: 4, value: '004' }] } });
  };
  const children = await sysDictionaryDetailApi.getDictionaryDetailsByParent({
    sysDictionaryID: 9,
    parentID: 0,
    includeChildren: true,
  });
  assert.deepEqual(
    children.map((row) => [row.ID, row.value]),
    [[4, '004']],
  );
  assert.deepEqual(
    (await sysDictionaryDetailApi.getDictionaryPath({ ID: 4 })).map((row) => row.ID),
    [1, 4],
  );
});

test('login log detail uses lowercase id and normalizes the bare backend record', async (t) => {
  environment(t);
  const { sysLoginLogApi } = await import('../src/api/endpoints.ts');
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url, 'https://app.example');
    assert.equal(parsed.pathname, '/api/sysLoginLog/findLoginLog');
    assert.equal(parsed.searchParams.get('id'), '7');
    assert.equal(parsed.searchParams.has('ID'), false);
    assert.equal(options.method, 'GET');
    return response({
      code: 0,
      data: { id: 7, createdAt: '2026-09-13T01:00:00Z', username: 'fixture' },
    });
  };
  const row = await sysLoginLogApi.findLoginLog({ ID: 7 });
  assert.equal(row.ID, 7);
  assert.equal(row.CreatedAt, '2026-09-13T01:00:00Z');
  assert.equal(row.username, 'fixture');
});

test('parameter list and detail preserve editable IDs and timestamp aliases', async (t) => {
  environment(t);
  const { sysParamsApi } = await import('../src/api/endpoints.ts');
  const raw = {
    id: 9,
    createdAt: '2026-09-13T02:00:00Z',
    updatedAt: '2026-09-13T03:00:00Z',
    name: 'fixture',
    key: 'fixtureKey',
    value: '0',
    desc: '',
  };
  globalThis.fetch = async (url) => {
    const parsed = new URL(url, 'https://app.example');
    if (parsed.pathname.endsWith('getSysParamsList'))
      return response({ code: 0, data: { list: [raw], total: 1, page: 1, pageSize: 20 } });
    assert.equal(parsed.pathname, '/api/sysParams/findSysParams');
    assert.equal(parsed.searchParams.get('ID'), '9');
    return response({ code: 0, data: { resysParams: raw } });
  };
  const page = await sysParamsApi.getSysParamsList({ page: 1, pageSize: 20 });
  const row = page.list[0];
  assert.equal(page.total, 1);
  assert.equal(row.ID, 9);
  assert.equal(row.CreatedAt, raw.createdAt);
  const detail = (await sysParamsApi.findSysParams({ ID: row.ID })).resysParams;
  assert.equal(detail.ID, row.ID);
  assert.equal(detail.UpdatedAt, raw.updatedAt);
  assert.equal(detail.value, '0');
  assert.equal(detail.desc, '');
});

test('server status flattens the collector envelope, averages CPU percentages and converts binary units', async (t) => {
  environment(t);
  const { systemApi } = await import('../src/api/endpoints.ts');
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/system/getServerInfo');
    assert.equal(options.method, 'POST');
    return response({
      code: 0,
      data: {
        server: {
          os: { goos: 'fixture-os', numCpu: 8, goVersion: 'go1.fixture' },
          cpu: { cores: 4, cpus: [0, 50, 100, 10] },
          ram: { usedMb: 1024, totalMb: 8192 },
          disk: [{ mountPoint: '/fixture', usedGb: 0, totalGb: 10.5 }],
        },
      },
    });
  };
  const result = await systemApi.getServerInfo();
  assert.equal(result.os, 'fixture-os');
  assert.equal(result.goVersion, 'go1.fixture');
  assert.equal(result.cpus, 4);
  assert.equal(result.cpuUsed, 40);
  assert.equal(result.memUsed, 1024 ** 3);
  assert.equal(result.memTotal, 8 * 1024 ** 3);
  assert.equal(result.disks[0].total, 10.5 * 1024 ** 3);
  assert.equal(result.disks[0].used, 0);
  assert.equal(result.disks[0].path, '/fixture');
  assert.equal(result.arch, undefined);
});

test('missing server measurements stay unknown while genuine zero and flat historical values are preserved', () => {
  const missing = normalizeServerInfo({
    server: { os: { numCpu: 8 }, cpu: { cores: 0, cpus: [] }, ram: {}, disk: [{}] },
  });
  assert.equal(missing.cpus, 8);
  assert.equal(missing.cpuUsed, undefined);
  assert.equal(missing.memUsed, undefined);
  assert.equal(missing.memTotal, undefined);
  assert.equal(missing.disks[0].used, undefined);
  assert.equal(missing.os, undefined);
  assert.equal(normalizeServerInfo({ cpu: { cpus: [10, null] } }).cpuUsed, undefined);
  assert.equal(normalizeServerInfo({ cpu: { cpus: [10, 101] } }).cpuUsed, undefined);
  assert.equal(
    normalizeServerInfo({ ram: { usedMb: null, totalMb: Infinity } }).memUsed,
    undefined,
  );
  const old = normalizeServerInfo({
    cpuUsed: 0,
    cpus: 2,
    memTotal: 1024,
    memUsed: 0,
    disks: [{ path: '/', total: 512, used: 0 }],
    os: 'fixture',
    goVersion: 'go.fixture',
  });
  assert.equal(old.cpuUsed, 0);
  assert.equal(old.memUsed, 0);
  assert.equal(old.memTotal, 1024);
  assert.equal(old.disks[0].used, 0);
  assert.deepEqual(normalizeServerInfo(null).disks, []);
});
