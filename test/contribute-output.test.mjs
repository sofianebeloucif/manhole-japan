import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildFeature, photoCreditsRow, prSteps, zipWebps } from "../src/contribute/output.js";

function schemaValid(obj) {
  const py = `import json,sys,jsonschema; jsonschema.validate(json.load(sys.stdin), json.load(open("scripts/schema.json")))`;
  execFileSync("python3", ["-c", py], { input: JSON.stringify(obj) });
}

const input = {
  name_en: "Shinjuku ward flower design",
  name_ja: "新宿区 花のデザイン",
  prefecture_en: "Tokyo",
  municipality: "Shinjuku, Tokyo",
  themes: ["flowers"],
  installed: "2019",
  photo_credit: "Sofiane Beloucif",
  photo_license: "own-work",
  lon: 139.7004,
  lat: 35.6902,
  slug: "personal-tokyo-shinjuku-ward-flower-design-1a2b",
};

test("buildFeature: produces schema-valid Feature", () => {
  const f = buildFeature(input);
  assert.equal(f.type, "Feature");
  assert.equal(f.properties.id, input.slug);
  assert.equal(f.properties.category, "personal");
  assert.equal(f.properties.photo, `assets/photos/${input.slug}.webp`);
  assert.deepEqual(f.geometry.coordinates, [139.7004, 35.6902]);
  schemaValid(f); // throws on invalid
});

test("buildFeature: missing optionals become null", () => {
  const f = buildFeature({ ...input, name_ja: undefined, installed: undefined, municipality: undefined });
  assert.equal(f.properties.name_ja, null);
  assert.equal(f.properties.installed, null);
  assert.equal(f.properties.municipality, null);
  schemaValid(f);
});

test("photoCreditsRow: markdown row", () => {
  const row = photoCreditsRow(input);
  assert.match(row, /^\| personal-tokyo-.*\.webp \| .*\| Sofiane Beloucif \| own-work \|/);
});

test("prSteps: mentions the two files and the data command", () => {
  const s = prSteps(input.slug);
  assert.match(s, /assets\/photos\/personal-tokyo-.*\.webp/);
  assert.match(s, /data\/personal\/mine\.json/);
  assert.match(s, /npm run data/);
});

test("zipWebps: resolves to a zip Blob using an injected fflate dep", async () => {
  const fakeFflate = {
    zip(zipInput, opts, cb) {
      assert.ok(zipInput["a.webp"] instanceof Uint8Array);
      assert.equal(opts.level, 6);
      cb(null, new Uint8Array([1, 2, 3]));
    },
  };
  const blob = await zipWebps(
    [{ name: "a.webp", blob: new Blob([new Uint8Array([9, 9, 9])]) }],
    { fflate: fakeFflate },
  );
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, "application/zip");
});

test("zipWebps: rejects when the injected fflate dep calls back with an error", async () => {
  const boom = new Error("zip failed");
  const fakeFflate = { zip(zipInput, opts, cb) { cb(boom, null); } };
  await assert.rejects(
    zipWebps([{ name: "a.webp", blob: new Blob([new Uint8Array([9])]) }], { fflate: fakeFflate }),
    (err) => err === boom,
  );
});
