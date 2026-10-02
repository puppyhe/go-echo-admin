import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Form } from 'antd';
import { session, request, postForm, checkSessionResponse } from '../src/api/request.ts';
import { downloadByUrl } from '../src/api/download.ts';
import { platformApi, platformSession, tenancyApi } from '../src/tenancy/api.ts';
import { login } from '../src/services/authService.ts';
import { dictionaryService } from '../src/services/dictionaryService.ts';
import { acquireAsset, protectedAsset } from '../src/features/upload/AuthenticatedAsset.tsx';
import { validateTenantCode, validateAdminPassword } from '../src/tenancy/model.ts';
import { TenantCreateFields } from '../src/tenancy/TenantCreateFields.tsx';
import { tenancyFeedback } from '../src/tenancy/errors.ts';
import { ticketURL, mobileApi } from '../src/pages/example/mobileUpload/api.ts';
const A = { id: '1234567890abcdef1234567890abcdef', code: 'acme', name: 'Acme' },
  B = { id: 'abcdef1234567890abcdef1234567890', code: 'beta', name: 'Beta' };
const user = { ID: 1, nickName: 'admin', headerImg: '', authorityId: 888 };
const envelope = (data, headers = {}) =>
  new Response(JSON.stringify({ code: 0, data }), {
    headers: { 'content-type': 'application/json', ...headers },
  });
