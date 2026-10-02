import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTree,
  changeTree,
  flattenTree,
  moveTree,
  newMenu,
  newDictionary,
  newDetail,
  manifestError,
  importResources,
  menuHierarchy,
} from '../src/pages/systemTools/pluginConfig/model.ts';
const menu = (name, children = []) => ({
  ...newMenu(),
  name,
  title: name,
  path: name,
  component: 'view/example.vue',
  children,
});
const manifest = () => ({
  version: 1,
  pluginName: 'example',
  description: '',
  menus: [],
  apis: [],
  dictionaries: [],
});
test('menu and detail tree edits preserve siblings and reject cyclic reparenting', () => {
  const before = [menu('first', [menu('child')]), menu('second')];
  const edited = changeTree(before, '0.0', (node) => ({ ...node, title: 'Edited' }));
  assert.equal(before[0].children[0].title, 'child');
  assert.equal(edited[0].children[0].title, 'Edited');
  assert.equal(edited[1], before[1]);
  const moved = moveTree(before, '0', '1');
  assert.equal(moved.length, 1);
  assert.equal(moved[0].name, 'second');
  assert.equal(moved[0].children[0].name, 'first');
  assert.throws(() => moveTree(before, '0', '0.0'), /message/);
  const toAncestor = moveTree([menu('root', [menu('branch', [menu('leaf')])])], '0.0.0', '0');
  assert.deepEqual(
    toAncestor[0].children.map((v) => v.name),
    ['branch', 'leaf'],
  );
  assert.equal(toAncestor[0].children[0].children.length, 0);
});
test('moving to root and deleting subtrees does not corrupt index targets', () => {
  const before = [menu('a', [menu('b'), menu('c')]), menu('d')];
  const result = moveTree(before, '0.0', undefined);
  assert.deepEqual(
    flattenTree(result).map((v) => v.node.name),
    ['a', 'c', 'd', 'b'],
  );
  assert.equal(changeTree(result, '0', () => null).length, 2);
  assert.equal(addTree([], undefined, menu('new')).length, 1);
});
test('manifest keeps false, zero and string dictionary values without ID leakage', () => {
  const m = manifest();
  m.menus = [{ ...menu('zero'), sort: 0, hidden: false, keepAlive: false }];
  m.dictionaries = [
    {
      ...newDictionary(),
      name: 'State',
      type: 'state',
      status: false,
      details: [
        {
          ...newDetail(),
          label: 'zero',
          value: '0',
          status: false,
          sort: 0,
          children: [{ ...newDetail(), label: 'padded', value: '001' }],
        },
      ],
    },
  ];
  assert.equal(manifestError(m), undefined);
  const saved = JSON.parse(JSON.stringify(m));
  assert.equal(saved.menus[0].sort, 0);
  assert.equal(saved.dictionaries[0].status, false);
  assert.equal(saved.dictionaries[0].details[0].value, '0');
  assert.equal(saved.dictionaries[0].details[0].children[0].value, '001');
});
test('resource import detects nested collisions and retains independent drafts', () => {
  const m = manifest();
  const branch = menu('root', [menu('child')]);
  const imported = importResources(m, 'menus', [branch]);
  branch.children[0].title = 'outside';
  assert.equal(imported.menus[0].children[0].title, 'child');
  assert.equal(m.menus.length, 0);
  assert.throws(() => importResources(imported, 'menus', [menu('child')]), /message/);
  const api = { method: 'GET', path: '/example', apiGroup: 'example', description: '' };
  assert.equal(importResources({ ...m, apis: [api] }, 'apis', [api]).apis.length, 1);
});
test('ordinary configuration rejects duplicate methods/paths and dictionary values', () => {
  const m = manifest();
  m.apis = [{ method: 'GET', path: '/example', apiGroup: 'example', description: '' }];
  m.apis.push({ ...m.apis[0] });
  assert.match(manifestError(m), /duplicate/);
  m.apis = [];
  m.dictionaries = [
    {
      ...newDictionary(),
      name: 'State',
      type: 'state',
      details: [
        {
          ...newDetail(),
          label: 'a',
          value: 'same',
          children: [{ ...newDetail(), label: 'b', value: 'same' }],
        },
      ],
    },
  ];
  assert.match(manifestError(m), /duplicate/);
});

test('reparenting a menu clears only nested external mounts', () => {
  const result = menuHierarchy([
    { ...menu('root', [{ ...menu('nested'), parentName: 'old' }]), parentName: 'external' },
  ]);
  assert.equal(result[0].parentName, 'external');
  assert.equal(result[0].children[0].parentName, undefined);
});
