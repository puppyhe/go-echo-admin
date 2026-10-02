import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(
  readFileSync(new URL('../src/pages/systemTools/formDesign.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
).outputText;
const { CONTROL_TYPES, parseDesign, validateDesign, generateReactForm, fieldRules, initialValues } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const designOf = () => ({
  version: 1,
  title: 'formconfiguration',
  layout: 'vertical',
  fields: CONTROL_TYPES.map((type, index) => ({
    id: `field-${index}`,
    type,
    name: `field${index}`,
    label: type,
    placeholder: 'Please entermessage',
    required: true,
    disabled: false,
    options: [
      { label: 'message', value: 'one' },
      { label: 'message', value: 'two' },
    ],
  })),
});

test('form JSON round-trip preserves all supported controls and regenerates unique editor identities', () => {
  const original = designOf();
  const parsed = parseDesign(JSON.stringify(original));
  assert.equal(parsed.fields.length, 12);
  assert.equal(validateDesign(parsed), null);
  assert.deepEqual(
    parsed.fields.map(({ id, ...field }) => field),
    original.fields.map(({ id, ...field }) => field),
  );
  assert.equal(new Set(parsed.fields.map((field) => field.id)).size, 12);
});

test('form import rejects executable types, unsafe names, duplicate fields and invalid options', () => {
  const invalid = (mutate) => {
    const design = designOf();
    mutate(design);
    assert.throws(() => parseDesign(JSON.stringify(design)));
  };
  invalid((design) => {
    design.fields[0].type = 'eval';
  });
  invalid((design) => {
    design.fields[0].name = '__proto__';
  });
  invalid((design) => {
    design.fields[0].name = 'constructor';
  });
  invalid((design) => {
    design.fields[1].name = design.fields[0].name;
  });
  invalid((design) => {
    design.fields[4].options = [
      { label: 'One', value: 'x' },
      { label: 'Two', value: 'x' },
    ];
  });
  invalid((design) => {
    design.fields[4].options = [{ label: 'One', value: {} }];
  });
  const design = designOf();
  design.fields[0].onChange = 'alert(document.cookie)';
  assert.equal(parseDesign(JSON.stringify(design)).fields[0].onChange, undefined);
});

test('preview and code export share required rules and boolean/array initial values', () => {
  const design = designOf();
  assert.equal(fieldRules(design.fields[0])[0].whitespace, true);
  assert.deepEqual(fieldRules(design.fields[6]), [
    { required: true, type: 'array', min: 1, message: '请为「checkbox」至少选择一个选项' },
  ]);
  assert.deepEqual(initialValues(design), { field6: [], field7: false });
  assert.match(generateReactForm(design), /valuePropName="checked"/);
});

test('generated React code typechecks with every control and special characters in labels/options', () => {
  const design = designOf();
  design.title = '"title" <script> \\ ${expression} \u2028';
  design.fields[0].label = 'message " message\nmessage </Form.Item>';
  design.fields[4].options[0].label = '"><script>alert(1)</script>';
  const generated = generateReactForm(design);
  const fileName = fileURLToPath(new URL('../__generated-form-test.tsx', import.meta.url));
  const options = {
    strict: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const originalSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === fileName
      ? ts.createSourceFile(name, generated, languageVersion, true, ts.ScriptKind.TSX)
      : originalSource(name, languageVersion, ...rest);
  const program = ts.createProgram([fileName], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    [],
  );
});
