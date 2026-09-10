import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as exifr from "exifr";
import { readGps } from "../src/recognize/exif.js";

const gps = readFileSync(new URL("./fixtures/gps.jpg", import.meta.url));
const nogps = readFileSync(new URL("./fixtures/nogps.jpg", import.meta.url));

test("readGps: extracts lat/lon from GPS EXIF", async () => {
  const r = await readGps(gps, { exifr });
  assert.ok(r);
  assert.ok(Math.abs(r.lat - 35.6586) < 0.01, `lat ${r.lat}`);
  assert.ok(Math.abs(r.lon - 139.7454) < 0.01, `lon ${r.lon}`);
});

test("readGps: returns null when there is no GPS", async () => {
  assert.equal(await readGps(nogps, { exifr }), null);
});
