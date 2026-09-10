import { MUNICIPALITIES_URL } from "../config.js";

export function normalizeText(s) {
  return String(s || "").normalize("NFKC").replace(/\s+/g, "");
}

export const NOISE_WORDS = new Set([
  "市", "区", "町", "村", "おすい", "汚水", "うすい", "雨水", "合流",
  "下水", "下水道", "公共", "仕切弁", "制水弁", "消火栓", "空気弁", "量水器",
  "電気", "通信", "ガス", "国土交通省", "日本下水道協会",
]);

function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}

function dice(a, b) {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function scoreToken(token, name) {
  if (token === name) return 1;
  if (name.includes(token) || token.includes(name)) return 0.8;
  return dice(token, name);
}

export function matchMunicipality(tokens, rows) {
  const clean = [...new Set(tokens.map(normalizeText))].filter(
    (t) => t.length >= 2 && !NOISE_WORDS.has(t),
  );
  if (!clean.length) return [];
  const scored = [];
  for (const r of rows) {
    let best = 0;
    for (const t of clean) {
      best = Math.max(best, scoreToken(t, normalizeText(r.name_ja)));
      if (r.name_kana) best = Math.max(best, scoreToken(t, normalizeText(r.name_kana)));
    }
    if (best >= 0.4) {
      scored.push({
        name_ja: r.name_ja, name_en: r.name_en,
        prefecture_en: r.prefecture_en, score: Number(best.toFixed(3)),
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

let _rows = null;
export async function loadGazetteer() {
  if (!_rows) _rows = await fetch(MUNICIPALITIES_URL).then((r) => r.json());
  return _rows;
}
