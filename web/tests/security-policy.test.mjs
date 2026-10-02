import test from 'node:test';
import assert from 'node:assert/strict';
import {
  passwordError,
  passwordRuleText,
  securityPreset,
} from '../src/pages/systemTools/security/model.ts';

test('secure complexity defaults reject weak input and bcrypt truncation', () => {
  const rules = securityPreset(4).password;
  assert.match(passwordError('123456', rules), /密码至少需要/);
  assert.match(passwordError('message'.repeat(25), rules), /72/);
  assert.match(passwordError('   ', rules), /请输入密码/);
  assert.equal(securityPreset(4).version, 4);
  assert.equal(securityPreset(4).expiry.forceFirstLogin, true);
});
test('password feedback matches server unicode character and byte semantics', () => {
  const rules = {
    ...securityPreset(0).password,
    enabled: true,
    uppercase: true,
    lowercase: true,
    number: true,
    special: true,
  };
  for (const input of ['Abc1!', 'abcdefgh1!', 'ABCDEFGH1!', 'Abcdefgh!', 'Abcdefgh1'])
    assert.ok(passwordError(input, rules));
  assert.equal(passwordError('Äbcdefghij１!', rules), undefined);
  assert.equal(passwordError('Abcdefghij1!', rules), undefined);
  assert.match(passwordRuleText(rules), /大写字母/);
});

test('password-required response preserves token and directs active session into recovery', async () => {
  const { request, session } = await import('../src/api/request.ts');
  const memory = new Map([['token', 'restricted-session']]);
  const previous = {
    storage: globalThis.sessionStorage,
    fetch: globalThis.fetch,
    window: globalThis.window,
  };
  let redirected;
  globalThis.sessionStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  session.setToken('restricted-session');
  globalThis.window = {
    location: {
      pathname: '/dashboard',
      assign: (path) => {
        redirected = path;
      },
    },
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 428, msg: 'messageeditmessage' }), { status: 403 });
  try {
    await assert.rejects(request('/business'), (error) => error.code === 428);
    assert.equal(session.getToken(), 'restricted-session');
    assert.equal(redirected, '/login?passwordChange=1');
    redirected = undefined;
    globalThis.window.location.pathname = '/login';
    await assert.rejects(request('/business'), (error) => error.code === 428);
    assert.equal(redirected, undefined, 'recovery page must not redirect in a loop');
  } finally {
    globalThis.sessionStorage = previous.storage;
    globalThis.fetch = previous.fetch;
    globalThis.window = previous.window;
  }
});

test('random password generation satisfies long and all-category policies', async () => {
  const { generatePolicyPassword } = await import('../src/pages/systemTools/security/model.ts');
  const rules = {
    enabled: true,
    minLength: 64,
    uppercase: true,
    lowercase: true,
    number: true,
    special: true,
  };
  for (let attempt = 0; attempt < 20; attempt++) {
    const password = generatePolicyPassword(rules);
    assert.equal(password.length, 64);
    assert.equal(passwordError(password, rules), undefined);
  }
  assert.equal(generatePolicyPassword(securityPreset(0).password).length, 12);
});
