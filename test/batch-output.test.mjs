import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildFeatureArray } from "../src/contribute/output.js";

function schemaValidArray(jsonStr) {
  const py =
    "import json,sys,jsonschema;" +
    "s=json.load(open('scripts/schema.json'));" +
    "[jsonschema.validate(f,s) for f in json.load(sys.stdin)]";
  execFileSync("python3", ["-c", py], { input: jsonStr });
}

const base = {
  name_en: "X", prefecture_en: "Tokyo", themes: ["a"],
  photo_credit: "S", photo_license: "own-work",
  lon: 139.7, lat: 35.68,
};

test("buildFeatureArray: array of schema-valid Features", () => {
  const s = buildFeatureArray([
    { ...base, slug: "personal-tokyo-a-1a2b" },
    { ...base, name_en: "Y", slug: "personal-tokyo-b-3c4d" },
  ]);
  const arr = JSON.parse(s);
  assert.equal(arr.length, 2);
  assert.equal(arr[0].properties.id, "personal-tokyo-a-1a2b");
  schemaValidArray(s); // throws on invalid
});

test("buildFeatureArray: empty input → []", () => {
  assert.equal(buildFeatureArray([]), "[]");
});
