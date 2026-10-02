import test from 'node:test';
import assert from 'node:assert/strict';
import { readLlmResponse, applyLlmEvent } from '../src/domain/llmStream.ts';
import {
  WorkflowConversation,
  newWorkflow,
  hydrateWorkflow,
  buildWorkflowRequest,
  restoreWorkflowNode,
  workflowSnapshot,
} from '../src/domain/aiWorkflow.ts';
const empty = () => ({ text: '', conversationId: '', messageId: '' });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const response = (text) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const byte of new TextEncoder().encode(text)) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
const detail = (body, id = 12, version = 1) => ({
  ...body,
  id,
  updatedAt: `2026-09-13T00:00:00.${String(version).padStart(3, '0')}Z`,
  settings: JSON.stringify(body.settings ?? {}),
  formData: JSON.stringify(body.formData ?? {}),
  resultData: JSON.stringify(body.resultData ?? {}),
  messages: JSON.stringify(body.messages),
});
const fakeIO = (stream) => {
  const saves = [];
  return {
    saves,
    stream,
    async save(body) {
      saves.push(structuredClone(body));
      return detail(body, body.id || 12, saves.length);
    },
  };
};
const initial = (id = 0) => {
  const v = newWorkflow('analysis');
  v.id = id;
  v.updatedAt = id ? '2026-09-13T00:00:00.000Z' : undefined;
  v.formData.requirement = 'messageapproval';
  return v;
};

