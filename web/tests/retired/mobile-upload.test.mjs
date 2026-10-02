import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ticketURL,
  ticketFromFragment,
  ticketAccept,
  validateMobileFile,
  uploadRequestID,
  mobileApi,
} from '../src/pages/example/mobileUpload/api.ts';
const token = 'A'.repeat(43);
const info = {
  id: 1,
  status: 'active',
  expiresAt: '2026-09-13T12:00:00Z',
  serverTime: '2026-09-13T11:50:00Z',
  maxFiles: 2,
  usedCount: 0,
  remaining: 2,
  maxBytes: 1048576,
  types: ['image'],
  category: 'message',
};

test('messagefragment，messageconfigurationmessageorigin', () => {
  const href = ticketURL(
    { token, uploadPath: '/mobile-upload', publicBaseUrl: '' },
    'http://localhost:5173',
  );
  const parsed = new URL(href);
  assert.equal(parsed.origin, 'http://localhost:5173');
  assert.equal(parsed.pathname, '/mobile-upload');
  assert.equal(parsed.search, '');
  assert.equal(ticketFromFragment(parsed.hash), token);
  assert.equal(
    new URL(
      ticketURL(
        { token, uploadPath: '/mobile-upload', publicBaseUrl: 'https://admin.example' },
        'http://localhost:5173',
      ),
    ).origin,
    'https://admin.example',
  );
  for (const publicBaseUrl of [
    'javascript:alert(1)',
    'https://user:secret@admin.example',
    'https://admin.example/path',
    'https://admin.example?x=1',
  ])
    assert.throws(() =>
      ticketURL({ token, uploadPath: '/mobile-upload', publicBaseUrl }, 'http://localhost:5173'),
    );
  assert.throws(() =>
    ticketURL(
      { token, uploadPath: 'https://evil.example', publicBaseUrl: '' },
      'http://localhost:5173',
    ),
  );
  for (const fragment of ['', '#ticket=short', '#ticket=' + token + '%0A'])
    assert.throws(() => ticketFromFragment(fragment));
});
test('messagetypemessage，defaultmessagePDFmessageSVG', () => {
  assert.equal(ticketAccept(['image']), '.jpg,.jpeg,.png,.gif,.webp');
  assert.equal(ticketAccept(['pdf']), '.pdf');
  validateMobileFile({ name: 'message.png', type: 'image/png', size: 123 }, info);
  for (const file of [
    { name: 'a.pdf', size: 100 },
    { name: 'a.svg', size: 100 },
    { name: '../a.png', size: 100 },
    { name: 'a.png', size: 1048577 },
    { name: 'a.png', size: 0 },
  ])
    assert.throws(() => validateMobileFile(file, info));
  assert.throws(() =>
    validateMobileFile({ name: 'a.png', size: 100 }, { ...info, status: 'expired' }),
  );
  assert.throws(() => validateMobileFile({ name: 'a.png', size: 100 }, { ...info, remaining: 0 }));
});
test('messageHTTPmessageUUIDmessagerandomUUID', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const id = uploadRequestID();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    seen.add(id);
  }
  assert.equal(seen.size, 100);
});
test('messagepublicrequestmessagesign intoken、Cookiemessage，retryretainmessageID', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ code: 0, data: info }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await mobileApi.info(token);
    const file = new File(['png'], 'a.png', { type: 'image/png' });
    const id = uploadRequestID();
    await mobileApi.upload(token, file, id);
    await mobileApi.upload(token, file, id);
    for (const { url, options } of calls) {
      assert.equal(new URL(url, 'https://app.example').search, '');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['X-Upload-Ticket'], token);
      for (const h of ['x-token', 'Authorization', 'Cookie', 'x-user-id'])
        assert.equal(options.headers[h], undefined);
    }
    assert.equal(calls[1].options.headers['X-Upload-Request'], id);
    assert.equal(calls[2].options.headers['X-Upload-Request'], id);
    assert.deepEqual([...calls[1].options.body.keys()], ['file']);
  } finally {
    globalThis.fetch = previous;
  }
});
