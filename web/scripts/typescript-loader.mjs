/**
 * Minimal TypeScript ESM loader used by the test runner.
 *
 * `registerHooks` is only available in newer Node releases.  The project is
 * developed with Node 22, but using the loader API keeps `npm test` usable on
 * Node 18/19 as well (the versions commonly shipped by existing CI images).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const suffix of ['', '.ts', '.tsx']) {
      const url = `${base.href}${suffix}`;
      if (/\.tsx?$/.test(url) && existsSync(fileURLToPath(url))) {
        return { url, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', shortCircuit: true, source: 'export default {};' };
  }
  if (/\.tsx?$/.test(url)) {
    const source = ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText.replaceAll('import.meta.env', '({ DEV: false })');
    return { format: 'module', shortCircuit: true, source };
  }
  return nextLoad(url, context);
}
