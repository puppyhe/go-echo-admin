import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Include attribution and licenses in every production build, independent of public assets. */
export function legalAssets(projectRoot: string): Plugin {
  return {
    name: 'gea-legal-assets',
    apply: 'build',
    generateBundle() {
      const licenses: string[] = [];
      const visit = (directory: string) => {
        for (const entry of readdirSync(resolve(projectRoot, directory), { withFileTypes: true })) {
          const path = `${directory}/${entry.name}`;
          if (entry.isDirectory()) visit(path);
          else if (entry.isFile()) licenses.push(path);
        }
      };
      visit('LICENSES');
      if (!licenses.length) throw new Error('LICENSES directory is empty');
      for (const fileName of ['LICENSE', 'NOTICE.md', ...licenses.sort()]) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(resolve(projectRoot, fileName)),
        });
      }
    },
  };
}
