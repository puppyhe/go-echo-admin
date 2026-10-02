import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detailParentOptions,
  detailPayload,
  dictionaryParentOptions,
  filterDetailTree,
  normalizeDetail,
} from '../src/pages/superAdmin/dictionary/model.ts';
const tree = [
  {
    ID: 1,
    label: '华东',
    value: 'east',
    children: [
      {
        ID: 2,
        label: '上海',
        value: '001',
        children: [{ ID: 3, label: '浦东', value: 'pudong', children: [] }],
      },
    ],
  },
  { ID: 4, label: '华北', value: 'north', children: [] },
];
test('dictionary search retains ancestors and parent choices exclude an edited subtree', () => {
  const matches = filterDetailTree(tree, '浦东');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].children[0].children[0].ID, 3);
  assert.deepEqual(
    detailParentOptions(tree, 2).map((node) => [node.value, node.children]),
    [
      [1, []],
      [4, []],
    ],
  );
  assert.equal(tree[0].children.length, 1, 'filtering must not mutate the source');
});
test('dictionary payloads preserve string codes and explicitly clear parents', () => {
  assert.deepEqual(
    detailPayload({ label: 'message', value: '001', parentID: 0, status: false, sort: 0 }, 8, 2),
    {
      ID: 2,
      sysDictionaryID: 8,
      parentID: null,
      label: 'message',
      value: '001',
      extend: '',
      status: false,
      sort: 0,
    },
  );
  assert.equal(normalizeDetail({ id: 4, value: 0, children: [] }).value, '0');
  assert.equal(normalizeDetail({ id: 4, value: '000', children: [] }).value, '000');
});
test('dictionary category parents exclude all descendants irrespective of list order', () => {
  const items = [{ ID: 3, parentID: 2 }, { ID: 2, parentID: 1 }, { ID: 1 }, { ID: 4 }];
  assert.deepEqual(
    dictionaryParentOptions(items, 1).map((node) => node.value),
    [4],
  );
});

test('dictionary option normalization, depth filtering and flattening retain disabled flags', async () => {
  const { normalizeTreeData, filterTreeByDepth, flattenTree } = await import(
    '../src/features/dictionary/useDictionary.ts'
  );
  const source = [
    {
      label: 'messagetype',
      value: 'old',
      extend: '',
      disabled: true,
      children: [{ label: 'message', value: '001', extend: '', disabled: true }],
    },
  ];
  const normalized = normalizeTreeData(source);
  assert.deepEqual(flattenTree(normalized), [
    { label: 'messagetype', value: 'old', disabled: true },
    { label: 'message', value: '001', disabled: true },
  ]);
  assert.deepEqual(flattenTree(filterTreeByDepth(normalized, 1, 1)), [
    { label: 'messagetype', value: 'old', disabled: true },
  ]);
});
