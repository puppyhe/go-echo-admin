import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'vite';
import { legalAssets } from '../scripts/legalAssets.ts';

test('production build retains attribution and nested license text byte for byte', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gea-legal-build-')));
  try {
    await mkdir(join(root, 'LICENSES', 'nested'), { recursive: true });
    const assets = {
      LICENSE: 'MIT License\nProject contributors\n',
      'NOTICE.md': 'Third-party attribution\nretainmessage。\n',
      'LICENSES/Apache-2.0.txt': 'License text\r\nAll original terms remain.\r\n',
      'LICENSES/nested/additional.txt': 'Additional license\n',
    };
    await writeFile(join(root, 'index.html'), '<!doctype html><html><body>build</body></html>');
    await Promise.all(
      Object.entries(assets).map(([path, content]) => writeFile(join(root, path), content)),
    );
    await build({ root, configFile: false, logLevel: 'silent', plugins: [legalAssets(root)] });
    for (const [path, content] of Object.entries(assets)) {
      assert.deepEqual(await readFile(join(root, 'dist', path)), Buffer.from(content));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('production build fails when license files would be omitted', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gea-legal-missing-')));
  try {
    await mkdir(join(root, 'LICENSES'));
    await writeFile(join(root, 'NOTICE.md'), 'Attribution\n');
    await writeFile(join(root, 'index.html'), '<!doctype html><html><body>build</body></html>');
    await assert.rejects(
      build({ root, configFile: false, logLevel: 'silent', plugins: [legalAssets(root)] }),
      /LICENSES directory is empty/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
