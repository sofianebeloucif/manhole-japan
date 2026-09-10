/* global document, location, history, URL */
// src/identify/view.js — the standalone "Identify a cover" full-screen tool.
import { analyze } from "../recognize/index.js";
import { openContributeWith } from "../contribute/form.js";

const $ = (id) => document.getElementById(id);
let mapView = null;
let last = { file: null, analysis: null };

export function bindMap(view) { mapView = view; }

function render(a) {
  const c = a.combined;
  const box = $("id-result");
  box.innerHTML =
    `<div class="verdict">${c.prefecture_en || "Origin unknown"} · ${c.confidence} confidence</div>` +
    `<div class="sig"><b>GPS</b><br>${a.gps
      ? `${a.gps.prefecture_en} — nearest known cover ${a.gps.nearestCover ? `${a.gps.nearestCover.name_en} (${a.gps.nearestCover.dist_m} m)` : "none"}`
      : "no GPS in this photo"}</div>` +
    `<div class="sig"><b>OCR</b><br>${a.ocr && a.ocr.status === "ok"
      ? `read: “${a.ocr.rawText.replace(/\n/g, " ").slice(0, 80)}” → ${a.ocr.municipalityGuesses.map((g) => `${g.name_ja} (${g.prefecture_en})`).join(", ") || "no match"}`
      : a.ocr ? a.ocr.status : "not run"}</div>` +
    `<div class="sig"><b>Classifier</b><br>${a.classifier && a.classifier.status === "ok"
      ? a.classifier.predictions.map((p) => `${p.prefecture_en} ${(p.prob * 100).toFixed(0)}%`).join(", ")
      : a.classifier && a.classifier.status === "insufficient_data"
      ? `not enough data yet (${a.classifier.have}/${a.classifier.need}) — contribute photos to train it`
      : "unavailable"}</div>` +
    `<div class="sig">Basis: ${c.basis.join(", ") || "—"}</div>` +
    `<button type="button" id="id-accept" class="reset">Looks right → add this as a cover</button>`;
  $("id-accept").onclick = () => { closeIdentify(); openContributeWith(last.file, last.analysis); };

  if (mapView && a.gps) {
    mapView.flyToFeature({ geometry: { coordinates: [a.gps.lon, a.gps.lat] } });
    mapView.highlightPrefecture(a.gps.prefecture_en);
  }
}

async function onFile(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) { $("id-result").textContent = "JPEG or PNG only."; return; }
  const url = URL.createObjectURL(file);
  $("id-preview").src = url; $("id-preview").hidden = false;
  $("id-result").textContent = "Analysing…";
  last.file = file;
  last.analysis = await analyze(file, { runOcr: true, runClassifier: true });
  render(last.analysis);
}

export function openIdentify() {
  $("identify").hidden = false;
  $("id-preview").hidden = true;
  $("id-result").innerHTML = "";
  $("id-file").value = "";
}

export function closeIdentify() {
  $("identify").hidden = true;
  if (location.search.includes("tool=identify")) {
    const params = new URLSearchParams(location.search);
    params.delete("tool");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
  }
}

$("identify-close").addEventListener("click", closeIdentify);
$("id-file").addEventListener("change", (e) => e.target.files[0] && onFile(e.target.files[0]));
$("identify-link").addEventListener("click", (e) => { e.preventDefault(); openIdentify(); });
