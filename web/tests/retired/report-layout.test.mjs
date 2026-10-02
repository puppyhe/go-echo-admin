import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPage,
  pageCSS,
  reportRows,
  newAnalysis,
  dataBlock,
  reportDatasets,
} from '../src/pages/enterprise/reports/reportModel.ts';

test('messageA3/A4message，message', () => {
  assert.match(pageCSS(defaultPage()), /size:A4 portrait;margin:12mm 12mm 12mm 12mm/);
  assert.match(
    pageCSS({ ...defaultPage(), size: 'A3', orientation: 'landscape', marginLeft: 0 }),
    /size:A3 landscape.* 0mm/,
  );
  for (const patch of [
    { size: 'A4; } body { display:none' },
    { orientation: 'landscape; color:red' },
    { marginTop: NaN },
    { marginBottom: Infinity },
    { marginLeft: -1 },
    { marginRight: 51 },
  ])
    assert.throws(() => pageCSS({ ...defaultPage(), ...patch }), /label/);
});
test('message，messageeditsavemessage', () => {
  const blocks = [
    { id: 'a', width: 12 },
    { id: 'b', width: 12 },
    { id: 'c', width: 12 },
    { id: 'd', width: 12, pageBreakBefore: true },
    { id: 'e', width: 12 },
    { id: 'f', width: 24 },
  ];
  const before = JSON.stringify(blocks);
  assert.deepEqual(
    reportRows(blocks).map((row) => row.map((b) => b.id)),
    [['a', 'b'], ['c'], ['d', 'e'], ['f']],
  );
  assert.equal(JSON.stringify(blocks), before);
});
test('message，alldatamessageparametermessage', () => {
  const a = newAnalysis(),
    b = newAnalysis();
  a.metrics[0].alias = 'changed';
  assert.equal(b.metrics[0].alias, 'count');
  for (const kind of ['dataset', 'group', 'pivot', 'stat']) assert.equal(dataBlock(kind), true);
  for (const kind of ['heading', 'text']) assert.equal(dataBlock(kind), false);
});

test('messageeditmessagereleasedatamessage，messagereleasemessagedatamessage', () => {
  const items = [
    {
      id: 1,
      code: 'sales',
      publishedRevision: 2,
      columns: ['secretDraft'],
      source: 'draft',
      publishedDefinition: { columns: ['publicField'], source: 'live' },
    },
    { id: 2, code: 'new', publishedRevision: 0 },
    { id: 3, code: '', publishedRevision: 0 },
  ];
  const selected = reportDatasets(items);
  assert.deepEqual(
    selected.map((item) => item.id),
    [1, 3],
  );
  assert.deepEqual(selected[0].columns, ['publicField']);
  assert.equal(selected[0].source, 'live');
  assert.deepEqual(items[0].columns, ['secretDraft']);
});
