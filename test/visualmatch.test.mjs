import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEmbeddings, matchVisual } from "../src/recognize/visualmatch.js";

function norm(a) {
  const n = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  return a.map((x) => x / n);
}

test("matchVisual: ranks by cosine, best first, topK respected", () => {
  const dim = 3;
  const ids = ["a", "b", "c"];
  const rows = [norm([1, 0, 0]), norm([0.9, 0.1, 0]), norm([0, 1, 0])];
  const vectors = new Float32Array(dim * 3);
  rows.forEach((r, i) => vectors.set(r, i * dim));
  const q = new Float32Array(norm([1, 0, 0]));
  const out = matchVisual(q, { dim, ids, vectors }, { topK: 2 });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "a");
  assert.equal(out[1].id, "b");
  assert.ok(out[0].similarity > out[1].similarity);
  assert.ok(Math.abs(out[0].similarity - 1) < 1e-6);
});

test("loadEmbeddings: parses injected bin + index", async () => {
  const dim = 2;
  const ids = ["x", "y"];
  const f = new Float32Array([1, 0, 0, 1]);
  const data = await loadEmbeddings({ index: { dim, ids }, bin: f.buffer });
  assert.equal(data.dim, 2);
  assert.deepEqual(data.ids, ["x", "y"]);
  assert.equal(data.vectors.length, 4);
});

test("loadEmbeddings: size mismatch → null", async () => {
  const data = await loadEmbeddings({ index: { dim: 4, ids: ["x"] }, bin: new Float32Array([1, 2]).buffer });
  assert.equal(data, null);
});

test("loadEmbeddings: empty index → null", async () => {
  assert.equal(await loadEmbeddings({ index: { dim: 384, ids: [] }, bin: new ArrayBuffer(0) }), null);
});
