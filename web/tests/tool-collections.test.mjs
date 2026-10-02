import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDefinition,
  bindingForAPI,
  collectionsApi,
} from '../src/pages/systemTools/toolCollections/api.ts';

test('collections begin as disabled drafts and derive exact path parameters from selected registry API', () => {
  const definition = newDefinition('cli');
  assert.equal(definition.status, 'draft');
  assert.deepEqual(definition.bindings, []);
  assert.equal(Object.hasOwn(definition, 'token'), false);
  const binding = bindingForAPI({
    id: 5,
    path: '/records/:id/versions/:version',
    method: 'PUT',
    description: 'Update',
    apiGroup: 'records',
  });
  assert.equal(binding.apiId, 5);
  assert.deepEqual(
    binding.parameters.map((parameter) => [parameter.name, parameter.in, parameter.required]),
    [
      ['id', 'path', true],
      ['version', 'path', true],
    ],
  );
});
test('save carries CAS and structured schemas but never submits editable registry path/method snapshots', async () => {
  const previous = globalThis.fetch;
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ code: 0, data: { id: 1, lockVersion: 8 } }));
  };
  try {
    const definition = {
      ...newDefinition('cli'),
      bindings: [
        {
          ...bindingForAPI({
            id: 5,
            path: '/records/:id',
            method: 'PUT',
            description: 'Update',
            apiGroup: 'records',
          }),
          parameters: [
            {
              name: 'enabled',
              in: 'body',
              required: true,
              schema: { type: 'boolean' },
              description: 'Enable',
            },
          ],
        },
      ],
    };
    await collectionsApi.save(1, definition, 7);
    assert.equal(payload.lockVersion, 7);
    assert.equal(payload.bindings[0].apiId, 5);
    assert.equal(Object.hasOwn(payload.bindings[0], 'path'), false);
    assert.equal(Object.hasOwn(payload.bindings[0], 'method'), false);
    assert.equal(payload.bindings[0].parameters[0].schema.type, 'boolean');
  } finally {
    globalThis.fetch = previous;
  }
});
