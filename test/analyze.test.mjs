// test/analyze.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as exifr from "exifr";
import { analyze } from "../src/recognize/index.js";

const prefFC = JSON.parse(readFileSync(new URL("../data/prefectures.geojson", import.meta.url)));
const coversFC = JSON.parse(readFileSync(new URL("../data/covers.geojson", import.meta.url)));
const gps = readFileSync(new URL("./fixtures/gps.jpg", import.meta.url));
const nogps = readFileSync(new URL("./fixtures/nogps.jpg", import.meta.url));

test("analyze: GPS-tagged image → Tokyo, high confidence", async () => {
  const r = await analyze(gps, {}, { exifr, prefFC, coversFC });
  assert.equal(r.gps.prefecture_en, "Tokyo");
  assert.equal(r.combined.prefecture_en, "Tokyo");
  assert.equal(r.combined.confidence, "high");
});

test("analyze: no-GPS image → gps null, does not throw", async () => {
  const r = await analyze(nogps, {}, { exifr, prefFC, coversFC });
  assert.equal(r.gps, null);
  assert.equal(r.combined.prefecture_en, null);
});

test("analyze: runOcr with a failing OCR dep → ocr.status 'error', no throw", async () => {
  const failingOcr = async () => { throw new Error("no wasm in node"); };
  const r = await analyze(
    JSON.parse("null") ?? new Uint8Array(),
    { runOcr: true, runClassifier: false },
    { exifr, prefFC, coversFC, ocr: failingOcr },
  );
  assert.equal(r.ocr.status, "error");
});

test("analyze: injected OCR that yields a municipality feeds fuse", async () => {
  const ocr = async () => ({
    status: "ok",
    rawText: "京都市 おすい",
    tokens: ["京都市", "おすい"],
    municipalityGuesses: [{ name_ja: "京都市", name_en: "京都市", prefecture_en: "Kyoto", score: 1 }],
    confidence: 0.7,
  });
  const r = await analyze(new Uint8Array(), { runOcr: true, runClassifier: false }, { prefFC, coversFC, ocr });
  assert.equal(r.combined.prefecture_en, "Kyoto");
});

test("analyze: injected visual signal feeds fuse()", async () => {
  const visual = {
    status: "ok",
    matches: [{ id: "c1", name_en: "C1", prefecture_en: "Kyoto", similarity: 0.97 }],
    vector: null, confidence: 0.9,
  };
  const r = await analyze(new Uint8Array(), { runOcr: false, runClassifier: false, runVisual: true },
    { prefFC, coversFC, visual });
  assert.equal(r.visual.status, "ok");
  assert.equal(r.combined.prefecture_en, "Kyoto");        // no GPS/OCR → visual wins
});

test("analyze: runVisual with real embeddings+embed deps exercises the 'ok' enrichment path", async () => {
  // Real fixture id/name/prefecture taken from data/covers.geojson (first feature).
  const knownId = "pokefuta-osm-13998406913";
  const knownFeature = coversFC.features.find((f) => f.properties.id === knownId);
  assert.ok(knownFeature, "fixture id must exist in data/covers.geojson");

  // Small resolved-shape {dim, ids, vectors} embeddings index: two unit vectors,
  // orthogonal so cosine similarity (plain dot product here) is unambiguous.
  const embeddings = {
    dim: 3,
    ids: [knownId, "fixture-other-id"],
    vectors: new Float32Array([
      1, 0, 0, // knownId
      0, 1, 0, // fixture-other-id
    ]),
  };
  // Fake embed() returns a vector that matches knownId's embedding exactly.
  const embed = async () => new Float32Array([1, 0, 0]);

  const r = await analyze(
    new Uint8Array(),
    { runOcr: false, runClassifier: false, runVisual: true, keepVector: true },
    { prefFC, coversFC, embeddings, embed },
  );

  assert.equal(r.visual.status, "ok");
  assert.equal(r.visual.matches[0].id, knownId);
  assert.equal(r.visual.matches[0].name_en, knownFeature.properties.name_en);
  assert.equal(r.visual.matches[0].prefecture_en, knownFeature.properties.prefecture_en);
  assert.equal(typeof r.visual.confidence, "number");
  assert.ok(r.visual.confidence <= 0.9);
  assert.ok(r.visual.vector instanceof Float32Array);
  assert.notEqual(r.visual.vector, null);
});

test("analyze: runVisual with no deps → visual.status 'unavailable' or 'no_library', no throw", async () => {
  const r = await analyze(new Uint8Array(), { runOcr: false, runClassifier: false, runVisual: true },
    { prefFC, coversFC });
  assert.ok(["unavailable", "no_library"].includes(r.visual.status));
});

test("analyze: runVisual + keepVector with no reference library still computes a vector", async () => {
  // No deps.embeddings/index/bin → loadEmbeddings() resolves null. Previously
  // (before the fix) this meant `keepVector` was silently ignored and
  // vector stayed null even though a fake deps.embed was available.
  const embed = async () => new Float32Array([0.1, 0.2, 0.3]);
  const r = await analyze(
    new Uint8Array(),
    { runOcr: false, runClassifier: false, runVisual: true, keepVector: true },
    { prefFC, coversFC, embed },
  );
  assert.equal(r.visual.status, "no_library");
  assert.equal(r.visual.matches.length, 0);
  assert.ok(r.visual.vector instanceof Float32Array);
  assert.notEqual(r.visual.vector, null);
});

test("analyze: runVisual without keepVector and no library → vector stays null", async () => {
  const embed = async () => new Float32Array([0.1, 0.2, 0.3]);
  const r = await analyze(
    new Uint8Array(),
    { runOcr: false, runClassifier: false, runVisual: true },
    { prefFC, coversFC, embed },
  );
  assert.equal(r.visual.status, "no_library");
  assert.equal(r.visual.vector, null);
});

test("analyze: malformed deps.visual (no matches array) doesn't make analyze() throw", async () => {
  const visual = { status: "ok" }; // missing `matches` → fuse()'s visual.matches[0] would throw
  const r = await analyze(
    new Uint8Array(),
    { runOcr: false, runClassifier: false, runVisual: true },
    { prefFC, coversFC, visual },
  );
  assert.ok(r.combined);
  assert.equal(typeof r.combined.confidence, "string");
});
