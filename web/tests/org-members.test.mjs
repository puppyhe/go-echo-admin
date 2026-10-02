import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canChooseMember,
  departmentParentOptions,
  filterDepartments,
  sameMembers,
  updateMemberSelection,
} from '../src/pages/org/model.ts';

test('member toggles and page select-all only modify the current page identities', () => {
  const original = [1, 2, 50];
  const next = updateMemberSelection(original, [3, 4], true);
  assert.deepEqual(next, [1, 2, 3, 4, 50]);
  assert.deepEqual(updateMemberSelection(next, [2, 3, 4], false), [1, 50]);
  assert.deepEqual(original, [1, 2, 50]);
  assert.ok(sameMembers([50, 1, 1], [1, 50]));
  assert.ok(!sameMembers([1, 2], [1, 3]));
});
test('frozen members can be retained or removed but cannot be newly selected', () => {
  assert.ok(canChooseMember({ id: 8, enable: 2 }, [8]));
  assert.ok(!canChooseMember({ id: 8, enable: 2 }, [9]));
  assert.ok(canChooseMember({ id: 8, enable: 1 }, []));
});
test('department reparenting excludes self and descendants; search keeps the ancestor chain', () => {
  const tree = [
    {
      id: 1,
      name: 'message',
      status: true,
      children: [
        {
          id: 2,
          name: 'message',
          status: false,
          children: [{ id: 3, name: 'frontendmessage', status: true, children: [] }],
        },
      ],
    },
  ];
  assert.deepEqual(departmentParentOptions(tree, 2), [{ value: 1, title: 'message', children: [] }]);
  assert.equal(filterDepartments(tree, 'frontend')[0].children[0].children[0].id, 3);
  assert.equal(tree[0].children.length, 1);
});
