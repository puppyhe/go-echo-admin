import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAttachments } from '../src/pages/plugin/announcement/attachments.ts';
import { safeRichUrl } from '../src/pages/plugin/announcement/richText.tsx';

test('announcement attachments accept reference arrays and legacy JSON strings', () => {
  const files = [
    {
      uid: 7,
      name: 'projectmessage.pdf',
      url: '/uploads/plan.pdf',
      status: 'done',
      response: { token: 'not-persisted' },
    },
  ];
  const expected = [{ uid: 7, name: 'projectmessage.pdf', url: '/uploads/plan.pdf' }];
  assert.deepEqual(normalizeAttachments(files), expected);
  assert.deepEqual(normalizeAttachments(JSON.stringify(files)), expected);
  assert.deepEqual(normalizeAttachments(''), []);
  assert.deepEqual(normalizeAttachments('[invalid'), []);
  assert.deepEqual(normalizeAttachments({ files }), []);
});

test('announcement attachment conversion removes executable URLs and deduplicates files', () => {
  assert.deepEqual(
    normalizeAttachments([
      { name: 'a', url: 'javascript:alert(1)' },
      { name: 'b', url: 'data:text/html,script' },
      { name: 'c', url: 'vbscript:msgbox(1)' },
      { name: 'd', url: '//untrusted.test/a' },
      { name: 'valid', url: '/uploads/a.pdf' },
      { name: 'renamed', url: '/uploads/a.pdf' },
      null,
    ]),
    [{ name: 'renamed', url: '/uploads/a.pdf' }],
  );
});

test('rich text links reject control characters, executable and transient URL schemes', () => {
  for (const url of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'blob:https://example.com/a',
    'file:///etc/passwd',
    '//example.com',
    '\\example.com',
    'https://example.com/\u0000',
  ]) {
    assert.equal(safeRichUrl(url), undefined, url);
    assert.equal(safeRichUrl(url, true), undefined, url);
  }
  for (const url of [
    '/uploads/test.png',
    'uploads/test.png',
    'https://example.com/file.pdf',
    'http://localhost/file',
  ])
    assert.equal(safeRichUrl(url, true), url);
  assert.equal(safeRichUrl('mailto:admin@example.com'), 'mailto:admin@example.com');
  assert.equal(safeRichUrl('mailto:admin@example.com', true), undefined);
});
