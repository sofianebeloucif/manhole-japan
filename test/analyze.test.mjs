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

test("analyze: runVisual with no deps → visual.status 'unavailable' or 'no_library', no throw", async () => {
  const r = await analyze(new Uint8Array(), { runOcr: false, runClassifier: false, runVisual: true },
    { prefFC, coversFC });
  assert.ok(["unavailable", "no_library"].includes(r.visual.status));
});
