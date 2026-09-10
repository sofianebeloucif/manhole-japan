import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pointInPolygon, pointInMultiPolygon, resolvePrefecture, haversine, nearestCover,
} from "../src/geo.js";

const prefFC = JSON.parse(readFileSync(new URL("../data/prefectures.geojson", import.meta.url)));
const coversFC = JSON.parse(readFileSync(new URL("../data/covers.geojson", import.meta.url)));

test("pointInPolygon: inside and outside a unit square", () => {
  const sq = [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]];
  assert.equal(pointInPolygon(1, 1, sq), true);
  assert.equal(pointInPolygon(3, 1, sq), false);
});

test("pointInPolygon: hole", () => {
  const withHole = [
    [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
    [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]],
  ];
  assert.equal(pointInPolygon(1, 1, withHole), true);
  assert.equal(pointInPolygon(5, 5, withHole), false);
});

test("pointInMultiPolygon: any part counts", () => {
  const mp = [
    [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    [[[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]]],
  ];
  assert.equal(pointInMultiPolygon(10.5, 10.5, mp), true);
  assert.equal(pointInMultiPolygon(5, 5, mp), false);
});

test("haversine: Tokyo Station to Osaka Station ≈ 400 km", () => {
  const d = haversine([139.767, 35.681], [135.498, 34.702]);
  assert.ok(Math.abs(d - 400000) < 30000, `got ${d}`);
});

test("resolvePrefecture: Tokyo Tower is exactly in Tokyo", () => {
  const r = resolvePrefecture(139.7454, 35.6586, prefFC);
  assert.equal(r.prefecture_en, "Tokyo");
  assert.equal(r.exact, true);
});

test("resolvePrefecture: a point just off the Okinawa coast snaps to Okinawa", () => {
  const r = resolvePrefecture(127.9, 26.2, prefFC);
  assert.equal(r.prefecture_en, "Okinawa");
});

test("nearestCover: returns the closest feature with a distance", () => {
  const f0 = coversFC.features[0];
  const [lon, lat] = f0.geometry.coordinates;
  const got = nearestCover(lon + 0.0005, lat, coversFC);
  assert.equal(got.feature.properties.id, f0.properties.id);
  assert.ok(got.dist_m < 100);
});
