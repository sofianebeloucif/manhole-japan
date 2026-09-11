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

export function fuse({ gps, ocr, classifier, visual }) {
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

  const visTop = visual && visual.status === "ok" && visual.matches[0];
  if (visTop && visTop.prefecture_en) {
    if (!prefecture_en) {
      prefecture_en = visTop.prefecture_en;
      level = visTop.similarity >= 0.85 ? "medium" : "low";
      basis.push("visual match");
    } else if (visTop.prefecture_en === prefecture_en && visTop.similarity >= 0.85) {
      basis.push("visual match agrees");
      if (level !== "high") level = level === "low" ? "medium" : "high";
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
  const { runOcr = false, runClassifier = true, runVisual = false, keepVector = false } = opts;
  const classify = deps.classify || defaultClassify;

  let bitmap = null;
  try {
    bitmap = typeof globalThis.createImageBitmap === "function"
      ? await globalThis.createImageBitmap(new globalThis.Blob([file]))
      : null;
  } catch { /* node / unsupported */ }

  // Hoisted so it's in scope for the visual signal even when gps is null
  // (gpsSignal only calls geo() when EXIF GPS is present); geo() caches,
  // so this doesn't cause an extra fetch when gpsSignal calls it again below.
  let coversFC = null;
  try {
    ({ coversFC } = await geo(deps));
  } catch { /* prefectures/covers unavailable; gps/visual signals degrade below */ }

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

  let visual = null;
  if (runVisual) {
    try {
      if (deps.visual) {
        visual = deps.visual;
      } else {
        const { loadEmbeddings, matchVisual } = await import("./visualmatch.js");
        const emb = deps.embeddings || (await loadEmbeddings(deps));
        if (!emb) {
          let vec = null;
          if (keepVector) {
            const embedFn = deps.embed || (await import("./embed.js")).embed;
            vec = await embedFn(bitmap, deps);
          }
          visual = { status: "no_library", matches: [], vector: vec, confidence: 0 };
        } else {
          const embedFn = deps.embed || (await import("./embed.js")).embed;
          const vec = await embedFn(bitmap, deps);
          const raw = matchVisual(vec, emb, { topK: 5 });
          const byId = new Map((coversFC?.features || []).map((f) => [f.properties.id, f.properties]));
          visual = {
            status: "ok",
            matches: raw.map((m) => ({
              id: m.id,
              name_en: byId.get(m.id)?.name_en ?? null,
              prefecture_en: byId.get(m.id)?.prefecture_en ?? null,
              similarity: m.similarity,
            })),
            vector: keepVector ? vec : null,
            confidence: Math.min(0.9, raw.length ? raw[0].similarity : 0),
          };
        }
      }
    } catch {
      visual = { status: "unavailable", matches: [], vector: null, confidence: 0 };
    }
  }

  let combined;
  try { combined = fuse({ gps, ocr, classifier, visual }); }
  catch { combined = { prefecture_en: null, municipality: null, basis: [], confidence: "low" }; }

  return {
    image: bitmap ? { width: bitmap.width, height: bitmap.height } : { width: 0, height: 0 },
    gps, ocr, classifier, visual,
    combined,
  };
}
