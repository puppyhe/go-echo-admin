import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMenu, normalizeUser } from '../src/api/normalize.ts';
import { buildIndex, firstLeafPath } from '../src/menu/menuPaths.ts';
import { buildRouteTree } from '../src/routes/dynamicRoutes.ts';
import { fileUrl, request, session, uploadFile } from '../src/api/request.ts';
import { userApi, menuApi, autoCodeApi, fileUploadApi } from '../src/api/endpoints.ts';

const memory = new Map();
globalThis.sessionStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
const node = (value) =>
  normalizeMenu({
    ID: 1,
    path: 'test',
    name: 'test',
    component: 'view/test/index.vue',
    meta: { title: 'test' },
    ...value,
  });

test('messagemenumessageretainmessagepath，messagemenumessage', () => {
  const tree = [
    node({ hidden: true, path: 'hidden' }),
    node({ path: 'https://example.com' }),
    node({ path: 'system', children: [node({ path: 'users', name: 'user' })] }),
  ];
  assert.equal(firstLeafPath(tree), '/system/users');
  assert.equal(buildIndex(tree).pathByName.get('user'), '/system/users');
  assert.equal(buildRouteTree(tree).routes.at(-1).redirect, '/system/users');
});

test('messagemenupathmessageduplicatemessagepath，messageparametermessagedefaultmessage', () => {
  const tree = [
    node({
      path: 'tools',
      children: [node({ path: ':id' }), node({ path: '/absolute', name: 'absolute' })],
    }),
  ];
  assert.equal(firstLeafPath(tree), '/absolute');
  assert.equal(buildIndex(tree).pathByName.get('absolute'), '/absolute');
});

test('messagerole、menuparameter、messagepermissionmessageretain', () => {
  const user = normalizeUser({
    id: 4,
    authorityId: 888,
    authorities: [{ authorityId: 888 }, { authorityId: 9528 }],
    headerImg: 'uploads/a.png',
  });
  assert.equal(user.ID, 4);
  assert.equal(user.authorities.length, 2);
  const menu = node({
    id: 9,
    ID: undefined,
    children: null,
    btns: { edit: 888 },
    parameters: [{ id: 5, key: 'id', value: '42', type: 'query' }],
  });
  assert.equal(menu.ID, 9);
  assert.equal(menu.btns.edit, 888);
  assert.equal(menu.parameters[0].ID, 5);
  assert.deepEqual(menu.children, []);
});

test('file URL messagepath、messageaddressmessagepreview', () => {
  assert.equal(fileUrl('uploads/file/a.png'), '/api/uploads/file/a.png');
  assert.equal(fileUrl('/api/uploads/file/a.png'), '/api/uploads/file/a.png');
  assert.equal(fileUrl('blob:preview'), 'blob:preview');
  assert.equal(fileUrl('data:image/png;base64,abc'), 'data:image/png;base64,abc');
});

test('usermessagemenucompatibilitymessageresponse，rolemessage token', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: { userInfo: { id: 1, authorityId: 888, authorities: [{ authorityId: 888 }] } },
      }),
      { headers: { 'new-token': 'renewed' } },
    );
  const user = await userApi.getUserInfo();
  assert.equal(user.ID, 1);
  assert.equal(session.getToken(), 'renewed');
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 0, data: { menus: [{ id: 7, name: 'menu' }] } }));
  assert.equal((await menuApi.asyncMenu()).menus[0].ID, 7);
});

test('requestmessagefailed，sign outmessagerolemessage', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 1, msg: 'message' }));
  await assert.rejects(request('/test', { skipError: true }), /message/);
  const tabsKey = session.storageKey('gea-tabs');
  sessionStorage.setItem(tabsKey, '[1]');
  session.clear();
  assert.equal(sessionStorage.getItem(tabsKey), null);
});

test('messagequerymessagebackend chunks responsemessageretainmessage', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 0, data: { chunks: [0, 1, 3] } }));
  assert.deepEqual(await fileUploadApi.findFile({ fileMd5: 'test' }), [0, 1, 3]);
});

test('messagedatabase、message、messagetemplatemessageresponse', async () => {
  globalThis.fetch = async (url) => {
    const data = String(url).includes('getDB')
      ? { dbs: [{ database: 'demo' }] }
      : String(url).includes('getTables')
        ? { tables: [{ tableName: 'customers' }] }
        : String(url).includes('getColumn')
          ? { columns: [{ columnName: 'age', dataType: 'int', columnComment: 'message' }] }
          : { pkgs: [{ id: 1, packageName: 'sales' }] };
    return new Response(JSON.stringify({ code: 0, data }));
  };
  assert.deepEqual(await autoCodeApi.getDB(), ['demo']);
  assert.deepEqual(await autoCodeApi.getTables({ dbName: 'demo' }), ['customers']);
  assert.equal(
    (await autoCodeApi.getColumn({ dbName: 'demo', tableName: 'customers' }))[0].columnType,
    'int',
  );
  assert.equal((await autoCodeApi.getPackage())[0].ID, 1);
});

