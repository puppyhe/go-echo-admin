import './helpers/domEnvironment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import RootApp from '../src/App.tsx';
import '../src/pages/login/LoginPage.tsx';
import { session } from '../src/api/session.ts';

const tenant = { id: '1234567890abcdef1234567890abcdef', code: 'acme', name: 'Acme' };
const envelope = (data, status = 200) =>
  new Response(JSON.stringify({ code: 0, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
test('an expired restored session cannot leave the anonymous login captcha loading forever', async (t) => {
  const originalFetch = globalThis.fetch;
  sessionStorage.clear();
  window.history.replaceState(null, '', '/login?tenant=acme');
  session.start(
    'expired-test-token',
    { ID: 1, nickName: 'admin', headerImg: '', authorityId: 888 },
    tenant,
  );
  const calls = [];
  const captchaReplies = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/tenancy/info') return envelope({ enabled: true });
    if (String(url).includes('/tenancy/resolve')) return envelope(tenant);
    if (url === '/api/base/captcha') return new Promise((resolve) => captchaReplies.push(resolve));
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify({ code: 1, msg: 'sign inmessage' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  };
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    session.selectTenant(null);
  });
  await act(async () =>
    root.render(createElement(App, {}, createElement(BrowserRouter, {}, createElement(RootApp)))),
  );
  await waitFor(() => captchaReplies.length === 2);
  await act(async () =>
    captchaReplies[0](
      envelope({
        captchaId: 'expired-captcha',
        openCaptcha: true,
        picPath: '/expired-captcha.png',
        captchaLength: 6,
      }),
    ),
  );
  assert.equal(
    document.querySelector('button.login-submit').classList.contains('ant-btn-loading'),
    true,
  );
  assert.equal(document.querySelector('img[alt="验证码"]'), null);
  await act(async () =>
    captchaReplies[1](
      envelope({
        captchaId: 'fresh-captcha',
        openCaptcha: true,
        picPath: '/fresh-captcha.png',
        captchaLength: 6,
      }),
    ),
  );
  await waitFor(
    () =>
      document.querySelector('button.login-submit') &&
      !document.querySelector('button.login-submit').classList.contains('ant-btn-loading'),
  );
  assert.equal(session.getToken(), '');
  assert.equal(document.querySelector('button.login-submit').disabled, false);
  assert.equal(
    document.querySelector('img[alt="验证码"]').getAttribute('src'),
    '/fresh-captcha.png',
  );
  assert.equal(
    calls.filter((call) => call.url === '/api/base/captcha').at(-1).options.headers['x-tenant-id'],
    'acme',
  );
});
async function waitFor(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  assert.fail(`UI did not settle: ${document.body.textContent}`);
}
async function enterCode(code) {
  await act(async () => {
    const input = document.querySelector('input#code');
    assert.ok(input, 'tenant selection input exists');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    document
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await waitFor(() =>
    code === 'missing'
      ? [...document.querySelectorAll('button')].some(
          (button) =>
            button.textContent === '继 续' && !button.classList.contains('ant-btn-loading'),
        )
      : document.querySelector('button.login-submit') &&
        !document.querySelector('button.login-submit').classList.contains('ant-btn-loading'),
  );
}
test('manual tenant selection after a rejected code fetches captcha and enables password login', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  sessionStorage.clear();
  window.history.replaceState(null, '', '/login');
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (url === '/api/tenancy/info') return envelope({ enabled: true });
    if (String(url).includes('/tenancy/resolve')) {
      if (String(url).includes('missing'))
        return new Response(JSON.stringify({ code: 1, msg: 'message' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      return envelope(tenant);
    }
    if (url === '/api/base/captcha')
      return envelope({
        captchaId: 'captcha-acme',
        openCaptcha: false,
        picPath: '',
        captchaLength: 6,
      });
    throw new Error(`Unexpected request ${url}`);
  };
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    session.selectTenant(null);
  });
  await act(async () =>
    root.render(createElement(App, {}, createElement(BrowserRouter, {}, createElement(RootApp)))),
  );
  await waitFor(() => document.querySelector('input#code'));
  await enterCode('missing');
  assert.ok(document.body.textContent.includes('租户不可用')); 
  await enterCode('acme');
  assert.equal(session.getTenant()?.code, 'acme');
  assert.equal(calls.filter((call) => call.url === '/api/base/captcha').length, 1);
  assert.equal(document.querySelector('input[aria-label="用户名"]').value, 'admin');
  const login = document.querySelector('button.login-submit');
  assert.ok(login);
  assert.equal(login.disabled, false);
  assert.equal(login.classList.contains('ant-btn-loading'), false);
  await act(async () => {
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent.includes('切换租户'))
      .click();
  });
  await enterCode('missing');
  assert.ok(document.querySelector('input#code'));
  await enterCode('acme');
  assert.equal(calls.filter((call) => call.url === '/api/base/captcha').length, 2);
  assert.equal(document.querySelector('button.login-submit').disabled, false);
  assert.equal(
    document.querySelector('button.login-submit').classList.contains('ant-btn-loading'),
    false,
  );
});
