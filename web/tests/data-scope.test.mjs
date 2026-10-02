import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeLabels, scopePayload, scopeTree } from '../src/pages/superAdmin/dataScope/model.ts';
const doc = {
  authorityId: 100,
  mode: 'all',
  departmentIds: [],
  version: 0,
  configured: false,
  canWrite: true,
  departments: [],
};
test('data scope keeps legacy revision zero and clears hidden custom selection', () => {
  assert.deepEqual(scopePayload(doc, 'self', [9]), {
    authorityId: 100,
    mode: 'self',
    departmentIds: [],
    version: 0,
  });
  assert.equal(Object.keys(scopeLabels).length, 5);
  assert.deepEqual(scopePayload({ ...doc, version: 3 }, 'custom', [2, 2, 3]).departmentIds, [2, 3]);
  assert.throws(() => scopePayload(doc, 'custom', []), /自定义数据范围至少选择一个部门/);
  assert.throws(() => scopePayload(doc, 'custom', [0]), /部门编号必须为正整数/);
  assert.throws(() => scopePayload(doc, '__proto__', []), /请选择有效的数据范围模式/);
});
test('department tree preserves disabled ancestry labels and stable numeric IDs', () => {
  const source = [
    {
      id: 1,
      parentId: null,
      name: 'Root',
      status: false,
      disabled: true,
      children: [{ id: 2, parentId: 1, name: 'Child', status: true, disabled: true, children: [] }],
    },
  ];
  const tree = scopeTree(source);
  assert.equal(tree[0].disabled, true);
  assert.equal(tree[0].children[0].disabled, true);
  assert.equal(tree[0].children[0].value, 2);
  assert.match(tree[0].children[0].title, /（已禁用）/);
  assert.equal(source[0].name, 'Root');
});
