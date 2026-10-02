import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseVersionPackage,
  countVersionMenus,
  versionImportBody,
} from '../src/pages/systemTools/logs/versionImport.ts';

test('version parsing reads actual nested metadata and does not trust uploaded import mode', () => {
  const data = parseVersionPackage(
    JSON.stringify({
      version: { name: 'releasemessage', code: 'v1' },
      menus: [{ name: 'root', path: 'root', children: [{ name: 'child', path: 'child' }] }],
      mode: 'resources',
      dryRun: false,
    }),
  );
  assert.equal(data.version.name, 'releasemessage');
  assert.equal(countVersionMenus(data.menus), 2);
  const body = versionImportBody(data, 'record', true);
  assert.equal(body.mode, 'record');
  assert.equal(body.dryRun, true);
  assert.deepEqual(Object.keys(body).sort(), [
    'apis',
    'dictionaries',
    'dryRun',
    'menus',
    'mode',
    'version',
  ]);
  assert.deepEqual(
    parseVersionPackage(JSON.stringify({ versionData: JSON.stringify(data) })),
    data,
  );
});

test('version parser bounds malformed and deeply nested import previews before rendering', () => {
  for (const input of [
    '[]',
    'null',
    '{"version":{}}',
    '{"version":{"name":"n","code":"1"},"menus":{}}',
  ])
    assert.throws(() => parseVersionPackage(input));
  assert.throws(() => parseVersionPackage(' '.repeat(128001)), /exceeds 128000 bytes/);
  let tree = [{ name: 'leaf', path: 'leaf', children: [] }];
  for (let i = 0; i < 11; i++) tree = [{ name: `n${i}`, path: `n${i}`, children: tree }];
  assert.equal(countVersionMenus(tree), 12);
  assert.throws(
    () => countVersionMenus([{ name: 'extra', path: 'extra', children: tree }]),
    /exceeds 12 levels/,
  );
});

test('confirmed resource import preserves selected structured data and excludes uploaded ownership', () => {
  const source = {
    ID: 99,
    userID: 1,
    version: { name: 'x', code: '1' },
    apis: [{ path: '/test', method: 'GET' }],
  };
  const body = versionImportBody(source, 'resources', false);
  assert.equal(body.mode, 'resources');
  assert.equal(body.dryRun, false);
  assert.equal(body.ID, undefined);
  assert.equal(body.userID, undefined);
  assert.deepEqual(body.apis, source.apis);
});
