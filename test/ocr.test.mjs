import { test } from "node:test";
import assert from "node:assert/strict";
import { runOcr } from "../src/recognize/ocr.js";

function fakePaddleOcr(items) {
  return {
    async predict() {
      return [{ items, metrics: {} }];
    },
  };
}

test("runOcr: extracts rawText and tokens from PaddleOCR result items", async () => {
  const paddleocr = fakePaddleOcr([
    { text: "清水区", score: 0.98 },
    { text: "しずおか", score: 0.5 },
  ]);
  const { rawText, tokens } = await runOcr(new Uint8Array(), { paddleocr });
  assert.ok(rawText.includes("清水区"));
  assert.ok(rawText.includes("しずおか"));
  assert.ok(tokens.includes("清水区"));
  assert.ok(tokens.includes("しずおか"));
});

test("runOcr: filters tokens shorter than 2 characters and dedupes", async () => {
  const paddleocr = fakePaddleOcr([{ text: "区 清水区 清水区", score: 0.9 }]);
  const { tokens } = await runOcr(new Uint8Array(), { paddleocr });
  assert.deepEqual(tokens, ["清水区"]);
});

test("runOcr: empty items -> empty rawText and tokens", async () => {
  const paddleocr = fakePaddleOcr([]);
  const { rawText, tokens } = await runOcr(new Uint8Array(), { paddleocr });
  assert.equal(rawText, "");
  assert.deepEqual(tokens, []);
});

test("runOcr: accepts a raw byte array as well as a Blob", async () => {
  const paddleocr = fakePaddleOcr([{ text: "清水区", score: 0.98 }]);
  const { tokens } = await runOcr(new Uint8Array([1, 2, 3]), { paddleocr });
  assert.deepEqual(tokens, ["清水区"]);
});
