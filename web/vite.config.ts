import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { legalAssets } from './scripts/legalAssets';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    cacheDir: command === 'serve' ? `node_modules/.vite/dev-${process.pid}` : undefined,
    plugins: [react(), legalAssets(fileURLToPath(new URL('.', import.meta.url)))],
    build: {
      rollupOptions: {
        output: {
          // Keep explicit vendor groups independent. `onlyExplicitManualChunks`
          // avoids Rollup hoisting shared rc-* dependencies into an eager antd
          // chunk and lets the selected leaf groups stay acyclic.
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return;
            if (id.includes('/node_modules/echarts/')) return 'charts';
            if (id.includes('/node_modules/zrender/')) return 'chart-renderer';
            const antdComponent = id.match(
              /\/node_modules\/antd\/es\/([^/]+)\//,
            );
            // These leaf components have no back-edge into the shared antd
            // graph. Keeping them separate brings the residual vendor chunk
            // below 500 kB without introducing circular preload warnings.
            const splitAntdComponents = new Set([
              'table',
              'result',
              'steps',
              'badge',
              'avatar',
              'card',
              'breadcrumb',
              'descriptions',
              'drawer',
              'flex',
              'image',
              'layout',
              'list',
              'mentions',
              'popconfirm',
              'rate',
              'splitter',
              'switch',
              'tag',
              'upload',
              'cascader',
              'typography',
            ]);
            if (antdComponent && splitAntdComponents.has(antdComponent[1])) {
              return `antd-${antdComponent[1]}`;
            }
            const packageMatch = id.match(
              /\/node_modules\/(antd|rc-[^/]+|@ant-design\/icons)\//,
            );
            if (packageMatch) return `vendor-${packageMatch[1].replace('/', '-')}`;
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: false,
          // Keep the versioned API namespace for the Echo server. Legacy reference
          // endpoints retain the old /api -> / path mapping for compatibility.
          rewrite: (path) => path.startsWith('/api/v1') || path.startsWith('/api/platform') || path.startsWith('/api/tenancy') ? path : path.replace(/^\/api/, ''),
        },
        '/health': {
          target: env.VITE_API_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: false,
        },
        '/version': {
          target: env.VITE_API_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: false,
        },
      },
    },
  };
});