function environment(t) {
  const prior = Object.fromEntries(
    ['fetch', 'window', 'sessionStorage', 'document'].map((key) => [key, globalThis[key]]),
  );
  const memory = new Map();
  const redirects = [],
    downloads = [];
  globalThis.sessionStorage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  globalThis.window = {
    location: {
      origin: 'https://app.example',
      pathname: '/business/purchases',
      assign: (url) => redirects.push(url),
    },
    URL: {
      createObjectURL: () => {
        downloads.push('blob');
        return 'blob:fixture';
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
  session.start('A-token', user, A);
  t.after(() => {
    session.clear();
    platformSession.clear();
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return { memory, redirects, downloads };
}
test('login mode follows the backend explicit enabled flag', async (t) => {
  environment(t);
  for (const enabled of [true, false]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/tenancy/info');
      assert.equal(options.credentials, 'omit');
      return envelope({ enabled });
    };
    assert.deepEqual(await tenancyApi.info(), { enabled });
  }
});
test('a missing login configuration route reports deployment errors instead of single-tenant mode', async (t) => {
  environment(t);
  globalThis.fetch = async () => new Response('Not Found', { status: 404 });
  await assert.rejects(
    tenancyApi.info(),
    (error) => error.code === 404 && /label.*labeladdress/.test(error.message),
  );
});
test('empty or malformed proxy failures identify an unavailable backend', async (t) => {
  environment(t);
  for (const [status, body, contentType] of [
    [500, '', 'text/plain'],
    [502, '<html>Bad Gateway</html>', 'text/html'],
    [503, JSON.stringify({ code: 1, msg: '   ' }), 'application/json'],
    [500, JSON.stringify({ code: 1, msg: { error: 'invalid' } }), 'application/json'],
  ]) {
    globalThis.fetch = async () =>
      new Response(body, { status, headers: { 'content-type': contentType } });
    await assert.rejects(
      tenancyApi.info(),
      (error) => error.code === status && error.message === 'backendservicemessage，messageretry',
    );
  }
});
test('network connection failures provide actionable login and tenant resolution guidance', async (t) => {
  environment(t);
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  for (const load of [() => tenancyApi.info(), () => tenancyApi.resolve('acme')])
    await assert.rejects(
      load(),
      (error) => error.code === -1 && error.message === 'backendservicemessage，messageretry',
    );
});
test('specific backend errors are preserved across business and service failures', async (t) => {
  environment(t);
  for (const [status, message] of [
    [200, 'messagefailed，messagemanagementmessage'],
    [403, 'messagedisabled'],
    [503, 'message，messageretry'],
  ]) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 1, msg: message }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    for (const load of [() => tenancyApi.info(), () => tenancyApi.resolve('acme')])
      await assert.rejects(load(), (error) => error.message === message);
  }
});
test('public entry distinguishes connection, invalid tenants and service errors without exposing diagnostics', async (t) => {
  environment(t);
  for (const [status, message, operation, kind] of [
    [400, 'messageenable', 'resolve', 'tenant'],
    [403, 'messagedisabled', 'resolve', 'tenant'],
    [404, 'message', 'resolve', 'tenant'],
    [404, 'Not Found', 'resolve', 'service'],
    [404, 'Not Found', 'info', 'configuration'],
    [400, 'SQL connection failed: host=internal.example password=secret', 'resolve', 'service'],
    [503, 'SQL connection failed: host=internal.example password=secret', 'info', 'service'],
    [200, 'messagefailed，messagemanagementmessage', 'resolve', 'service'],
  ]) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 1, msg: message }), { status });
    await assert.rejects(
      operation === 'info' ? tenancyApi.info() : tenancyApi.resolve('acme'),
      (error) => {
        const feedback = tenancyFeedback(error);
        assert.equal(feedback.kind, kind);
        assert.doesNotMatch(
          `${feedback.title}${feedback.description}`,
          /SQL|secret|internal\.example|Not Found/,
        );
        assert.match(feedback.description, /managementlabel/);
        if (status !== 404 || operation !== 'info') assert.equal(error.message, message);
        return true;
      },
    );
  }
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(tenancyApi.info(), (error) => {
    assert.equal(tenancyFeedback(error).kind, 'connection');
    return true;
  });
  globalThis.fetch = async () => envelope({ enabled: false });
  assert.deepEqual(await tenancyApi.info(), { enabled: false });
});
test('malformed successful login responses stay errors with safe service-configuration guidance', async (t) => {
  environment(t);
  for (const response of [envelope({ enabled: 'false' }), new Response('<html>app</html>')]) {
    globalThis.fetch = async () => response;
    await assert.rejects(tenancyApi.info(), (error) => {
      assert.equal(tenancyFeedback(error).kind, 'configuration');
      assert.doesNotMatch(tenancyFeedback(error).description, /label|API|HTML|version/);
      return true;
    });
  }
});
test('tenant creation omits the default database selection and preserves an explicit advanced choice', async (t) => {
  environment(t);
  const profiles = [
    { key: 'secondary', label: 'messageconfiguration', driver: 'postgres', isDefault: false },
    { key: 'primary', label: 'messageconfiguration', driver: 'mysql', isDefault: true },
  ];
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return envelope(url.endsWith('/database-profiles') ? { list: profiles } : A);
  };
  assert.deepEqual((await platformApi.profiles()).list, profiles);
  const base = { name: 'Acme', code: 'acme', adminPassword: '123456789012' };
  await platformApi.create(base);
  await platformApi.create({ ...base, databaseRef: 'secondary' });
  assert.deepEqual(JSON.parse(calls[1].body), base);
  assert.equal(JSON.parse(calls[2].body).databaseRef, 'secondary');
});
test('tenant opening shows only name, code and password until advanced settings are opened', () => {
  const primary = { key: 'primary', label: 'messageconfiguration', driver: 'mysql', isDefault: true };
  const secondary = { key: 'secondary', label: 'messageconfiguration', driver: 'postgres', isDefault: false };
  for (const profiles of [[primary], [secondary, primary]]) {
    const markup = renderToStaticMarkup(
      createElement(Form, null, createElement(TenantCreateFields, { profiles })),
    );
    assert.equal((markup.match(/<input\b/g) ?? []).length, 3);
    for (const label of ['messagename', 'message', 'messagemanagementmessage'])
      assert.ok(markup.includes(label));
    assert.equal(markup.includes('message'), profiles.length > 1);
    assert.doesNotMatch(markup, /databaseconfiguration|postgres|mysql/);
  }
});
test('invalid login configuration cannot silently select single-tenant mode', async (t) => {
  environment(t);
  for (const data of [null, undefined, {}, { enabled: 'false' }, { enabled: 0 }]) {
    globalThis.fetch = async () => envelope(data);
    await assert.rejects(tenancyApi.info(), /sign inconfigurationresponselabel/);
  }
  globalThis.fetch = async () =>
    new Response('<!doctype html><html></html>', {
      headers: { 'content-type': 'text/html' },
    });
  await assert.rejects(tenancyApi.info(), /labelinformation/);
});
test('tenant login/captcha omit old credentials while JSON and multipart bind the selected tenant', async (t) => {
  environment(t);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return envelope({ ok: true });
  };
  await request('/base/captcha', { method: 'POST', anonymous: true });
  await request('/protected');
  await postForm('/import', new FormData());
  assert.equal(calls[0].headers['x-token'], undefined);
  assert.equal(calls[0].headers['x-tenant-id'], 'acme');
  for (const c of calls.slice(1)) {
    assert.equal(c.headers['x-token'], 'A-token');
    assert.equal(c.headers['x-tenant-id'], 'acme');
  }
});
test('late renewal, data and unauthorized responses cannot replace or clear the new tenant session', async (t) => {
  const state = environment(t);
  for (const response of [
    envelope({ secret: 'A' }, { 'new-token': 'A-renewed' }),
    new Response('', { status: 401 }),
  ]) {
    session.start('A-token', user, A);
    let finish;
    globalThis.fetch = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const pending = request('/protected', { skipError: true });
    session.start('B-token', user, B);
    finish(response);
    await assert.rejects(pending, (error) => error.code === -2);
    assert.equal(session.getToken(), 'B-token');
    assert.equal(session.getTenant().code, 'beta');
  }
  assert.deepEqual(state.redirects, []);
});
test('in-flight requests are aborted on tenant changes and old bodies remain unusable', async (t) => {
  environment(t);
  let signal, body;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          body = controller;
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  const pending = request('/protected', { skipError: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  session.start('B-token', user, B);
  assert.equal(signal.aborted, true);
  body.enqueue(new TextEncoder().encode('{"code":0,"data":{"secret":"A"}}'));
  body.close();
  await assert.rejects(pending, (error) => error.code === -2);
});
test('current tenant expiry and forced password change preserve tenant login links', async (t) => {
  const state = environment(t);
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(request('/protected'), (error) => error.code === 401);
  assert.deepEqual(state.redirects, ['/login?tenant=acme']);
  assert.equal(session.getTenant().code, 'acme');
  session.start('A-token', user, A);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 428, msg: 'change password' }), {
      headers: { 'content-type': 'application/json' },
    });
  await assert.rejects(request('/protected'), (error) => error.code === 428);
  assert.equal(state.redirects.at(-1), '/login?tenant=acme&passwordChange=1');
});
test('download headers bind tenants and switching while reading the body prevents saving bytes', async (t) => {
  const state = environment(t);
  let body;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers['x-tenant-id'], 'acme');
    return new Response(
      new ReadableStream({
        start(c) {
          body = c;
        },
      }),
      { headers: { 'content-type': 'application/octet-stream' } },
    );
  };
  const pending = downloadByUrl('/uploads/acme/file.xlsx');
  await new Promise((resolve) => setTimeout(resolve, 0));
  session.start('B-token', user, B);
  body.enqueue(new Uint8Array([1, 2, 3]));
  body.close();
  await assert.rejects(pending, (error) => error.code === -2);
  assert.deepEqual(state.downloads, []);
});
test('platform credentials and expiry stay separate from tenant credentials', async (t) => {
  const state = environment(t);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return envelope(url.endsWith('/login') ? { token: 'platform-token' } : { list: [] });
  };
  await platformApi.login({ username: 'platform', password: 'long-password' });
  await platformApi.tenants();
  await tenancyApi.resolve('beta');
  assert.equal(calls[0].headers['x-platform-token'], undefined);
  assert.equal(calls[1].headers['x-platform-token'], 'platform-token');
  for (const c of calls) {
    assert.equal(c.headers?.['x-token'], undefined);
    assert.equal(c.headers?.['x-tenant-id'], undefined);
    assert.equal(c.credentials, 'omit');
  }
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(platformApi.tenants());
  assert.equal(session.getToken(), 'A-token');
  assert.equal(session.getTenant().code, 'acme');
  assert.equal(platformSession.token(), '');
  assert.deepEqual(state.redirects, ['/platform/login']);
});
test('login refuses tenant mismatches and accepts server-confirmed independent accounts', async (t) => {
  environment(t);
  globalThis.fetch = async () =>
    envelope({ token: 'wrong', user, tenant: B, sessionKind: 'tenant' });
  await assert.rejects(
    login({ username: 'admin', password: 'example', captcha: '', captchaId: '1' }),
    /label/,
  );
  assert.equal(session.getToken(), 'A-token');
  globalThis.fetch = async () =>
    envelope({ token: 'new-A', user, tenant: A, sessionKind: 'tenant' });
  await login({ username: 'admin', password: 'example', captcha: '', captchaId: '1' });
  assert.equal(session.getToken(), 'new-A');
  assert.equal(session.getTenant().id, A.id);
});
test('dictionary cache and draft keys isolate equal user IDs, roles and field names across tenants', async (t) => {
  const state = environment(t);
  dictionaryService.clearCache();
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    return envelope({ list: [{ label: options.headers['x-tenant-id'], value: '1' }] });
  };
  const aKey = session.storageKey('gea:form-designer:v1');
  state.memory.set(aKey, 'A draft');
  assert.equal((await dictionaryService.getDict('status'))[0].label, 'acme');
  session.start('B-token', user, B);
  const bKey = session.storageKey('gea:form-designer:v1');
  assert.notEqual(aKey, bKey);
  assert.equal(state.memory.get(bKey), undefined);
  assert.equal((await dictionaryService.getDict('status'))[0].label, 'beta');
  assert.equal(calls, 2);
  session.start('A-token', user, A);
  assert.equal(state.memory.get(session.storageKey('gea:form-designer:v1')), 'A draft');
  assert.equal((await dictionaryService.getDict('status'))[0].label, 'acme');
  assert.equal(calls, 2);
});
test('private asset previews send tenant auth and stale asset responses cannot create blob URLs', async (t) => {
  environment(t);
  assert.equal(protectedAsset('/uploads/acme/photo.png'), true);
  assert.equal(protectedAsset('https://other.example/uploads/acme/photo.png'), false);
  let finish;
  globalThis.fetch = (url, options) => {
    assert.equal(url, '/api/uploads/acme/photo.png');
    assert.equal(options.headers['x-token'], 'A-token');
    assert.equal(options.headers['x-tenant-id'], 'acme');
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const asset = acquireAsset('/uploads/acme/photo.png');
  session.start('B-token', user, B);
  finish(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
  await assert.rejects(asset.promise, (error) => error.code === -2);
  asset.release();
});
test('business login requires a selected tenant and a tenant-bound response', async (t) => {
  environment(t);
  session.selectTenant(null);
  globalThis.fetch = async () => envelope({ token: 'legacy', user });
  await assert.rejects(login({ username: 'admin', password: 'password', captcha: '', captchaId: '' }),
    /sign inresponselabelselectlabel/);
  assert.equal(session.isAuthenticated(), false);
});
test('tenant codes and UTF-8 password bounds match provisioning requirements', () => {
  for (const code of ['a', 'Acompany', 'platform', '1company', 'a'.repeat(33), 'acme/other'])
    assert.throws(() => validateTenantCode(code));
  for (const code of ['acme', 'ab', 'a'.repeat(32), 'a-1']) validateTenantCode(code);
  validateAdminPassword('123456789012');
  validateAdminPassword('message'.repeat(24));
  for (const value of [
    'short',
    '12345678901',
    'message'.repeat(4),
    '🙂'.repeat(11),
    'a'.repeat(73),
    'message'.repeat(25),
  ])
    assert.throws(() => validateAdminPassword(value));
});
test('anonymous QR tickets preserve their issuing tenant without using the browser login', async (t) => {
  environment(t);
  const token = 'A'.repeat(43);
  const link = ticketURL(
    { token, uploadPath: '/mobile-upload?tenant=beta', publicBaseUrl: '' },
    'https://app.example',
  );
  const url = new URL(link);
  assert.equal(url.search, '?tenant=beta');
  assert.equal(url.hash, `#ticket=${token}`);
  window.location.search = url.search;
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/enterprise/media-upload/ticket?tenant=beta');
    assert.equal(options.headers['x-token'], undefined);
    assert.equal(options.headers['x-tenant-id'], undefined);
    assert.equal(options.headers['X-Upload-Ticket'], token);
    assert.equal(options.credentials, 'omit');
    return envelope({ id: 1 });
  };
  await mobileApi.info(token);
  assert.equal(session.getTenant().code, 'acme');
  for (const uploadPath of [
    '/mobile-upload?tenant=beta&tenant=acme',
    '/mobile-upload?other=beta',
    '/mobile-upload?tenant=platform',
  ])
    assert.throws(() => ticketURL({ token, uploadPath, publicBaseUrl: '' }, 'https://app.example'));
});
test('authenticated image previews share a temporary blob only within the same tenant identity', async (t) => {
  environment(t);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { 'content-type': 'image/png' },
    });
  };
  const one = acquireAsset('/uploads/acme/photo.png'),
    two = acquireAsset('/uploads/acme/photo.png');
  const [a, b] = await Promise.all([one.promise, two.promise]);
  assert.equal(a, b);
  assert.match(a, /^blob:/);
  assert.equal(calls, 1);
  one.release();
  two.release();
  session.start('B-token', user, B);
  const next = acquireAsset('/uploads/beta/photo.png');
  assert.notEqual(await next.promise, a);
  assert.equal(calls, 2);
  next.release();
});
