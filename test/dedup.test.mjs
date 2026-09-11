import { test } from "node:test";
import assert from "node:assert/strict";
import { gpsDuplicate, clusterByLocation, DUP_M, visualDuplicate, duplicateVerdict, clusterEntries, SIM_DUP } from "../src/recognize/dedup.js";

test("DUP_M is 15", () => assert.equal(DUP_M, 15));

test("gpsDuplicate: within DUP_M of a known cover", () => {
  const r = gpsDuplicate({ gps: { nearestCover: { id: "c1", name_en: "Cover 1", dist_m: 8 } } });
  assert.equal(r.duplicate, true);
  assert.equal(r.of.id, "c1");
});

test("gpsDuplicate: far away", () => {
  assert.equal(
    gpsDuplicate({ gps: { nearestCover: { id: "c1", name_en: "x", dist_m: 200 } } }).duplicate,
    false,
  );
});

test("gpsDuplicate: no gps", () => {
  assert.deepEqual(gpsDuplicate({ gps: null }), { duplicate: false, of: null });
});

test("clusterByLocation: two points ~10 m apart share a cluster, a third is separate", () => {
  const a = { lon: 139.7000, lat: 35.6800 };
  const b = { lon: 139.70011, lat: 35.6800 }; // ~10 m east
  const c = { lon: 135.5, lat: 34.7 };        // Osaka
  const out = clusterByLocation([a, b, c]);
  assert.equal(out[0].clusterId, out[1].clusterId);
  assert.notEqual(out[0].clusterId, out[2].clusterId);
});

test("clusterByLocation: entries without coords get singleton clusters", () => {
  const out = clusterByLocation([{}, {}]);
  assert.notEqual(out[0].clusterId, out[1].clusterId);
});

test("SIM_DUP is 0.93", () => assert.equal(SIM_DUP, 0.93));

test("visualDuplicate: strong similarity", () => {
  const r = visualDuplicate({ visual: { status: "ok", matches: [{ id: "c1", name_en: "C1", similarity: 0.96 }] } });
  assert.equal(r.duplicate, true);
  assert.equal(r.of.id, "c1");
});
test("visualDuplicate: weak similarity", () => {
  assert.equal(visualDuplicate({ visual: { status: "ok", matches: [{ similarity: 0.6 }] } }).duplicate, false);
});

test("duplicateVerdict: both signals → confirmed", () => {
  const v = duplicateVerdict({
    gps: { nearestCover: { id: "c1", name_en: "C1", dist_m: 6 } },
    visual: { status: "ok", matches: [{ id: "c1", name_en: "C1", similarity: 0.97 }] },
  });
  assert.equal(v.level, "confirmed");
  assert.equal(v.of.id, "c1");
  assert.equal(v.reasons.length, 2);
});
test("duplicateVerdict: gps only → likely", () => {
  assert.equal(duplicateVerdict({
    gps: { nearestCover: { id: "c1", name_en: "C1", dist_m: 6 } }, visual: null,
  }).level, "likely");
});
test("duplicateVerdict: neither → new", () => {
  assert.equal(duplicateVerdict({ gps: null, visual: null }).level, "new");
});

test("clusterEntries: merges two far-apart rows by embedding similarity", () => {
  const v = new Float32Array([1, 0, 0]);
  const near = new Float32Array([0.98, 0.02, 0]);
  const a = { lon: 139.7, lat: 35.68, vector: v };
  const b = { lon: 135.5, lat: 34.7, vector: near }; // 400 km away
  const out = clusterEntries([a, b]);
  assert.equal(out[0].clusterId, out[1].clusterId);
});

test("clusterEntries: two entries in same GPS cluster AND visually similar, no self-loop crash", () => {
  const v1 = new Float32Array([1, 0, 0]);
  const v2 = new Float32Array([0.98, 0.02, 0]); // cosine ~0.98 > 0.93
  const a = { lon: 139.7000, lat: 35.6800, vector: v1 };
  const b = { lon: 139.70011, lat: 35.6800, vector: v2 }; // ~10 m east, already same GPS cluster
  const out = clusterEntries([a, b]);
  assert.equal(out[0].clusterId, out[1].clusterId);
});

test("clusterEntries: three-entry chain (A~B, B~C, A and C not directly similar) → transitive closure", () => {
  const vA = new Float32Array([1, 0, 0]);
  const vB = new Float32Array([0.98, 0.02, 0]); // ~0.98 cosine with vA, > 0.93
  const vC = new Float32Array([0.85, 0.15, 0]); // ~0.85 cosine with vA (not > 0.93), but ~0.98 with vB
  const a = { lon: 139.7000, lat: 35.6800, vector: vA };
  const b = { lon: 135.5, lat: 34.7, vector: vB };       // far from A
  const c = { lon: 135.5001, lat: 34.7, vector: vC };    // close to B (same GPS cluster as B)
  const out = clusterEntries([a, b, c]);
  assert.equal(out[0].clusterId, out[1].clusterId);
  assert.equal(out[1].clusterId, out[2].clusterId);
  assert.equal(out[0].clusterId, out[2].clusterId);
});
