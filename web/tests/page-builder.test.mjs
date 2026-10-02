import test from 'node:test';
import assert from 'node:assert/strict';
import {
  designInput,
  htmlFileName,
  initialBrief,
  runGeneration,
} from '../src/pages/systemTools/pageBuilder/model.ts';
import { readLlmResponse } from '../src/domain/llmStream.ts';
const input = () =>
  designInput({ title: ' Example ', brief: initialBrief() }, '<html>old</html>', 2);
const saved = { ...input(), id: 4, revision: 3, previewHtml: '<html>safe</html>' };
const progress = { text: '<html>generated</html>', messageId: '9', conversationId: '4' };
const version = { id: 9, source: progress.text, status: 'complete' };
test('page brief keeps false responsive and explicit source/revision without server-only fields', () => {
  const brief = initialBrief();
  brief.responsive = false;
  const value = designInput({ title: ' Page ', brief }, 'source', 7);
  assert.equal(value.brief.responsive, false);
  assert.equal(value.title, 'Page');
  assert.equal(value.revision, 7);
  assert.deepEqual(Object.keys(value).sort(), ['brief', 'revision', 'source', 'title']);
  brief.sections.push('custom');
  assert.ok(initialBrief().sections.every((value) => value !== 'custom'));
  assert.equal(htmlFileName('../bad/<name>?'), '..-bad--name--.html');
});
test('save before streaming, then use authoritative current source after concurrent edit', async () => {
  const calls = [];
  const current = { ...saved, revision: 5, source: '<html>manual-newer</html>' };
  const api = {
    save: async (value, id) => {
      calls.push('save');
      assert.equal(id, 4);
      assert.equal(value.revision, 2);
      return saved;
    },
    generate: async (id, revision, instruction, signal, onProgress) => {
      calls.push('generate');
      assert.equal(revision, 3);
      assert.equal(instruction, 'blue');
      onProgress(progress);
      return progress;
    },
    get: async () => current,
    version: async () => ({ ...version, status: 'conflict' }),
  };
  const result = await runGeneration(
    api,
    input(),
    4,
    'blue',
    new AbortController().signal,
    () => calls.push('saved'),
    () => calls.push('delta'),
  );
  assert.deepEqual(calls, ['save', 'saved', 'generate', 'delta']);
  assert.equal(result.current, current);
  assert.notEqual(result.current.source, result.version.source);
});
test('stop before save or while saving avoids any provider call; late stream progress ignored', async () => {
  const abort = new AbortController();
  abort.abort();
  let called = false;
  await assert.rejects(
    runGeneration(
      {
        save: async () => {
          called = true;
        },
      },
      input(),
      4,
      '',
      abort.signal,
      () => {},
      () => {},
    ),
    { name: 'AbortError' },
  );
  assert.equal(called, false);
  const during = new AbortController();
  await assert.rejects(
    runGeneration(
      {
        save: async () => {
          during.abort();
          return saved;
        },
        generate: async () => {
          called = true;
        },
      },
      input(),
      4,
      '',
      during.signal,
      () => {},
      () => {},
    ),
    { name: 'AbortError' },
  );
  assert.equal(called, false);
  const streaming = new AbortController();
  let shown = false;
  await assert.rejects(
    runGeneration(
      {
        save: async () => saved,
        generate: async (_id, _revision, _instruction, _signal, callback) => {
          streaming.abort();
          callback(progress);
          return progress;
        },
      },
      input(),
      4,
      '',
      streaming.signal,
      () => {},
      () => {
        shown = true;
      },
    ),
    { name: 'AbortError' },
  );
  assert.equal(shown, false);
});
test('persistence error prevents generation and missing version response cannot silently succeed', async () => {
  let called = false;
  await assert.rejects(
    runGeneration(
      {
        save: async () => {
          throw new Error('conflict');
        },
        generate: async () => {
          called = true;
        },
      },
      input(),
      4,
      '',
      new AbortController().signal,
      () => {},
      () => {},
    ),
    /conflict/,
  );
  assert.equal(called, false);
  await assert.rejects(
    runGeneration(
      { save: async () => saved, generate: async () => ({ ...progress, messageId: '' }) },
      input(),
      4,
      '',
      new AbortController().signal,
      () => {},
      () => {},
    ),
    /Version ID is missing/,
  );
});
test('normalized stream emits real progress before the terminal frame and preserves server version ids', async () => {
  let streamController;
  const body = new ReadableStream({
    start(controller) {
      streamController = controller;
    },
  });
  const encode = (event) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
  let first;
  const ready = new Promise((resolve) => {
    first = resolve;
  });
  const reading = readLlmResponse(
    new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    (value) => {
      if (value.text) first(value);
    },
  );
  streamController.enqueue(encode({ event: 'start', message_id: '9', conversation_id: '4' }));
  streamController.enqueue(encode({ event: 'message', answer: '<html>', message_id: '9' }));
  assert.equal((await ready).text, '<html>');
  streamController.enqueue(encode({ event: 'message', answer: '</html>' }));
  streamController.enqueue(
    encode({ event: 'message_end', status: 'complete', message_id: '9', revision: 4 }),
  );
  streamController.close();
  const result = await reading;
  assert.equal(result.text, '<html></html>');
  assert.equal(result.messageId, '9');
  assert.equal(result.conversationId, '4');
});
