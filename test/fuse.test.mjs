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

test("fuse: visual agrees with GPS prefecture → bumps confidence + basis", () => {
  const c = fuse({
    gps: { prefecture_en: "Nara", nearestCover: null, confidence: 0.95 },
    ocr: null,
    classifier: null,
    visual: { status: "ok", matches: [{ prefecture_en: "Nara", similarity: 0.9 }], confidence: 0.9 },
  });
  assert.equal(c.prefecture_en, "Nara");
  assert.ok(c.basis.includes("visual match agrees"));
});

test("fuse: visual agreement below the 0.85 floor does not add basis or change level", () => {
  const c = fuse({
    gps: null,
    ocr: { status: "ok", municipalityGuesses: [{ name_en: "Nara", prefecture_en: "Nara", score: 0.9 }], confidence: 0.5 },
    classifier: null,
    visual: { status: "ok", matches: [{ prefecture_en: "Nara", similarity: 0.5 }], confidence: 0.5 },
  });
  // OCR alone (score 0.9 >= 0.4, confidence 0.5 < 0.6) sets level "low".
  assert.equal(c.confidence, "low");
  assert.ok(!c.basis.includes("visual match agrees"));
});

test("fuse: visual agrees strongly when level was low → bumps one level to medium, not straight to high", () => {
  const c = fuse({
    gps: null,
    ocr: { status: "ok", municipalityGuesses: [{ name_en: "Nara", prefecture_en: "Nara", score: 0.9 }], confidence: 0.5 },
    classifier: null,
    visual: { status: "ok", matches: [{ prefecture_en: "Nara", similarity: 0.9 }], confidence: 0.9 },
  });
  assert.equal(c.confidence, "medium");
  assert.ok(c.basis.includes("visual match agrees"));
});

test("fuse: visual alone, strong → medium", () => {
  const c = fuse({
    gps: null, ocr: null, classifier: null,
    visual: { status: "ok", matches: [{ prefecture_en: "Gifu", similarity: 0.9 }], confidence: 0.9 },
  });
  assert.equal(c.prefecture_en, "Gifu");
  assert.equal(c.confidence, "medium");
});
