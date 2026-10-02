// documentationprojectdocumentation TypeScript documentationtest，documentationtestdocumentation。
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of ['', '.ts', '.tsx']) {
        const url = `${base.href}${suffix}`;
        if (/\.tsx?$/.test(url) && existsSync(fileURLToPath(url)))
          return { url, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.css'))
      return { format: 'module', shortCircuit: true, source: 'export default {};' };
    if (/\.tsx?$/.test(url)) {
      return {
        format: 'module',
        shortCircuit: true,
        source: ts
          .transpileModule(readFileSync(new URL(url), 'utf8'), {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
              jsx: ts.JsxEmit.ReactJSX,
            },
          })
          .outputText.replaceAll('import.meta.env', '({ DEV: false })'),
      };
    }
    return nextLoad(url, context);
  },
});
