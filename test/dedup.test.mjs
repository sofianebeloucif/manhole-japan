import { test } from "node:test";
import assert from "node:assert/strict";
import { gpsDuplicate, clusterByLocation, DUP_M, visualDuplicate, duplicateVerdict, clusterEntries, SIM_DUP } from "../src/recognize/dedup.js";

function norm(a) {
  const n = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  return a.map((x) => x / n);
}

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
test("duplicateVerdict: both signals fire but against different covers → likely, not confirmed", () => {
  const v = duplicateVerdict({
    gps: { nearestCover: { id: "c1", name_en: "C1", dist_m: 8 } },
    visual: { status: "ok", matches: [{ id: "c2", name_en: "C2", similarity: 0.97 }] },
  });
  assert.equal(v.level, "likely");
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
  const near = new Float32Array([0.98, 0.02, 0]); // dot product (vectors pre-normalized) = 0.98 > 0.93
  const a = { lon: 139.7, lat: 35.68, vector: v };
  const b = { lon: 135.5, lat: 34.7, vector: near }; // 400 km away
  const out = clusterEntries([a, b]);
  assert.equal(out[0].clusterId, out[1].clusterId);
});

test("clusterEntries: two entries in same GPS cluster AND visually similar, no self-loop crash", () => {
  const v1 = new Float32Array([1, 0, 0]);
  const v2 = new Float32Array([0.98, 0.02, 0]); // dot product (vectors pre-normalized) = 0.98 > 0.93
  const a = { lon: 139.7000, lat: 35.6800, vector: v1 };
  const b = { lon: 139.70011, lat: 35.6800, vector: v2 }; // ~10 m east, already same GPS cluster
  const out = clusterEntries([a, b]);
  assert.equal(out[0].clusterId, out[1].clusterId);
});

test("clusterEntries: does not drop a union edge when a shared clusterId is the 'from' side of two merges", () => {
  // x1 and x2 are in different clusters, far apart. p1 and p2 are GPS-close (same pass-1 cluster).
  // p1 is visually similar to x1; p2 is visually similar to x2; p1 and p2 are not visually similar.
  // This test verifies the fix to the bug where rep[from]=to would overwrite
  // an earlier write with the same 'from' key, dropping a union edge.
  // Under the old buggy code, when both p1~x1 and p2~x2 edges fire,
  // the second write rep[C_p] = C_x2 overwrites rep[C_p] = C_x1, leaving x1 isolated.
  const x1 = { lon: 139.70, lat: 35.68, vector: new Float32Array(norm([1, 0, 0])) };    // own cluster
  const x2 = { lon: 100.0, lat: 10.0, vector: new Float32Array(norm([0, 1, 0])) };      // different cluster, far away
  const p1 = { lon: 135.5, lat: 34.7, vector: new Float32Array(norm([0.95, 0.312, 0])) };   // dot(x1, p1) ≈ 0.95 > 0.93
  const p2 = { lon: 135.50001, lat: 34.70001, vector: new Float32Array(norm([0.312, 0.95, 0])) }; // dot(x2, p2) ≈ 0.95 > 0.93, close to p1 (same GPS cluster)
  const out = clusterEntries([x1, x2, p1, p2]);
  const ids = new Set(out.map((e) => e.clusterId));
  assert.equal(ids.size, 1, "all four entries should collapse into one cluster via transitive similarity");
});
