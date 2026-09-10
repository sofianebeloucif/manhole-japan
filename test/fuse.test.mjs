// test/fuse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fuse } from "../src/recognize/index.js";

test("fuse: GPS alone → high confidence, prefecture from GPS", () => {
  const c = fuse({
    gps: { prefecture_en: "Tokyo", nearestCover: { dist_m: 20 }, confidence: 0.95 },
    ocr: null,
    classifier: null,
  });
  assert.equal(c.prefecture_en, "Tokyo");
  assert.equal(c.confidence, "high");
  assert.deepEqual(c.basis, ["GPS"]);
});

test("fuse: GPS + OCR agree → basis notes the agreement", () => {
  const c = fuse({
    gps: { prefecture_en: "Kyoto", nearestCover: null, confidence: 0.95 },
    ocr: { status: "ok", municipalityGuesses: [{ name_en: "Kyoto", prefecture_en: "Kyoto", score: 0.8 }], confidence: 0.7 },
    classifier: null,
  });
  assert.equal(c.prefecture_en, "Kyoto");
  assert.equal(c.confidence, "high");
  assert.ok(c.basis.includes("OCR agrees"));
});

test("fuse: OCR only, strong → medium confidence", () => {
  const c = fuse({
    gps: null,
    ocr: { status: "ok", municipalityGuesses: [{ name_en: "Nara", prefecture_en: "Nara", score: 0.9 }], confidence: 0.65 },
    classifier: { status: "insufficient_data", predictions: [] },
  });
  assert.equal(c.prefecture_en, "Nara");
  assert.equal(c.confidence, "medium");
});

test("fuse: nothing usable → null / low", () => {
  const c = fuse({ gps: null, ocr: null, classifier: { status: "insufficient_data", predictions: [] } });
  assert.equal(c.prefecture_en, null);
  assert.equal(c.confidence, "low");
});

test("fuse: nearby cover with a municipality → combined.municipality is that municipality", () => {
  const c = fuse({
    gps: {
      prefecture_en: "Hokkaido",
      nearestCover: { id: "x", name_en: "Rowlet Lid", municipality: "Sapporo", dist_m: 20 },
      confidence: 0.95,
    },
    ocr: null,
    classifier: null,
  });
  assert.equal(c.municipality, "Sapporo");
});

test("fuse: nearby cover with municipality:null → combined.municipality is null (no design-name fallback)", () => {
  const c = fuse({
    gps: {
      prefecture_en: "Hokkaido",
      nearestCover: { id: "x", name_en: "Rowlet Lid", municipality: null, dist_m: 20 },
      confidence: 0.95,
    },
    ocr: null,
    classifier: null,
  });
  assert.equal(c.municipality, null);
});
