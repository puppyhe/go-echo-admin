import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachMemberships,
  membershipFailureState,
  membershipInput,
  canAssignOrganization,
  membershipDepartmentTree,
} from '../src/pages/superAdmin/userOrganization/model.ts';
test('unavailable organization data never renders as unassigned and maps users by identity', () => {
  const users = [{ ID: 3 }, { ID: 4 }];
  const result = attachMemberships(users, [
    { userId: 4, departmentIds: [], positionIds: [], canManage: false },
  ]);
  assert.equal(result[0].organizationState, 'error');
  assert.equal(result[1].organizationState, 'ready');
  assert.equal(result[1].organization.userId, 4);
  assert.equal(membershipFailureState(new Error('organization managementpermissionmessage')), 'forbidden');
  assert.equal(membershipFailureState(new Error('network error')), 'error');
  assert.equal(attachMemberships(users, [], 'forbidden')[0].organization, undefined);
});
test('organization payload is scoped to selected identities and explicitly supports clearing', () => {
  assert.deepEqual(membershipInput([8, 3, 8], [7]), { departmentIds: [3, 8], positionIds: [7] });
  assert.deepEqual(membershipInput([], []), { departmentIds: [], positionIds: [] });
});
test('disabled organizations and frozen users retain existing choices without permitting new links', () => {
  const disabled = { id: 1, name: 'disable', status: false };
  const enabled = { id: 2, name: 'message', status: true };
  assert.equal(canAssignOrganization(disabled, [], true), false);
  assert.equal(canAssignOrganization(disabled, [1], false), true);
  assert.equal(canAssignOrganization(enabled, [], false), false);
  assert.equal(canAssignOrganization(enabled, [], true), true);
  const tree = membershipDepartmentTree(
    [{ ...disabled, children: [{ ...enabled, children: [] }] }],
    [1],
    false,
  );
  assert.equal(tree[0].disabled, false);
  assert.equal(tree[0].children[0].disabled, true);
});
