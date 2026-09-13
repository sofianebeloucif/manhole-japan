// src/recognize/ocr.js - client-side OCR of cover text via PaddleOCR (ONNX, PP-OCRv5 "ch" model).
// PaddleOCR (~26 MB: OpenCV.js + onnxruntime-web det/cls/rec models) is loaded
// ONLY via lazy import() here, never at module top level, so it never touches
// first paint. Reads kanji reliably even in stylized/illustrated cover art
// (verified against real Poke Lid photos). The model's own dictionary
// includes hiragana and katakana, but real-world accuracy on stylised,
// embossed kana hasn't been verified the way the kanji case has. See
// README for details on this trade-off.
import { CDN } from "../config.js";

let _ocr;

async function getOcr(deps) {
  if (deps.paddleocr) return deps.paddleocr;
  if (!_ocr) {
    // CDN.paddleocrJs is pinned to an exact npm version, but the SDK itself
    // then fetches OpenCV.js + the det/cls/rec ONNX models from URLs baked
    // into its own bundle - those nested assets aren't something this repo
    // controls or audits directly.
    const { PaddleOCR } = await import(/* @vite-ignore */ CDN.paddleocrJs);
    _ocr = await PaddleOCR.create({ lang: "ch", ocrVersion: "PP-OCRv5" });
  }
  return _ocr;
}

export async function runOcr(blob, deps = {}) {
  const ocr = await getOcr(deps);
  const src = blob instanceof globalThis.Blob ? blob : new globalThis.Blob([blob]);
  const [result] = await ocr.predict(src);
  const rawText = result.items.map((item) => item.text).join("\n").trim();
  const tokens = [
    ...new Set(
      rawText
        .split(/[\s、。・()（）\d]+/u)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2),
    ),
  ];
  return { rawText, tokens };
}
