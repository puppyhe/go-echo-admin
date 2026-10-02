import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(
  readFileSync(new URL('../src/pages/example/cropGeometry.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
).outputText;
const { centeredCrop, clampCrop, resizeCrop, rotatedSize, normalizeTurns, outputSize, drawCrop } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('preset crop rectangles stay centered and inside portrait/landscape images', () => {
  for (const size of [
    { width: 6000, height: 4000 },
    { width: 4000, height: 6000 },
    { width: 64, height: 64 },
  ]) {
    for (const ratio of [null, 1, 16 / 9, 9 / 16, 4 / 3]) {
      const crop = centeredCrop(size, ratio);
      assert.ok(crop.width > 0 && crop.height > 0 && crop.x >= 0 && crop.y >= 0);
      near(crop.x * 2 + crop.width, size.width);
      near(crop.y * 2 + crop.height, size.height);
      if (ratio) near(crop.width / crop.height, ratio);
    }
  }
});

test('dragging and resizing cannot move the crop outside the image', () => {
  const size = { width: 400, height: 300 };
  assert.deepEqual(clampCrop({ x: -999, y: 999, width: 100, height: 120 }, size), {
    x: 0,
    y: 180,
    width: 100,
    height: 120,
  });
  const resized = resizeCrop({ x: 100, y: 50, width: 100, height: 100 }, 9999, 9999, size, 16 / 9);
  assert.ok(resized.x + resized.width <= size.width && resized.y + resized.height <= size.height);
  near(resized.width / resized.height, 16 / 9);
  assert.deepEqual(rotatedSize(size, -1), { width: 300, height: 400 });
  assert.deepEqual(rotatedSize(size, 2), size);
  assert.equal(normalizeTurns(-5), 3);
});

test('exports cap dimensions without upscaling or producing empty canvases', () => {
  assert.deepEqual(outputSize({ width: 8000, height: 4000 }), { width: 4096, height: 2048 });
  assert.deepEqual(outputSize({ width: 40, height: 60 }), { width: 40, height: 60 });
  assert.deepEqual(outputSize({ width: 1, height: 1 }), { width: 1, height: 1 });
});

// Minimal Canvas transform model; assertions below use expected source corner positions.
function canvasRecorder() {
  let matrix = [1, 0, 0, 1, 0, 0];
  let corners;
  const multiply = ([a, b, c, d, e, f]) => {
    const [A, B, C, D, E, F] = matrix;
    matrix = [
      A * a + C * b,
      B * a + D * b,
      A * c + C * d,
      B * c + D * d,
      A * e + C * f + E,
      B * e + D * f + F,
    ];
  };
  const project = (x, y) => [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
  const context = {
    scale: (x, y) => multiply([x, 0, 0, y, 0, 0]),
    translate: (x, y) => multiply([1, 0, 0, 1, x, y]),
    rotate: (angle) =>
      multiply([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]),
    fillRect() {},
    drawImage: (image, x, y) => {
      corners = [project(x, y), project(x + image.width, y + image.height)];
    },
  };
  return { width: 0, height: 0, getContext: () => context, corners: () => corners };
}

test('rotation maps source image corners correctly for all four orientations', () => {
  const image = { width: 6, height: 4 };
  const expected = [
    [
      [0, 0],
      [6, 4],
    ],
    [
      [4, 0],
      [0, 6],
    ],
    [
      [6, 4],
      [0, 0],
    ],
    [
      [0, 6],
      [4, 0],
    ],
  ];
  for (let turn = 0; turn < 4; turn++) {
    const canvas = canvasRecorder();
    const size = rotatedSize(image, turn);
    drawCrop(canvas, image, turn, { x: 0, y: 0, ...size });
    canvas
      .corners()
      .flat()
      .forEach((value, index) => near(value, expected[turn].flat()[index]));
  }
});

test('preview and final export show the same rotated source rectangle', () => {
  const image = { width: 6000, height: 4000 };
  const crop = { x: 1000, y: 2000, width: 2400, height: 3200 };
  const output = canvasRecorder();
  const preview = canvasRecorder();
  drawCrop(output, image, 1, crop, 4096);
  drawCrop(preview, image, 1, crop, 280);
  output.corners().forEach(([x, y], index) => {
    near(x / output.width, preview.corners()[index][0] / preview.width);
    near(y / output.height, preview.corners()[index][1] / preview.height);
  });
});
