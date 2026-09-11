import { test } from "node:test";
import assert from "node:assert/strict";
import { gpsDuplicate, clusterByLocation, DUP_M } from "../src/recognize/dedup.js";

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
