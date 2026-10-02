import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outputSize } from '../src/pages/example/cropGeometry.ts';
import {
  editableImage,
  inspectImage,
  assertImageSize,
  processedSize,
  processedName,
  prepareImage,
  encodeImage,
  MAX_IMAGE_INPUT_BYTES,
  MAX_OUTPUT_PIXELS,
} from '../src/pages/example/imageProcessing.ts';
import {
  validateMobileSelection,
  validateMobileFile,
} from '../src/pages/example/mobileUpload/api.ts';
const png = readFileSync(new URL('../public/logo.png', import.meta.url));
const ticket = { status: 'active', remaining: 2, maxBytes: 1024, types: ['image'] };
function header(format, width, height, animated = false) {
  if (format === 'png') {
    const value = Buffer.from(png);
    value.writeUInt32BE(width, 16);
    value.writeUInt32BE(height, 20);
    if (!animated) return value;
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8);
    chunk.write('acTL', 4);
    return Buffer.concat([value.subarray(0, 33), chunk, value.subarray(33)]);
  }
  if (format === 'jpg') {
    const value = Buffer.from([255, 216, 255, 224, 0, 4, 0, 0, 255, 194, 0, 8, 8, 0, 0, 0, 0, 1]);
    value.writeUInt16BE(height, 13);
    value.writeUInt16BE(width, 15);
    return value;
  }
  const value = Buffer.alloc(30);
  value.write('RIFF');
  value.writeUInt32LE(22, 4);
  value.write('WEBPVP8X', 8);
  value.writeUInt32LE(10, 16);
  value[20] = animated ? 2 : 0;
  value.writeUIntLE(width - 1, 24, 3);
  value.writeUIntLE(height - 1, 27, 3);
  return value;
}
test('only JPEG/PNG/WebP edits are available; animated files and extension spoofing are rejected', () => {
  for (const [name, type] of [
    ['a.gif', 'image/gif'],
    ['a.pdf', 'application/pdf'],
    ['a.svg', 'image/svg+xml'],
    ['a.png', 'image/gif'],
  ])
    assert.equal(editableImage({ name, type }), false);
  for (const [format, mime] of [
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ]) {
    assert.equal(editableImage({ name: `a.${format}`, type: mime }), true);
    assert.deepEqual(inspectImage(header(format, 123, 456), `a.${format}`), {
      format: mime,
      size: { width: 123, height: 456 },
    });
  }
  assert.throws(() => inspectImage(png, 'a.jpg'), /message/);
  assert.throws(() => inspectImage(header('png', 1, 1, true), 'a.png'), /message PNG/);
  assert.throws(() => inspectImage(header('webp', 1, 1, true), 'a.webp'), /message WebP/);
  assert.throws(() => inspectImage(Buffer.from('GIF89a'), 'a.png'));
  const broken = header('webp', 12, 12);
  broken.writeUInt32LE(200, 16);
  assert.throws(() => inspectImage(broken, 'a.webp'), /message/);
});
test('input dimensions are checked before decode; limits resist oversized and non-finite dimensions', async () => {
  for (const size of [
    { width: 9000, height: 1 },
    { width: 8192, height: 8192 },
    { width: 0, height: 10 },
    { width: Infinity, height: 1 },
    { width: 1.1, height: 1 },
  ])
    assert.throws(() => assertImageSize(size));
  for (const ext of ['png', 'jpg', 'webp'])
    assert.throws(() => inspectImage(header(ext, 8192, 8192), `a.${ext}`), /message/);
  // No browser globals exist here: these errors must be returned before decoding/allocation.
  await assert.rejects(
    prepareImage(new File([header('png', 8192, 8192)], 'huge.png', { type: 'image/png' })),
    /label/,
  );
  await assert.rejects(
    prepareImage(
      new File([new Uint8Array(MAX_IMAGE_INPUT_BYTES + 1)], 'huge.png', { type: 'image/png' }),
    ),
    /20MB/,
  );
});
test('output uses explicit long side without upscaling and always fits the 16MP ticket backend cap', () => {
  assert.deepEqual(processedSize({ width: 6000, height: 4000 }, 1920), {
    width: 1920,
    height: 1280,
  });
  assert.deepEqual(processedSize({ width: 4096, height: 4096 }, 4096), {
    width: 4000,
    height: 4000,
  });
  assert.deepEqual(processedSize({ width: 320, height: 200 }, 1920), { width: 320, height: 200 });
  for (let width = 100; width <= 8100; width += 101)
    for (let height = 100; height <= 8100; height += 103) {
      const size = processedSize({ width, height }, 4096);
      assert.deepEqual(size, outputSize({ width, height }, Math.max(size.width, size.height)));
      assert.ok(
        size.width > 0 &&
          size.height > 0 &&
          size.width <= 4096 &&
          size.height <= 4096 &&
          size.width * size.height <= MAX_OUTPUT_PIXELS,
      );
    }
  for (const maximum of [0, -1, NaN, Infinity, 4097])
    assert.throws(() => processedSize({ width: 10, height: 10 }, maximum));
});
test('decoded dimensions and decode failures release their object URL', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;
  const revoked = [];
  let allocations = 0;
  let dimensions = { width: 10000, height: 10000 };
  let fail = false;
  URL.createObjectURL = () => 'blob:test-image';
  URL.revokeObjectURL = (value) => revoked.push(value);
  globalThis.window = {
    Image: class {
      get naturalWidth() {
        return dimensions.width;
      }
      get naturalHeight() {
        return dimensions.height;
      }
      async decode() {
        if (fail) throw new Error('decode failed');
      }
    },
  };
  globalThis.document = {
    createElement: () => {
      allocations++;
      return { getContext: () => ({ drawImage() {} }) };
    },
  };
  try {
    const file = new File([png], 'a.png', { type: 'image/png' });
    await assert.rejects(prepareImage(file), /label/);
    assert.equal(allocations, 0);
    fail = true;
    await assert.rejects(prepareImage(file), /decode failed/);
    fail = false;
    dimensions = { width: 200, height: 320 };
    const prepared = await prepareImage(file);
    assert.equal(prepared.image.width, 200);
    assert.equal(prepared.image.height, 320);
    assert.deepEqual(revoked, ['blob:test-image', 'blob:test-image', 'blob:test-image']);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  }
});
test('mobile selection allows an editable original above the ticket budget, but upload remains strictly bounded', () => {
  const original = { name: 'a.png', type: 'image/png', size: 2048 };
  validateMobileSelection(original, ticket);
  assert.throws(() => validateMobileFile(original, ticket));
  validateMobileFile({ ...original, size: 512 }, ticket);
  assert.throws(() =>
    validateMobileSelection({ ...original, size: MAX_IMAGE_INPUT_BYTES + 1 }, ticket),
  );
  for (const file of [
    { name: 'a.gif', type: 'image/gif', size: 2048 },
    { name: 'a.pdf', type: 'application/pdf', size: 2048 },
  ])
    assert.throws(() => validateMobileSelection(file, { ...ticket, types: ['image', 'pdf'] }));
  assert.throws(() => validateMobileSelection(original, { ...ticket, status: 'expired' }));
  assert.throws(() => validateMobileSelection(original, { ...ticket, types: ['pdf'] }));
});
test('processed names retain correct MIME extension and cannot introduce paths or oversized names', () => {
  assert.equal(processedName('image.jpeg', 'image/png'), 'image-edited.png');
  assert.equal(processedName('..\\evil/test.jpg', 'image/webp'), '--evil-test-edited.webp');
  assert.ok(Array.from(processedName('message'.repeat(200) + '.png', 'image/jpeg')).length < 180);
});
function fakeCanvas(blobResult) {
  const calls = [];
  const context = {
    scale() {},
    translate() {},
    rotate() {},
    drawImage() {
      calls.push('draw');
    },
    fillRect() {
      calls.push('white');
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback, format, quality) {
      calls.push({ width: this.width, height: this.height, format, quality });
      callback(typeof blobResult === 'function' ? blobResult(format) : blobResult);
    },
  };
  return { canvas, calls };
}
test('encoding honors selected format/quality and exact output bytes; temporary canvas is released', async () => {
  const old = globalThis.document;
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const { canvas, calls } = fakeCanvas((format) => new Blob([bytes], { type: format }));
  globalThis.document = { createElement: () => canvas };
  try {
    const file = await encodeImage(
      {
        image: { width: 6000, height: 4000 },
        file: new File(['original'], 'a.png'),
        format: 'image/png',
      },
      {
        crop: { x: 100, y: 200, width: 3000, height: 2000 },
        turns: 0,
        maximum: 1500,
        format: 'image/jpeg',
        quality: 0.62,
      },
    );
    assert.equal(file.type, 'image/jpeg');
    assert.equal(file.name, 'a-edited.jpg');
    assert.equal(file.size, bytes.length);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
    assert.deepEqual(calls, [
      'white',
      'draw',
      { width: 1500, height: 1000, format: 'image/jpeg', quality: 0.62 },
    ]);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  } finally {
    globalThis.document = old;
  }
});
test('encoding rejects unsupported fallback, null output, oversized bytes and out-of-bounds crops', async () => {
  const old = globalThis.document;
  const source = {
    image: { width: 4000, height: 4000 },
    file: new File(['x'], 'a.png'),
    format: 'image/png',
  };
  const options = {
    crop: { x: 0, y: 0, width: 4000, height: 4000 },
    turns: 0,
    maximum: 4096,
    format: 'image/webp',
    quality: 0.8,
  };
  try {
    for (const blob of [
      new Blob(['x'], { type: 'image/png' }),
      null,
      new Blob([new Uint8Array(MAX_IMAGE_INPUT_BYTES + 1)], { type: 'image/webp' }),
    ]) {
      const { canvas } = fakeCanvas(blob);
      globalThis.document = { createElement: () => canvas };
      await assert.rejects(encodeImage(source, options));
      assert.equal(canvas.width, 0);
      assert.equal(canvas.height, 0);
    }
    globalThis.document = {
      createElement: () => {
        throw new Error('must not allocate');
      },
    };
    await assert.rejects(encodeImage(source, { ...options, quality: 0 }), /label/);
    await assert.rejects(
      encodeImage(source, { ...options, crop: { ...options.crop, x: 1 } }),
      /label/,
    );
  } finally {
    globalThis.document = old;
  }
});
