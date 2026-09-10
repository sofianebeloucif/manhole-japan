// src/recognize/ocr.js — client-side OCR of cover text via Tesseract.js (jpn).
// Tesseract (~15 MB wasm + lang data) is loaded ONLY via lazy import() here,
// never at module top level, so it never touches first paint.
import { CDN } from "../config.js";

async function getTesseract(deps) {
  if (deps.tesseract) return deps.tesseract;
  return import(/* @vite-ignore */ CDN.tesseract);
}

// Downscale to <=1000px on the long edge, grayscale, hard threshold.
function preprocess(bitmap) {
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = g > 135 ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function runOcr(blob, deps = {}) {
  const Tesseract = await getTesseract(deps);
  const src = blob instanceof globalThis.Blob ? blob : new globalThis.Blob([blob]);
  const bitmap = await globalThis.createImageBitmap(src);
  const canvas = preprocess(bitmap);
  const { data } = await Tesseract.recognize(canvas, "jpn+jpn_vert", {
    corePath: CDN.tesseractCore,
    langPath: CDN.tesseractLang,
  });
  const rawText = (data.text || "").trim();
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
