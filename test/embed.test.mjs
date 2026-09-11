// test/embed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { embed } from "../src/recognize/embed.js";

// Fake ORT session: returns a fixed [1, N, 384] last_hidden_state so we exercise
// CLS extraction + L2 normalisation, without onnx or a real image.
function fakeSession(dim = 384) {
  return {
    inputNames: ["pixel_values"],
    outputNames: ["last_hidden_state"],
    async run() {
      const data = new Float32Array(1 * 5 * dim);
      for (let i = 0; i < dim; i++) data[i] = i + 1; // row 0 = CLS
      return { last_hidden_state: { data, dims: [1, 5, dim] } };
    },
  };
}

test("embed: returns an L2-normalised Float32Array of length 384", async () => {
  const v = await embed({ width: 224, height: 224 }, { session: fakeSession() });
  assert.equal(v.length, 384);
  const norm = Math.sqrt([...v].reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-5, `norm ${norm}`);
  // direction preserved: first component still the largest-ish for our ramp? row0 = 1..384
  assert.ok(v[383] > v[0]);
});
