import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNormalMap, unsharpMask } from "../src/reconstruct/pixels.js";

function solidImage(w, h, [r, g, b]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

test("buildNormalMap: a perfectly flat image points straight up (0.5, 0.5, 1.0 encoded)", () => {
  const img = solidImage(4, 4, [128, 128, 128]);
  const nm = buildNormalMap(img);
  // center pixel, away from the clamp-to-edge border effects
  const i = (2 * 4 + 2) * 4;
  assert.equal(nm.data[i], 128); // (0*0.5+0.5)*255 = 127.5, rounded by Uint8ClampedArray
  assert.equal(nm.data[i + 1], 128);
  assert.equal(nm.data[i + 2], 255);
});

test("buildNormalMap: a left-to-right brightness ramp tilts the normal's x component", () => {
  const w = 6, h = 6;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  const nm = buildNormalMap({ data, width: w, height: h }, 2.2);
  const centerIdx = (3 * w + 3) * 4;
  // Brightness increases with x, so the surface reads as tilting away in
  // +x, and the outward normal tilts toward -x: R channel should sit
  // below the neutral 127/128 midpoint.
  assert.ok(nm.data[centerIdx] < 120, `expected R well below neutral, got ${nm.data[centerIdx]}`);
});

test("unsharpMask: identical original/blurred input leaves the image unchanged", () => {
  const img = solidImage(2, 2, [50, 100, 200]);
  const out = unsharpMask(img, img, 1.4);
  assert.deepEqual([...out.data], [...img.data]);
});

test("unsharpMask: amplifies a pixel that's already brighter than its blurred neighbourhood", () => {
  const original = solidImage(1, 1, [200, 200, 200]);
  const blurred = solidImage(1, 1, [150, 150, 150]);
  const out = unsharpMask(original, blurred, 1.0);
  // 200 + 1.0*(200-150) = 250
  assert.equal(out.data[0], 250);
});

test("unsharpMask: clamps rather than wrapping when it overshoots 255", () => {
  const original = solidImage(1, 1, [240, 240, 240]);
  const blurred = solidImage(1, 1, [100, 100, 100]);
  const out = unsharpMask(original, blurred, 2.0);
  assert.equal(out.data[0], 255); // Uint8ClampedArray clamps, doesn't wrap
});
