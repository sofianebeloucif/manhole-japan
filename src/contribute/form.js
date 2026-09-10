/* global document, localStorage, Option */
// src/contribute/form.js — the "＋ Add a cover" panel controller.
import { analyze } from "../recognize/index.js";
import { toWebp, slugify, randHex } from "./image.js";
import { buildFeature, photoCreditsRow, prSteps, download } from "./output.js";

const $ = (id) => document.getElementById(id);
let closeHandlers = [];
let current = { file: null, analysis: null, webpFull: null, webpThumb: null };

const PREFS = [
  "Aichi","Akita","Aomori","Chiba","Ehime","Fukui","Fukuoka","Fukushima","Gifu","Gunma",
  "Hiroshima","Hokkaido","Hyogo","Ibaraki","Ishikawa","Iwate","Kagawa","Kagoshima","Kanagawa",
  "Kochi","Kumamoto","Kyoto","Mie","Miyagi","Miyazaki","Nagano","Nagasaki","Nara","Niigata",
  "Oita","Okayama","Okinawa","Osaka","Saga","Saitama","Shiga","Shimane","Shizuoka","Tochigi",
  "Tokushima","Tokyo","Tottori","Toyama","Wakayama","Yamagata","Yamaguchi","Yamanashi",
];

function fillPrefSelect() {
  const sel = $("c-pref");
  if (sel.options.length) return;
  sel.append(new Option("(unknown)", ""));
  for (const p of PREFS) sel.append(new Option(p, p));
}

function renderAnalysis(a) {
  const box = $("c-analysis");
  box.hidden = false;
  const c = a.combined;
  box.innerHTML =
    `<div class="verdict">${c.prefecture_en || "Origin unknown"} · ${c.confidence} confidence</div>` +
    `<div class="sig">GPS: ${a.gps ? `${a.gps.prefecture_en} (${a.gps.lat.toFixed(4)}, ${a.gps.lon.toFixed(4)})` : "none"}</div>` +
    `<div class="sig">OCR: ${a.ocr ? a.ocr.status : "not run"}</div>` +
    `<div class="sig">Classifier: ${a.classifier ? a.classifier.status : "not run"}</div>` +
    `<div class="sig">Basis: ${c.basis.join(", ") || "—"}</div>`;

  if (current.file && !(a.ocr && a.ocr.status === "ok")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reset";
    btn.id = "c-ocr";
    btn.textContent = "Read the cover text (OCR)";
    btn.title = "downloads ~15 MB once";
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Reading… (downloads ~15 MB once)";
      try {
        current.analysis = await analyze(current.file, { runOcr: true, runClassifier: true });
        renderAnalysis(current.analysis);
        prefill(current.analysis);
      } catch {
        btn.disabled = false;
        btn.textContent = "OCR failed — try again";
      }
    };
    box.appendChild(btn);
  }
}

function prefill(a) {
  fillPrefSelect();
  $("c-pref").value = a.combined.prefecture_en || "";
  $("c-muni").value = a.combined.municipality || "";
  try { $("c-credit").value = localStorage.getItem("mj-credit") || ""; } catch { /* ignore */ }
  $("c-fields").hidden = false;
}

async function onFile(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) {
    current = { file: null, analysis: null, webpFull: null, webpThumb: null };
    $("c-fields").hidden = true;
    $("c-output").hidden = true;
    $("c-analysis").hidden = false;
    $("c-analysis").textContent = "Please choose a JPEG or PNG. HEIC is not supported.";
    return;
  }
  try {
    current = { file, analysis: null, webpFull: null, webpThumb: null };
    current.analysis = await analyze(file, { runClassifier: true });
    renderAnalysis(current.analysis);
    prefill(current.analysis);
  } catch {
    $("c-analysis").hidden = false;
    $("c-analysis").textContent = "Could not analyze that image. Please try another photo.";
  }
}

async function build() {
  const a = current.analysis || { gps: null };
  const name_en = $("c-name-en").value.trim();
  if (!name_en) { $("c-name-en").focus(); return; }
  if (!a.gps && !$("c-pref").value) { $("c-pref").focus(); return; }

  try {
    const pref = $("c-pref").value;
    const slug = `personal-${slugify(pref) || "jp"}-${slugify(name_en)}-${randHex(4)}`;
    const lon = a.gps ? a.gps.lon : 138.0;
    const lat = a.gps ? a.gps.lat : 38.0;

    current.webpFull = await toWebp(current.file, 1200, 0.82);
    current.webpThumb = await toWebp(current.file, 320, 0.78);

    const input = {
      name_en,
      name_ja: $("c-name-ja").value.trim(),
      prefecture_en: pref,
      municipality: $("c-muni").value.trim(),
      themes: $("c-themes").value.split(",").map((s) => s.trim()).filter(Boolean),
      installed: $("c-installed").value.trim(),
      photo_credit: $("c-credit").value.trim(),
      photo_license: $("c-license").value.trim(),
      lon, lat, slug,
    };
    try { localStorage.setItem("mj-credit", input.photo_credit); } catch { /* ignore */ }

    $("c-json").textContent = JSON.stringify(buildFeature(input), null, 2);
    $("c-credits").textContent = photoCreditsRow(input);
    $("c-steps").textContent = prSteps(slug);
    $("c-output").hidden = false;
    $("c-dl-full").onclick = () => download(current.webpFull, `${slug}.webp`);
    $("c-dl-thumb").onclick = () => download(current.webpThumb, `${slug}.thumb.webp`);
  } catch {
    $("c-analysis").hidden = false;
    $("c-analysis").textContent = "Could not build the entry. Please check the fields and try again.";
  }
}

export function onClose(fn) { closeHandlers.push(fn); }

export function closeContribute() {
  $("contribute").hidden = true;
  closeHandlers.forEach((fn) => fn());
}

export function openContribute() {
  $("contribute").hidden = false;
  $("c-analysis").hidden = true;
  $("c-fields").hidden = true;
  $("c-output").hidden = true;
  $("c-file").value = "";
}

export function openContributeWith(file, analysis) {
  openContribute();
  current = { file, analysis, webpFull: null, webpThumb: null };
  renderAnalysis(analysis);
  prefill(analysis);
}

$("contribute-close").addEventListener("click", closeContribute);
$("c-file").addEventListener("change", (e) => e.target.files[0] && onFile(e.target.files[0]));
$("c-build").addEventListener("click", build);
