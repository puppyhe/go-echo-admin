import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAutoCodeForm, parseHistoryForm } from '../src/domain/autoCode.ts';
import { autoCodeApi } from '../src/api/endpoints.ts';
import { normalizeMenu } from '../src/api/normalize.ts';
import {
  buildWorkflowRequest,
  hydrateWorkflow,
  workflowPayload,
} from '../src/domain/aiWorkflow.ts';

test('generator history preserves legacy false and prefers the current model flag', () => {
  const legacy = { fields: [], gvaModel: false, description: 'User content stays unchanged' };
  const restored = parseHistoryForm({ request: JSON.stringify(legacy) });
  assert.equal(restored.geaModel, false);
  assert.equal(restored.description, legacy.description);
  assert.equal(Object.hasOwn(restored, 'gvaModel'), false);
  assert.equal(parseHistoryForm({ ...legacy, geaModel: true }).geaModel, true);
  assert.equal(parseHistoryForm({ ...legacy, geaModel: false, gvaModel: true }).geaModel, false);
  assert.equal(defaultAutoCodeForm().geaModel, true);
});

test('generator requests use only the current model flag, even when loading old drafts', async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.sessionStorage;
  const bodies = [];
  globalThis.sessionStorage = { getItem: () => null };
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ code: 0, data: { map: {} } }));
  };
  try {
    await autoCodeApi.preview({ fields: [], gvaModel: false });
    await autoCodeApi.preview({ fields: [], gvaModel: true, geaModel: false });
    for (const body of bodies) {
      assert.equal(body.geaModel, false);
      assert.equal(Object.hasOwn(body, 'gvaModel'), false);
    }
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.sessionStorage = previousStorage;
  }
});

test('workflow sessions normalize legacy control values without rewriting user messages', () => {
  for (const [previous, current] of [
    ['gva_codegen', 'gea_codegen'],
    ['gva_polish', 'gea_polish'],
  ]) {
    const session = hydrateWorkflow({
      id: 3,
      tab: 'workflow',
      formData: JSON.stringify({ flowType: previous, source: `User description: ${previous}` }),
      messages: JSON.stringify([{ id: 'u1', role: 'user', content: previous }]),
    });
    assert.equal(session.formData.flowType, current);
    assert.equal(session.formData.source, `User description: ${previous}`);
    assert.equal(session.messages[0].content, previous);
    const request = buildWorkflowRequest(session, '', 12);
    assert.equal(request.inputs.flowType, current);
    assert.equal(request.scene, 'gea_ai_workflow');
    assert.equal(workflowPayload(session).formData.flowType, current);
  }
});

test('legacy menu icon aliases use current assets without rewriting titles or routes', () => {
  const source = {
    id: 9,
    path: 'custom-page',
    component: 'view/example/custom.vue',
    meta: { icon: 'customer-gva', title: 'Custom title' },
  };
  const menu = normalizeMenu(source);
  assert.equal(menu.meta.icon, 'customer-gea');
  assert.equal(menu.meta.title, source.meta.title);
  assert.equal(menu.path, source.path);
  assert.equal(menu.component, source.component);
  assert.equal(source.meta.icon, 'customer-gva');
});

test('new generator modules default to ownership while legacy history preserves API-only access', () => {
  assert.equal(defaultAutoCodeForm().disableDataScope, false);
  assert.equal(parseHistoryForm({ fields: [] }).disableDataScope, true);
  assert.equal(parseHistoryForm({ fields: [], disableDataScope: false }).disableDataScope, false);
  assert.equal(parseHistoryForm({ fields: [], disableDataScope: true }).disableDataScope, true);
});
