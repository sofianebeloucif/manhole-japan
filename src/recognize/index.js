// src/recognize/index.js
import { PREFECTURES_URL, DATA_URL } from "../config.js";
import { resolvePrefecture, nearestCover } from "../geo.js";
import { readGps } from "./exif.js";
import { classify as defaultClassify } from "./classifier.js";

let _prefFC = null;
let _coversFC = null;
async function geo(deps) {
  const prefFC = deps.prefFC || _prefFC || (_prefFC = await fetch(PREFECTURES_URL).then((r) => {
    if (!r.ok) throw new Error(`prefectures fetch failed: ${r.status}`);
    return r.json();
  }));
  const coversFC = deps.coversFC || _coversFC || (_coversFC = await fetch(DATA_URL).then((r) => {
    if (!r.ok) throw new Error(`covers fetch failed: ${r.status}`);
    return r.json();
  }));
  return { prefFC, coversFC };
}

async function gpsSignal(file, deps) {
  const g = await readGps(file, deps);
  if (!g) return null;
  const { prefFC, coversFC } = await geo(deps);
  const pref = resolvePrefecture(g.lon, g.lat, prefFC);
  const nc = nearestCover(g.lon, g.lat, coversFC);
  return {
    lat: g.lat, lon: g.lon,
    prefecture_en: pref.prefecture_en, prefecture_ja: pref.prefecture_ja,
    nearestCover: nc
      ? {
        id: nc.feature.properties.id,
        name_en: nc.feature.properties.name_en,
        municipality: nc.feature.properties.municipality ?? null,
        dist_m: nc.dist_m,
      }
      : null,
    confidence: 0.95,
  };
}

export function fuse({ gps, ocr, classifier }) {
  const basis = [];
  let prefecture_en = null;
  let level = "low";

  if (gps && gps.prefecture_en) {
    prefecture_en = gps.prefecture_en;
    basis.push("GPS");
    level = "high";
  }

  const ocrTop = ocr && ocr.status === "ok" && (ocr.municipalityGuesses || [])[0];
  if (ocrTop && ocrTop.score >= 0.4) {
    if (!prefecture_en) {
      prefecture_en = ocrTop.prefecture_en;
      level = ocr.confidence >= 0.6 ? "medium" : "low";
      basis.push("OCR");
    } else if (ocrTop.prefecture_en === prefecture_en) {
      basis.push("OCR agrees");
      level = "high";
    }
  }

  const clfTop = classifier && classifier.status === "ok" && classifier.predictions[0];
  if (clfTop) {
    if (!prefecture_en) {
      prefecture_en = clfTop.prefecture_en;
      level = clfTop.prob >= 0.6 ? "medium" : "low";
      basis.push("classifier");
    } else if (clfTop.prefecture_en === prefecture_en) {
      basis.push("classifier agrees");
      if (level !== "high") level = "medium";
    }
  }

  let municipality = null;
  if (gps && gps.nearestCover && gps.nearestCover.dist_m < 60) {
    municipality = gps.nearestCover.municipality ?? null;
  } else if (ocrTop && ocrTop.score >= 0.6) {
    municipality = ocrTop.name_en;
  }

  return { prefecture_en, municipality, basis, confidence: level };
}

export async function analyze(file, opts = {}, deps = {}) {
  const { runOcr = false, runClassifier = true } = opts;
  const classify = deps.classify || defaultClassify;

  let bitmap = null;
  try {
    bitmap = typeof globalThis.createImageBitmap === "function"
      ? await globalThis.createImageBitmap(new globalThis.Blob([file]))
      : null;
  } catch { /* node / unsupported */ }

  let gps = null;
  try {
    gps = await gpsSignal(file, deps);
  } catch {
    gps = null;
  }

  let ocr = null;
  if (runOcr) {
    try {
      const ocrFn = deps.ocr || (await import("./ocr.js")).runOcr;
      const { loadGazetteer, matchMunicipality } = await import("./gazetteer.js");
      const gaz = deps.gazetteer || loadGazetteer;
      const raw = await ocrFn(file, deps);
      // ocrFn may already return a full signal (tests) or just {rawText,tokens}.
      if (raw.status) {
        ocr = raw;
      } else {
        const rows = typeof gaz === "function" ? await gaz() : gaz;
        const guesses = matchMunicipality(raw.tokens, rows);
        ocr = {
          status: "ok",
          rawText: raw.rawText,
          tokens: raw.tokens,
          municipalityGuesses: guesses,
          confidence: guesses.length ? Math.min(0.7, guesses[0].score) : 0.2,
        };
      }
    } catch {
      ocr = { status: "error", rawText: "", tokens: [], municipalityGuesses: [], confidence: 0 };
    }
  }

  let classifier = null;
  if (runClassifier) {
    try { classifier = await classify(bitmap, deps); }
    catch { classifier = { status: "unavailable", predictions: [] }; }
  }

  return {
    image: bitmap ? { width: bitmap.width, height: bitmap.height } : { width: 0, height: 0 },
    gps, ocr, classifier,
    combined: fuse({ gps, ocr, classifier }),
  };
}