test('messageroutemenumessageparametermessage、titlemessagepermission', async () => {
  const { matchingMenus } = await import('../src/menu/menuPaths.ts');
  const tree = [
    node({
      path: 'tools',
      children: [
        node({
          path: 'edit/:id',
          name: 'edit',
          meta: { title: 'edit', keepAlive: true },
          btns: { save: 888 },
        }),
      ],
    }),
  ];
  const match = matchingMenus(buildIndex(tree).nodeByPath, '/tools/edit/42').at(-1);
  assert.equal(match[0], '/tools/edit/:id');
  assert.equal(match[1].meta.keepAlive, true);
  assert.equal(match[1].btns.save, 888);
});

test('messagemenuretainmessage', async () => {
  const { matchingMenus } = await import('../src/menu/menuPaths.ts');
  const tree = [
    node({
      name: 'authority',
      path: 'authority',
      children: [node({ name: 'role', path: 'role' })],
    }),
    node({ name: 'org', path: 'org', children: [node({ name: 'user', path: '/authority/user' })] }),
  ];
  const index = buildIndex(tree).nodeByPath;
  assert.deepEqual(
    matchingMenus(index, '/authority/user').map(([path]) => path),
    ['/org', '/authority/user'],
  );
  assert.deepEqual(
    matchingMenus(index, '/authority/role').map(([path]) => path),
    ['/authority', '/authority/role'],
  );
});

test('menutitlemessagerouteparametermessagequeryparametermessage', async () => {
  const { formatMenuTitle } = await import('../src/menu/menuPaths.ts');
  assert.equal(
    formatMenuTitle(
      'message-${id} / ${tab}',
      '/tools/edit/:id',
      '/tools/edit/42',
      '?id=7&tab=field',
    ),
    'message-42 / field',
  );
});

test('backendmessagepage，message', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolvePage } = await import('../src/routes/pageRegistry.ts');
  const { isRetiredComponent } = await import('../src/domain/foundation.ts');
  const source = ['menu.go', 'frontend_pages.go', 'enterprise.go']
    .map((file) =>
      readFileSync(
        new URL(`../../backend/internal/store/seed/system/${file}`, import.meta.url),
        'utf8',
      ),
    )
    .join('\n');
  const components = [...source.matchAll(/Component:\s*"([^"]+)"/g)].map((match) => match[1]);
  for (const component of components) {
    if (component === '/' || /^https?:/.test(component)) continue;
    assert.equal(resolvePage(component).registered, !isRetiredComponent(component), component);
  }
});

test('messagecompatibilitymessagefilemessage file message，messageformmessage ID', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const data of [
      { id: 12, name: 'test.png', url: '/uploads/test.png' },
      { file: { ID: 12, name: 'test.png', url: '/uploads/test.png' } },
    ]) {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, '/api/fileUploadAndDownload/upload');
        assert.equal(options.body.get('file').name, 'test.png');
        assert.equal(options.headers['Content-Type'], undefined);
        return new Response(JSON.stringify({ code: 0, data }));
      };
      const uploaded = await uploadFile(new File(['image'], 'test.png', { type: 'image/png' }));
      assert.equal(uploaded.file.ID, 12);
      assert.equal(uploaded.file.url, '/uploads/test.png');
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, data: {} }));
    await assert.rejects(uploadFile(new File(['image'], 'test.png')), /messagefileaddress/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('foundation menu filtering removes retired leaves and only the exact empty built-in AI container', async () => {
  const { filterFoundationMenus } = await import('../src/domain/foundation.ts');
  const retired = node({ component: 'view/systemTools/skills/index.vue' });
  const purchase = node({
    name: 'purchaseOrders',
    path: 'purchases',
    component: 'business/purchase',
  });
  const menus = [
    node({ name: 'aiWorkshop', path: 'ai', component: 'routerHolder', children: [retired] }),
    node({ name: 'custom', path: 'ai', component: 'routerHolder', children: [] }),
    node({ name: 'aiWorkshop', path: 'custom', component: 'routerHolder', children: [] }),
    node({
      name: 'business',
      path: 'business',
      component: 'routerHolder',
      children: [retired, purchase],
    }),
  ];
  const filtered = filterFoundationMenus(menus);
  assert.deepEqual(
    filtered.map((menu) => menu.name),
    ['custom', 'aiWorkshop', 'business'],
  );
  assert.deepEqual(
    filtered[2].children.map((menu) => menu.name),
    ['purchaseOrders'],
  );
  assert.equal(menus[0].children.length, 1);
  assert.equal(menus[3].children.length, 2);
});
