/* global document, location, history, URL */
// src/identify/view.js: the standalone "Identify a cover" full-screen tool.
import { analyze } from "../recognize/index.js";
import { openContributeWith } from "../contribute/form.js";
import { duplicateVerdict } from "../recognize/dedup.js";
import { esc } from "../contribute/output.js";

const $ = (id) => document.getElementById(id);
let mapView = null;
let last = { file: null, analysis: null };
let lastPreviewUrl = null;

export function bindMap(view) { mapView = view; }

function render(a) {
  const c = a.combined;
  const box = $("id-result");
  const dv = duplicateVerdict(a);
  const dupLine = dv.level === "new" ? "" :
    `<div class="verdict" style="color:#b45309">${dv.level === "confirmed" ? "Already on the map" : "Possibly already on the map"}` +
    (dv.of ? `: <a href="?id=${esc(dv.of.id)}">${esc(dv.of.name_en || dv.of.id)}</a>` : "") +
    ` (${esc(dv.level)})</div>`;
  box.innerHTML =
    dupLine +
    `<div class="verdict">${esc(c.prefecture_en || "Origin unknown")} · ${esc(c.confidence)} confidence</div>` +
    `<div class="sig"><b>GPS</b><br>${a.gps
      ? `${esc(a.gps.prefecture_en)}, nearest known cover ${a.gps.nearestCover ? `${esc(a.gps.nearestCover.name_en)} (${esc(a.gps.nearestCover.dist_m)} m)` : "none"}`
      : "no GPS in this photo"}</div>` +
    `<div class="sig"><b>OCR</b><br>${a.ocr && a.ocr.status === "ok"
      ? `read: “${esc(a.ocr.rawText.replace(/\n/g, " ").slice(0, 80))}” → ${a.ocr.municipalityGuesses.map((g) => `${esc(g.name_ja)} (${esc(g.prefecture_en)})`).join(", ") || "no match"}`
      : a.ocr ? esc(a.ocr.status) : "not run"}</div>` +
    `<div class="sig"><b>Classifier</b><br>${a.classifier && a.classifier.status === "ok"
      ? a.classifier.predictions.map((p) => `${esc(p.prefecture_en)} ${(p.prob * 100).toFixed(0)}%`).join(", ")
      : a.classifier && a.classifier.status === "insufficient_data"
      ? `not enough data yet (${esc(a.classifier.have)}/${esc(a.classifier.need)}), contribute photos to train it`
      : "unavailable"}</div>` +
    `<div class="sig"><b>Visual match</b><br>${a.visual && a.visual.status === "ok"
      ? a.visual.matches.slice(0, 3).map((m) => `${esc(m.name_en || m.id)} (${esc(m.prefecture_en || "?")}) ${(m.similarity * 100).toFixed(0)}%`).join(", ")
      : a.visual && a.visual.status === "no_library"
      ? "no reference library yet, add contributed photos to build it"
      : a.visual && a.visual.status === "unavailable"
      ? "unavailable"
      : "not run"}</div>` +
    `<div class="sig">Basis: ${esc(c.basis.join(", ") || "none")}</div>` +
    (a.visual && a.visual.status === "ok" ? "" : `<button type="button" id="id-visual" class="reset">Find visual matches (~23 MB once)</button>`) +
    `<button type="button" id="id-accept" class="reset">Looks right → add this as a cover</button>`;
  $("id-accept").onclick = () => { closeIdentify(); openContributeWith(last.file, last.analysis); };
  const vbtn = $("id-visual");
  if (vbtn) {
    vbtn.onclick = async () => {
      vbtn.disabled = true;
      vbtn.textContent = "Matching…";
      try {
        last.analysis = await analyze(last.file, { runOcr: true, runClassifier: true, runVisual: true });
        render(last.analysis);
      } catch {
        vbtn.disabled = false;
        vbtn.textContent = "Visual match failed, try again";
      }
    };
  }

  if (mapView && a.gps) {
    mapView.flyToFeature({ geometry: { coordinates: [a.gps.lon, a.gps.lat] } });
    mapView.highlightPrefecture(a.gps.prefecture_en);
  }
}

async function onFile(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) { $("id-result").textContent = "JPEG or PNG only."; return; }
  const url = URL.createObjectURL(file);
  if (lastPreviewUrl) URL.revokeObjectURL(lastPreviewUrl);
  lastPreviewUrl = url;
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
$("id-file").addEventListener("change", (e) => {
  if (!e.target.files[0]) return;
  onFile(e.target.files[0]).catch(() => {
    $("id-result").textContent = "Could not analyse that image. Try another photo.";
  });
});
$("identify-link").addEventListener("click", (e) => { e.preventDefault(); openIdentify(); });
