import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.ts';

test('development API proxy preserves the browser Host for cookie CSRF checks', () => {
  const resolved = config({ command: 'serve', mode: 'test' });
  const apiProxy = resolved.server.proxy['/api'];

  assert.equal(apiProxy.changeOrigin, false);
  assert.ok(apiProxy.target);
  assert.equal(apiProxy.rewrite('/api/menu/getMenu'), '/menu/getMenu');
});
