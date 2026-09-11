/* global document, Option, URL, localStorage */
import { analyze } from "../recognize/index.js";
import { toWebp, slugify, randHex } from "./image.js";
import {
  buildFeatureArray, photoCreditsRow, prSteps, download, zipWebps, esc,
} from "./output.js";
import { PREFS } from "./form.js";
import { clusterEntries } from "../recognize/dedup.js";

const $ = (id) => document.getElementById(id);
let rows = [];
let cancelled = false;

function safeGetCredit() {
  try { return localStorage.getItem("mj-credit") || ""; } catch { return ""; }
}

function prefOptions(sel, value) {
  sel.append(new Option("(unknown)", ""));
  for (const p of PREFS) sel.append(new Option(p, p));
  sel.value = value || "";
}

function rowEl(row, i) {
  const el = document.createElement("div");
  el.className = "b-row";
  const c = row.analysis ? row.analysis.combined : { prefecture_en: null, confidence: "low" };
  el.innerHTML =
    `<img src="${esc(row.objectUrl)}" alt="">` +
    `<div class="b-fields">` +
    `<div class="b-verdict">#${i + 1} · ${esc(row.file.name)} · ${esc(c.prefecture_en || "unknown")} (${esc(c.confidence)})</div>` +
    `<div class="b-dup" ${row.dup ? "" : "hidden"}>${esc(row.dup || "")}</div>` +
    `<input class="b-name" placeholder="Name (English)">` +
    `<select class="b-pref"></select>` +
    `<input class="b-lon" type="number" step="any" placeholder="Longitude">` +
    `<input class="b-lat" type="number" step="any" placeholder="Latitude">` +
    `<input class="b-themes" placeholder="themes, comma separated">` +
    `<label style="font-size:11px"><input type="checkbox" class="b-keep" ${row.keep ? "checked" : ""}> keep</label>` +
    `</div>`;
  prefOptions(el.querySelector(".b-pref"), c.prefecture_en);
  const g = row.analysis && row.analysis.gps;
  if (g) { el.querySelector(".b-lon").value = g.lon; el.querySelector(".b-lat").value = g.lat; }
  el.querySelector(".b-keep").addEventListener("change", (e) => (row.keep = e.target.checked));
  row.el = el;
  return el;
}

let runToken = 0;
async function processFiles(files) {
  const myToken = ++runToken;
  cancelled = false;
  rows = [];
  $("b-rows").innerHTML = "";
  $("b-output").hidden = true;
  $("b-build").hidden = false;
  $("b-progress").hidden = false;
  for (let i = 0; i < files.length; i++) {
    if (cancelled || myToken !== runToken) return;
    const f = files[i];
    if (!/^image\/(jpeg|png)$/.test(f.type)) continue;
    $("b-progress").textContent = `Analysing ${i + 1} / ${files.length}…`;
    const row = { file: f, objectUrl: URL.createObjectURL(f), keep: true, dup: null };
    // sequential on purpose: analyse one photo at a time to bound memory / CPU
    row.analysis = await analyze(f, { runOcr: false, runClassifier: true, runVisual: true, keepVector: true });
    row.vector = row.analysis.visual?.vector || null;
    rows.push(row);
    $("b-rows").append(rowEl(row, rows.length - 1));
  }
  if (myToken !== runToken) return;

  clusterEntries(rows.map((r) => {
    const g = r.analysis && r.analysis.gps;
    return Object.assign(r, { lon: g ? g.lon : NaN, lat: g ? g.lat : NaN });
  }));
  const seen = new Set();
  rows.forEach((r) => {
    if (seen.has(r.clusterId)) {
      r.keep = false;
      r.dup = `same cover as row ${rows.findIndex((x) => x.clusterId === r.clusterId) + 1} (location and/or look)`;
      const box = r.el.querySelector(".b-dup");
      box.hidden = false; box.textContent = r.dup;
      r.el.querySelector(".b-keep").checked = false;
    } else {
      seen.add(r.clusterId);
    }
  });

  $("b-progress").textContent = `${rows.length} photo(s) analysed.`;
}

async function buildAll() {
  const kept = [];
  for (const row of rows) {
    if (!row.keep) continue;
    const name = row.el.querySelector(".b-name").value.trim();
    const pref = row.el.querySelector(".b-pref").value;
    const lon = parseFloat(row.el.querySelector(".b-lon").value);
    const lat = parseFloat(row.el.querySelector(".b-lat").value);
    if (!name || !pref || Number.isNaN(lon) || Number.isNaN(lat)) {
      $("b-progress").textContent = `Row for "${row.file.name}" needs name, prefecture, lon, lat.`;
      return;
    }
    const slug = `personal-${slugify(pref)}-${slugify(name)}-${randHex(4)}`;
    kept.push({
      row, slug,
      input: {
        name_en: name, prefecture_en: pref,
        themes: row.el.querySelector(".b-themes").value.split(",").map((s) => s.trim()).filter(Boolean),
        photo_credit: safeGetCredit(), photo_license: "own-work", lon, lat, slug,
      },
    });
  }
  const files = [];
  for (const k of kept) {
    // sequential on purpose: encode one photo at a time to bound memory
    const full = await toWebp(k.row.file, 1200, 0.82);
    const thumb = await toWebp(k.row.file, 320, 0.78);
    files.push({ name: `${k.slug}.webp`, blob: full }, { name: `${k.slug}.thumb.webp`, blob: thumb });
  }
  $("b-json").textContent = buildFeatureArray(kept.map((k) => k.input));
  $("b-credits").textContent = kept.map((k) => photoCreditsRow(k.input)).join("\n");
  $("b-steps").textContent = prSteps(kept.map((k) => k.slug).join(", "));
  $("b-output").hidden = false;
  const zipBtn = $("b-dl-zip");
  const zipLabel = zipBtn.textContent;
  zipBtn.onclick = async () => {
    zipBtn.disabled = true;
    zipBtn.textContent = "Zipping…";
    try {
      download(await zipWebps(files), "manhole-covers.zip");
      zipBtn.disabled = false;
      zipBtn.textContent = zipLabel;
    } catch {
      zipBtn.disabled = false;
      zipBtn.textContent = "Zip failed — try again";
    }
  };
}

export function openBatch() {
  $("batch").hidden = false;
  $("b-files").value = "";
  $("b-rows").innerHTML = "";
  $("b-output").hidden = true;
  $("b-build").hidden = true;
  $("b-progress").hidden = true;
}
export function closeBatch() {
  cancelled = true;
  $("batch").hidden = true;
}

$("batch-close").addEventListener("click", closeBatch);
$("b-files").addEventListener("change", (e) => processFiles([...e.target.files]));
$("b-build").addEventListener("click", () => { buildAll().catch(() => { $("b-progress").textContent = "Build failed."; }); });