test('SSE handles UTF8 and CRLF byte boundaries, repeated deltas and terminal IDs', async () => {
  const result = await readLlmResponse(
    response(
      ': heartbeat\r\n\r\ndata: {"event":"message","answer":"ha","conversation_id":"c1"}\r\n\r\ndata: {"event":"message","answer":"ha"}\r\n\r\ndata: {"event":"message_end","message_id":"m2"}\r\n\r\ndata: [DONE]\r\n\r\n',
    ),
    () => {},
  );
  assert.equal(result.text, 'haha');
  assert.equal(result.conversationId, 'c1');
  assert.equal(result.messageId, 'm2');
  let state = applyLlmEvent(empty(), { answer: 'hello' });
  state = applyLlmEvent(state, { answer: 'hello world' });
  state = applyLlmEvent(state, { choices: [{ delta: { content: '!' } }] });
  assert.equal(state.text, 'hello world!');
});
test('error frames reject after partial output without being appended as answer', async () => {
  const seen = [];
  await assert.rejects(
    readLlmResponse(
      response(
        'data: {"event":"message","answer":"ha"}\n\ndata: {"event":"error","message":"Upstream model failed"}\n\n',
      ),
      (v) => seen.push(v.text),
    ),
    /Upstream model failed/,
  );
  assert.deepEqual(seen, ['ha']);
  await assert.rejects(
    readLlmResponse(response('event: error\ndata: {"message":"Stream closed unexpectedly"}\n\n'), () => {}),
    /Stream closed unexpectedly/,
  );
});
test('JSON fallback preserves IDs; missing configuration and HTML responses fail', async () => {
  const result = await readLlmResponse(
    new Response('{"code":0,"data":{"answer":"message","conversation_id":"c","message_id":"m"}}', {
      headers: { 'Content-Type': 'application/json' },
    }),
    () => {},
  );
  assert.equal(result.text, 'message');
  assert.equal(result.conversationId, 'c');
  await assert.rejects(
    readLlmResponse(
      new Response('{"code":1,"msg":"AI service configuration is missing"}', {
        headers: { 'Content-Type': 'application/json' },
      }),
      () => {},
    ),
    /configuration is missing/,
  );
  await assert.rejects(
    readLlmResponse(
      new Response('<html>gateway</html>', { headers: { 'Content-Type': 'text/html' } }),
      () => {},
    ),
    /invalid response/ ,
  );
});
test('abort cancels an idle reader instead of hanging', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const promise = readLlmResponse(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    ),
    () => {},
    controller.signal,
  );
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(cancelled, true);
});
test('protected mode, identity, input and conversation cannot be overridden', () => {
  const v = initial();
  v.settings.extraPayload = JSON.stringify({
    mode: 'evil',
    query: 'wrong',
    user: 'other',
    inputs: { bad: true },
    response_mode: 'blocking',
    conversation_id: 'stolen',
    temperature: 0.3,
  });
  const body = buildWorkflowRequest(v, undefined, 7);
  assert.equal(body.mode, 'analysisChat');
  assert.equal(body.query, 'messageapproval');
  assert.equal(body.user, '7');
  assert.equal(body.inputs.requirement, 'messageapproval');
  assert.equal(body.conversation_id, undefined);
  assert.equal(body.temperature, 0.3);
  v.settings.extraPayload = '[]';
  assert.throws(() => buildWorkflowRequest(v, undefined, 7), /JSON object/);
});
test('snapshot and rollback keep chosen result, truncate future messages and reset branch', () => {
  const snapshot = workflowSnapshot({
    ...empty(),
    text: '```json\n{"summary":"message","steps":[{"title":"message","prompt":"messagefield"}]}\n```',
  });
  assert.equal(snapshot.steps[0].prompt, 'messagefield');
  const v = initial(10);
  v.messages = [
    { id: 'u', role: 'user', content: 'Initial request' },
    { id: 'a', role: 'assistant', content: 'Initial answer', snapshot, status: 'complete' },
    { id: 'u2', role: 'user', content: 'Future request' },
    { id: 'a2', role: 'assistant', content: 'Future answer' },
  ];
  v.conversationId = 'c';
  v.messageId = 'm';
  const restored = restoreWorkflowNode(v, 'a');
  assert.equal(v.messages.length, 4);
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.conversationId, '');
  assert.equal(restored.resultData.summary, 'message');
  const body = buildWorkflowRequest(restored, 'Current request', 7);
  assert.equal(body.conversation_id, undefined);
  assert.match(body.query, /Message history:/);
  assert.match(body.query, /Initial request/);
  assert.match(body.query, /Request: Current request/);
  assert.doesNotMatch(body.query, /Future request|Future answer/);
});
test('run saves pending first, then complete result and upstream IDs using returned revision', async () => {
  const io = fakeIO(async (body, progress) => {
    assert.equal(io.saves.length, 1);
    assert.equal(io.saves[0].messages[1].status, 'pending');
    const result = {
      text: '{"summary":"message","modules":[{"name":"order"}]}',
      conversationId: 'c1',
      messageId: 'm1',
    };
    progress(result);
    return result;
  });
  const c = new WorkflowConversation(initial(), io, () => {});
  await c.run(undefined, 7);
  assert.equal(c.value.id, 12);
  assert.equal(c.dirty, false);
  assert.equal(io.saves[1].expectedUpdatedAt, '2026-09-13T00:00:00.001Z');
  assert.equal(io.saves[1].messages[1].status, 'complete');
  assert.equal(io.saves[1].resultData.summary, 'message');
  assert.equal(buildWorkflowRequest(c.value, 'messagefield', 7).conversation_id, 'c1');
});
test('stop before initial persistence finishes prevents upstream call', async () => {
  const saved = deferred();
  let called = false;
  const io = fakeIO(async () => {
    called = true;
    return empty();
  });
  const regular = io.save;
  io.save = async (body) => {
    if (!io.saves.length) {
      io.saves.push(structuredClone(body));
      await saved.promise;
      return detail(body, 12, 1);
    }
    return regular(body);
  };
  const c = new WorkflowConversation(initial(), io, () => {});
  const run = c.run(undefined, 7);
  const stopping = c.stop();
  saved.resolve();
  await stopping;
  await run;
  assert.equal(called, false);
  assert.equal(io.saves.at(-1).messages[1].status, 'stopped');
  assert.equal(c.running, false);
});
test('late streaming callbacks cannot overwrite stopped content or another session', async () => {
  const started = deferred();
  let callback;
  const io = fakeIO(async (body, progress, signal) => {
    callback = progress;
    progress({ text: 'message', conversationId: 'c', messageId: 'm' });
    started.resolve();
    await new Promise((r) => signal.addEventListener('abort', r, { once: true }));
    progress({ text: 'message', conversationId: 'bad', messageId: 'bad' });
    throw new DOMException('stop', 'AbortError');
  });
  const first = new WorkflowConversation(initial(10), io, () => {});
  const other = new WorkflowConversation(initial(20), io, () => {});
  const run = first.run(undefined, 7);
  await started.promise;
  await assert.rejects(first.run('message', 7), /already running/);
  await first.stop();
  await run;
  callback({ text: 'message', conversationId: 'bad', messageId: 'bad' });
  assert.equal(first.value.messages[1].content, 'message');
  assert.equal(first.value.messages[1].status, 'stopped');
  assert.equal(first.value.conversationId, '');
  assert.equal(other.value.messages.length, 0);
  assert.ok(io.saves.every((v) => v.id === 10));
});
test('upstream failure or empty completion persists failed status without a fabricated answer', async () => {
  for (const failure of [new Error('AI service configuration is missing'), null]) {
    const io = fakeIO(async () => {
      if (failure) throw failure;
      return empty();
    });
    const c = new WorkflowConversation(initial(), io, () => {});
    await assert.rejects(c.run(undefined, 7), (error) =>
      failure ? error === failure : error instanceof Error && error.message === 'AI service returned no content',
    );
    assert.equal(c.value.messages[1].content, '');
    assert.equal(io.saves.at(-1).messages[1].status, 'failed');
    assert.equal(c.dirty, false);
  }
});
test('final save conflict retains generated content and stale revision locally', async () => {
  const io = fakeIO(async () => ({ text: 'message', conversationId: 'c', messageId: 'm' }));
  const regular = io.save;
  io.save = async (body) => {
    if (io.saves.length) throw new Error('Page update conflict');
    return regular(body);
  };
  const c = new WorkflowConversation(initial(10), io, () => {});
  await assert.rejects(c.run(undefined, 7), /Page update conflict/);
  assert.equal(c.dirty, true);
  assert.equal(c.value.messages[1].content, 'message');
  assert.equal(c.value.updatedAt, '2026-09-13T00:00:00.001Z');
  await assert.rejects(c.save(), /Page update conflict/);
});
test('reopened pending turns become interrupted and keep partial text', () => {
  const v = hydrateWorkflow(
    detail({
      ...initial(10),
      messages: [{ id: 'a', role: 'assistant', content: 'message', status: 'pending' }],
    }),
  );
  const c = new WorkflowConversation(
    v,
    fakeIO(async () => empty()),
    () => {},
  );
  assert.equal(c.value.messages[0].status, 'stopped');
  assert.equal(c.value.messages[0].content, 'message');
  assert.equal(c.dirty, true);
});
test('a checkpoint response merges its revision without discarding newer stream chunks', async () => {
  const started = deferred(),
    release = deferred(),
    checkpointStarted = deferred(),
    checkpointSaved = deferred();
  let emit;
  const io = fakeIO(async (body, progress) => {
    emit = progress;
    progress({ text: 'message', conversationId: 'c', messageId: 'm' });
    started.resolve();
    await release.promise;
    return { text: 'message', conversationId: 'c', messageId: 'm' };
  });
  const regular = io.save;
  io.save = async (body) => {
    if (io.saves.length === 1) {
      checkpointStarted.resolve();
      await checkpointSaved.promise;
    }
    return regular(body);
  };
  const c = new WorkflowConversation(initial(10), io, () => {});
  const run = c.run(undefined, 7);
  await started.promise;
  const checkpoint = c.save();
  await checkpointStarted.promise;
  emit({ text: 'message', conversationId: 'c', messageId: 'm' });
  checkpointSaved.resolve();
  await checkpoint;
  assert.equal(c.value.messages[1].content, 'message');
  assert.equal(c.value.updatedAt, '2026-09-13T00:00:00.002Z');
  assert.equal(c.dirty, true);
  release.resolve();
  await run;
  assert.equal(io.saves.at(-1).expectedUpdatedAt, '2026-09-13T00:00:00.002Z');
  emit({ text: 'message', conversationId: 'bad', messageId: 'bad' });
  assert.equal(c.value.messages[1].content, 'message');
});
test('nested structured gateways and prose-wrapped JSON preserve workflow details', async () => {
  const result = await readLlmResponse(
    new Response(
      JSON.stringify({
        code: 0,
        data: { outputs: { result: { overview: 'message', promptFlow: ['message', 'page'] } } },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
    () => {},
  );
  assert.deepEqual(workflowSnapshot(result).steps, [{ prompt: 'message' }, { prompt: 'page' }]);
  const wrapped = workflowSnapshot({
    ...empty(),
    text: 'message：\n```json\n{"payload":{"overview":"message","moduleList":[{"name":"order"}]}}\n```\nmessage。',
  });
  assert.equal(wrapped.summary, 'message');
  assert.equal(wrapped.modules[0].name, 'order');
});
