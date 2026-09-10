import { test } from "node:test";
import assert from "node:assert/strict";
import { matchMunicipality, normalizeText, NOISE_WORDS } from "../src/recognize/gazetteer.js";

const ROWS = [
  { code: "13104", name_ja: "新宿区", name_en: "新宿区", prefecture_en: "Tokyo", prefecture_ja: "東京都", lon: 139.7, lat: 35.69 },
  { code: "26100", name_ja: "京都市", name_en: "京都市", prefecture_en: "Kyoto", prefecture_ja: "京都府", lon: 135.76, lat: 35.01 },
  { code: "27100", name_ja: "大阪市", name_en: "大阪市", prefecture_en: "Osaka", prefecture_ja: "大阪府", lon: 135.5, lat: 34.69 },
];

test("normalizeText: NFKC + strips spaces", () => {
  assert.equal(normalizeText("京 都 市"), "京都市");
});

test("matchMunicipality: exact hit wins", () => {
  const g = matchMunicipality(["京都市", "おすい"], ROWS);
  assert.equal(g[0].prefecture_en, "Kyoto");
  assert.equal(g[0].score, 1);
});

test("matchMunicipality: partial 京都 still matches 京都市", () => {
  const g = matchMunicipality(["京都"], ROWS);
  assert.equal(g[0].prefecture_en, "Kyoto");
  assert.ok(g[0].score >= 0.6 && g[0].score < 1);
});

test("matchMunicipality: noise-only tokens → empty", () => {
  assert.deepEqual(matchMunicipality(["おすい", "汚水", "仕切弁"], ROWS), []);
});

test("NOISE_WORDS covers the common cast words", () => {
  for (const w of ["おすい", "汚水", "雨水", "下水道"]) assert.ok(NOISE_WORDS.has(w));
});
