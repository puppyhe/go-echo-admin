import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGraphHistory,
  recordGraph,
  finishGraphGroup,
  undoGraph,
  redoGraph,
  graphShortcut,
  GRAPH_HISTORY_STEPS,
  GRAPH_HISTORY_BYTES,
} from '../src/pages/enterprise/collab/graph/graphHistory.ts';
import {
  sequenceToGraph,
  moveNode,
  removeSelection,
} from '../src/pages/enterprise/collab/graph/graphModel.ts';
import {
  graphImage,
  graphRasterSize,
  escapeGraphText,
  graphPNG,
} from '../src/pages/enterprise/collab/graph/graphExport.ts';
const initial = () =>
  sequenceToGraph([{ id: 'review', name: 'approval', approverIds: [123456789], mode: 'all' }]);
test('one drag is one undo step; new edit after undo clears redo and history snapshots remain independent', () => {
  const original = initial();
  let state = createGraphHistory(original);
  original.nodes[0].name = 'mutated outside';
  assert.notEqual(state.present.nodes[0].name, 'mutated outside');
  const baseline = structuredClone(state.present);
  for (let i = 0; i < 80; i++)
    state = recordGraph(state, moveNode(state.present, 'approval_0', 100 + i, 200 + i), 'drag:1');
  state = finishGraphGroup(state);
  assert.equal(state.past.length, 1);
  const moved = structuredClone(state.present);
  state = undoGraph(state);
  assert.deepEqual(state.present, baseline);
  state = redoGraph(state);
  assert.deepEqual(state.present, moved);
  state = undoGraph(state);
  state = recordGraph(state, removeSelection(state.present, 'approval_0'));
  assert.equal(state.future.length, 0);
  assert.equal(state.present.edges.length, 0);
  state = undoGraph(state);
  assert.deepEqual(state.present, baseline);
});
test('separate gestures and explicit graph replacement retain their own steps, no-op edits do not create history', () => {
  let state = createGraphHistory(initial());
  const before = state;
  state = recordGraph(state, structuredClone(state.present), 'name');
  assert.equal(state, before);
  state = recordGraph(state, moveNode(state.present, 'approval_0', 101, 200), 'drag:1');
  state = finishGraphGroup(state);
  state = recordGraph(state, moveNode(state.present, 'approval_0', 102, 200), 'drag:2');
  const previous = structuredClone(state.present);
  state = recordGraph(state, sequenceToGraph([]));
  assert.equal(state.past.length, 3);
  assert.deepEqual(undoGraph(state).present, previous);
  const reset = createGraphHistory(sequenceToGraph([]));
  assert.equal(reset.past.length, 0);
  assert.equal(reset.future.length, 0);
});
test('history is bounded by step count and stored snapshot text budget', () => {
  let state = createGraphHistory(initial());
  for (let i = 0; i < 200; i++)
    state = recordGraph(state, moveNode(state.present, 'approval_0', i, 200));
  assert.equal(state.past.length, GRAPH_HISTORY_STEPS);
  const large = initial();
  large.nodes[0].name = 'n'.repeat(200000);
  state = createGraphHistory(large);
  for (let i = 0; i < 100; i++)
    state = recordGraph(state, moveNode(state.present, 'approval_0', i, 200));
  assert.ok(state.past.length < GRAPH_HISTORY_STEPS);
  assert.ok(
    [...state.past, state.present, ...state.future].reduce(
      (total, graph) => total + JSON.stringify(graph).length * 2,
      0,
    ) <= GRAPH_HISTORY_BYTES,
  );
});
test('keyboard undo/redo respects platform modifiers and leaves text editing native', () => {
  const key = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
  assert.equal(graphShortcut(key, false), 'undo');
  assert.equal(graphShortcut({ ...key, shiftKey: true }, false), 'redo');
  assert.equal(graphShortcut({ ...key, key: 'y' }, false), 'redo');
  assert.equal(graphShortcut({ ...key, ctrlKey: false, metaKey: true }, false), 'undo');
  assert.equal(graphShortcut(key, true), undefined);
  assert.equal(graphShortcut({ ...key, altKey: true }, false), undefined);
  assert.equal(graphShortcut({ ...key, ctrlKey: false }, false), undefined);
});
test('standalone graph image escapes text and includes only visible topology without executable or private payloads', () => {
  const graph = initial();
  graph.nodes[1].name = '<script>alert("x")</script>&';
  graph.nodes[1].condition = { field: 'secret', operator: 'eq', value: 'TOP_SECRET' };
  graph.nodes[1].ccUserIds = [987654321];
  const image = graphImage(graph);
  assert.match(image.svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(image.svg, /&lt;script&gt;/);
  assert.ok(!image.svg.includes('<script>'));
  assert.ok(!image.svg.includes('TOP_SECRET'));
  assert.ok(!image.svg.includes('123456789'));
  assert.ok(!image.svg.includes('987654321'));
  assert.ok(!/<(?:foreignObject|image)|\son\w+=|href=/.test(image.svg));
  assert.match(image.svg, /marker-end="url\(#graph-arrow\)"/);
  assert.match(image.svg, /<rect[^>]+fill="#f6f8fc"/);
  assert.equal(escapeGraphText('<&>"\'\u0000'), '&lt;&amp;&gt;&quot;&apos;');
});
test('exports reject malformed graphs and raster dimensions preserve aspect while honoring side/pixel limits', () => {
  for (const graph of [
    { version: 1, nodes: [], edges: [] },
    { ...initial(), nodes: [{ ...initial().nodes[0], x: Infinity }] },
    { ...initial(), edges: [{ id: 'x', source: 'missing', target: 'start' }] },
  ])
    assert.throws(() => graphImage(graph));
  assert.deepEqual(graphRasterSize(160, 100), { width: 160, height: 100 });
  assert.deepEqual(graphRasterSize(10000, 10000), { width: 4000, height: 4000 });
  const graph = initial();
  graph.nodes[0].x = 10000;
  graph.nodes[0].y = 10000;
  graph.nodes[2].x = 0;
  graph.nodes[2].y = 0;
  const image = graphImage(graph),
    size = graphRasterSize(image.width, image.height);
  assert.ok(size.width <= 4096 && size.height <= 4096 && size.width * size.height <= 16000000);
  assert.ok(image.svg.includes('viewBox="'));
  for (const dimensions of [
    [0, 1],
    [NaN, 1],
    [Infinity, 100],
  ])
    assert.throws(() => graphRasterSize(...dimensions));
});
test('PNG caps intrinsic SVG before decode, returns real encoder bytes and cleans URL/canvas on success or failure', async () => {
  const old = {
    window: globalThis.window,
    document: globalThis.document,
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };
  const blobs = [],
    revoked = [],
    drawn = [];
  let fail = false;
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => drawn.push(args.slice(1)) }),
    toBlob(callback) {
      callback(fail ? null : png);
    },
  };
  URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return 'blob:graph';
  };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.window = {
    Image: class {
      async decode() {}
    },
  };
  globalThis.document = { createElement: () => canvas };
  try {
    const image = {
      width: 10000,
      height: 10000,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="10000" viewBox="0 0 10000 10000"></svg>',
    };
    const actual = await graphPNG(image);
    assert.equal(actual, png);
    assert.match(await blobs[0].text(), /width="4000" height="4000"/);
    assert.deepEqual(drawn[0], [0, 0, 4000, 4000]);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
    fail = true;
    await assert.rejects(graphPNG(image), /PNG 编码失败/);
    assert.equal(canvas.width, 0);
    assert.deepEqual(revoked, ['blob:graph', 'blob:graph']);
  } finally {
    globalThis.window = old.window;
    globalThis.document = old.document;
    URL.createObjectURL = old.create;
    URL.revokeObjectURL = old.revoke;
  }
});
