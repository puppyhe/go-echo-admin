import './helpers/domEnvironment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, createRef, act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import CrudPage from '../src/features/crud/CrudPage.tsx';
import { MenuContext } from '../src/menu/context.ts';
import { buildIndex } from '../src/menu/menuPaths.ts';

globalThis.getComputedStyle = (element) => window.getComputedStyle(element);
const fields = [{ key: 'name', title: 'name', required: true }];
const buttons = { add: 'create', edit: 'update', delete: 'delete' };
const page = (rows) => ({ list: rows, total: rows.length, page: 1, pageSize: 10 });

async function mount(t, props, btns = {}) {
  const tree = [
    {
      ID: 1,
      path: 'products',
      name: 'products',
      component: 'business/product',
      meta: { title: 'message' },
      btns,
    },
  ];
  const index = buildIndex(tree);
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
  });
  await act(async () =>
    root.render(
      createElement(
        ConfigProvider,
        { theme: { token: { motion: false } } },
        createElement(
          App,
          {},
          createElement(
            MemoryRouter,
            { initialEntries: ['/products'] },
            createElement(
              MenuContext.Provider,
              { value: { tree, nodeByPath: index.nodeByPath, nameToNode: index.nameToNode } },
              createElement(CrudPage, { fields, rowKey: 'id', auth: buttons, ...props }),
            ),
          ),
        ),
      ),
    ),
  );
}

function button(text, container = document) {
  return [...container.querySelectorAll('button')].find(
    (node) => node.textContent.replace(/\s/g, '') === text,
  );
}
function visibleDialog() {
  const dialog = document.querySelector('[role="dialog"]');
  return dialog?.closest('.ant-modal-wrap')?.style.display === 'none' ? null : dialog;
}
async function click(node) {
  assert.ok(node, 'button exists');
  await act(async () => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  assert.fail(`UI did not settle: ${document.body.textContent}`);
}

test('CRUD hides ungranted write actions while preserving read-only rows', async (t) => {
  await mount(t, {
    list: async () => page([{ id: 42, name: 'Read-only product' }]),
    create: async () => {},
    updateById: async () => {},
    remove: async () => {},
  });
  assert.ok(
    [...document.querySelectorAll('tbody td')].some((cell) => cell.textContent === 'Read-only product'),
    'authorized rows remain readable without mutation buttons',
  );
  assert.equal(button('新建'), undefined);
  assert.equal(button('编辑'), undefined);
  assert.equal(button('删除'), undefined);
});

test('CRUD reload is explicit and editing uses fresh detail plus its configured primary key', async (t) => {
  const actionRef = createRef();
  let loads = 0;
  let detailID;
  let resolveDetail;
  const updates = [];
  await mount(
    t,
    {
      actionRef,
      list: async () => {
        loads++;
        return page([{ id: 42, name: 'listmessage' }]);
      },
      getDetail: (id) => {
        detailID = id;
        return new Promise((resolve) => {
          resolveDetail = resolve;
        });
      },
      updateById: async (id, values) => {
        updates.push({ id, values });
      },
    },
    { update: 1 },
  );
  assert.equal(loads, 1);
  await act(async () => actionRef.current.reload());
  assert.equal(loads, 2);
  await click(button('编辑'));
  assert.equal(detailID, 42);
  assert.equal(visibleDialog(), null);
  await act(async () => resolveDetail({ id: 42, name: 'messagedetails' }));
  await waitFor(() => document.querySelector('[role="dialog"] input')?.value === 'messagedetails');
  await click(document.querySelector('.ant-modal-footer .ant-btn-primary'));
  await waitFor(() => updates.length === 1);
  assert.deepEqual(updates[0], { id: 42, values: { name: 'messagedetails' } });
  assert.equal(loads, 3);
});

test('CRUD does not open a partial edit form when the detail request fails', async (t) => {
  await mount(
    t,
    {
      list: async () => page([{ id: 42, name: 'message' }]),
      getDetail: async () => {
        throw new Error('detail unavailable');
      },
      updateById: async () => assert.fail('must not save a partial record'),
    },
    { update: 1 },
  );
  await click(button('编辑'));
  assert.equal(visibleDialog(), null);
  assert.equal(button('编辑').disabled, false);
});

test('CRUD connects the modal form before first creation and resets it when reopened', async (t) => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => {
    errors.push(args.join(' '));
    originalError(...args);
  };
  t.after(() => {
    console.error = originalError;
  });
  await mount(
    t,
    {
      fields: [{ key: 'name', title: 'name', required: true, defaultValue: 'defaultname' }],
      list: async () => page([]),
      create: async () => {},
    },
    { create: 1 },
  );
  assert.ok(
    document.querySelector('[role="dialog"] form'),
    'form is already connected while hidden',
  );
  assert.equal(visibleDialog(), null);
  await click(button('新建'));
  const input = visibleDialog().querySelector('input');
  assert.equal(input.value, 'defaultname');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'messagesave');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(document.querySelector('.ant-modal-footer button:not(.ant-btn-primary)'));
  await click(button('新建'));
  assert.equal(visibleDialog().querySelector('input').value, 'defaultname');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  assert.equal(
    errors.some((message) => message.includes('useForm') && message.includes('not connected')),
    false,
  );
});

for (const amount of [0, 12.34]) {
  test(`CRUD submits required InputNumber ${amount} and numeric Select values`, async (t) => {
    const creates = [];
    await mount(
      t,
      {
        fields: [
          {
            key: 'priceYuan',
            title: 'message（message）',
            type: 'number',
            required: true,
            min: 0,
            precision: 2,
            defaultValue: 0,
          },
          {
            key: 'categoryId',
            title: 'category',
            type: 'select',
            required: true,
            defaultValue: 1,
            options: [{ label: 'defaultcategory', value: 1 }],
          },
        ],
        list: async () => page([]),
        create: async (values) => {
          creates.push(values);
        },
      },
      { create: 1 },
    );
    await click(button('新建'));
    const input = document.querySelector('[role="dialog"] input[role="spinbutton"]');
    assert.ok(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        input,
        String(amount),
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(input.value, String(amount));
    await click(document.querySelector('.ant-modal-footer .ant-btn-primary'));
    await waitFor(() => creates.length === 1);
    assert.deepEqual(creates[0], { priceYuan: amount, categoryId: 1 });
  });
}
