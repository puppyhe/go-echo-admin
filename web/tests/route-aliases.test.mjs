import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyRoutePaths } from '../src/routes/pageRegistry.ts';

test('legacy component paths retain bookmarks for moved authorized pages', () => {
  assert.deepEqual(legacyRoutePaths('view/person/person.vue'), ['person/person']);
  assert.deepEqual(legacyRoutePaths('view/superAdmin/loginLog/sysLoginLog.vue'), [
    'superAdmin/loginLog/sysLoginLog',
    'systemTools/loginLog',
  ]);
  assert.deepEqual(legacyRoutePaths('view/superAdmin/systemConfig/index.vue'), [
    'superAdmin/systemConfig',
    'systemTools/system/system',
  ]);
  assert.deepEqual(legacyRoutePaths('view/systemTools/serverState/index.vue'), [
    'systemTools/serverState',
    'system/state',
  ]);
});
