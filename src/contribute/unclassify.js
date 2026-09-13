/* global document, Option */
// src/contribute/unclassify.js: the "Help classify" panel controller.
// Shows photos nobody could identify yet (data/unclassified.json) so any
// visitor who recognises one can supply its name/prefecture/coordinates.
// Static site, no backend: this only ever produces a JSON block + publish
// steps, exactly like the normal contribute form. A human still opens the
// pull request.
import { UNCLASSIFIED_URL } from "../config.js";
import { buildFeature, photoCreditsRow, unclassifySteps, esc } from "./output.js";
import { PREFS } from "./form.js";
import { slugify, randHex } from "./image.js";

const $ = (id) => document.getElementById(id);

function prefOptions(sel) {
  sel.append(new Option("(unknown)", ""));
  for (const p of PREFS) sel.append(new Option(p, p));
}

function cardEl(entry) {
  const el = document.createElement("div");
  el.className = "u-card";
  el.innerHTML =
    `<img src="assets/photos/_unclassified/${esc(entry.slug)}.thumb.webp" alt="" class="u-thumb">` +
    `<div class="u-fields">` +
    `<div class="u-desc">${esc(entry.description)}</div>` +
    `<div class="u-note">Visible text: ${esc(entry.visible_text)}</div>` +
    (entry.note ? `<div class="u-note">${esc(entry.note)}</div>` : "") +
    `<button type="button" class="reset u-toggle">Recognise this one?</button>` +
    `<div class="u-form" hidden>` +
    `<input class="u-name" placeholder="Name (English) *">` +
    `<input class="u-name-ja" placeholder="Name (Japanese)">` +
    `<select class="u-pref"></select>` +
    `<input class="u-muni" placeholder="Municipality">` +
    `<input class="u-lon" type="number" step="any" placeholder="Longitude *">` +
    `<input class="u-lat" type="number" step="any" placeholder="Latitude *">` +
    `<input class="u-themes" placeholder="themes, comma separated">` +
    `<button type="button" class="reset u-build">Build entry</button>` +
    `<div class="u-msg"></div>` +
    `<pre class="u-json" hidden></pre>` +
    `<pre class="u-credits" hidden></pre>` +
    `<pre class="u-steps" hidden></pre>` +
    `</div></div>`;
  prefOptions(el.querySelector(".u-pref"));

  el.querySelector(".u-thumb").addEventListener("click", () => {
    openLightbox(`assets/photos/_unclassified/${entry.slug}.webp`);
  });

  el.querySelector(".u-toggle").addEventListener("click", () => {
    const form = el.querySelector(".u-form");
    form.hidden = !form.hidden;
  });

  el.querySelector(".u-build").addEventListener("click", () => {
    const msg = el.querySelector(".u-msg");
    const name_en = el.querySelector(".u-name").value.trim();
    const pref = el.querySelector(".u-pref").value;
    const lon = parseFloat(el.querySelector(".u-lon").value);
    const lat = parseFloat(el.querySelector(".u-lat").value);
    if (!name_en) { msg.textContent = "Name is required."; return; }
    if (!pref) { msg.textContent = "Prefecture is required."; return; }
    if (Number.isNaN(lon) || Number.isNaN(lat)) { msg.textContent = "Longitude and latitude are required."; return; }

    const slug = `personal-${slugify(pref) || "jp"}-${slugify(name_en)}-${randHex(4)}`;
    const input = {
      name_en,
      name_ja: el.querySelector(".u-name-ja").value.trim(),
      prefecture_en: pref,
      municipality: el.querySelector(".u-muni").value.trim(),
      themes: el.querySelector(".u-themes").value.split(",").map((s) => s.trim()).filter(Boolean),
      photo_credit: entry.photo_credit,
      photo_license: entry.photo_license,
      lon, lat, slug,
    };
    msg.textContent = "";
    const jsonEl = el.querySelector(".u-json");
    const creditsEl = el.querySelector(".u-credits");
    const stepsEl = el.querySelector(".u-steps");
    jsonEl.textContent = JSON.stringify(buildFeature(input), null, 2);
    creditsEl.textContent = photoCreditsRow(input);
    stepsEl.textContent = unclassifySteps(entry.slug, slug);
    jsonEl.hidden = false;
    creditsEl.hidden = false;
    stepsEl.hidden = false;
  });

  return el;
}

async function loadEntries(deps = {}) {
  if (deps.entries) return deps.entries;
  // No `r.ok` check: this list is load-bearing content for the whole panel,
  // same as main.js's DATA_URL/PREFECTURES_URL fetches. It is not an optional
  // signal like recognize/index.js#geo(), which degrades on a bad response.
  // The outer try/catch in openUnclassify() turns any failure (network,
  // non-JSON body, etc.) into a friendly message instead of an unhandled throw.
  const r = await fetch(UNCLASSIFIED_URL);
  return r.json();
}

export async function openUnclassify(deps = {}) {
  $("unclassify").hidden = false;
  const list = $("u-list");
  list.textContent = "Loading…";
  try {
    const entries = await loadEntries(deps);
    list.innerHTML = "";
    for (const entry of entries) list.appendChild(cardEl(entry));
  } catch {
    list.textContent = "Could not load the list. Try again later.";
  }
}

export function closeUnclassify() {
  $("unclassify").hidden = true;
}

function openLightbox(src) {
  $("lightbox-img").src = src;
  $("lightbox").hidden = false;
}

function closeLightbox() {
  $("lightbox").hidden = true;
  $("lightbox-img").src = "";
}

$("unclassify-close").addEventListener("click", closeUnclassify);
$("lightbox").addEventListener("click", closeLightbox);
$("lightbox-close").addEventListener("click", (e) => { e.stopPropagation(); closeLightbox(); });
