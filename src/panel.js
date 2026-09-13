import { CATEGORIES } from "./config.js";
import { esc } from "./contribute/output.js";

const el = document.getElementById("detail");
const body = document.getElementById("detail-body");
document.getElementById("detail-close").addEventListener("click", () => close());

let closeHandler = null;

export function onClose(fn) {
  closeHandler = fn;
}

export function close() {
  el.hidden = true;
  body.innerHTML = "";
  closeHandler && closeHandler();
}

const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

function cardHtml(feature) {
  const p = feature.properties;
  const media = p.photo
    ? `<a href="${esc(p.photo)}" target="_blank" rel="noopener">
         <img src="${esc(p.photo_thumb || p.photo)}" alt="${esc(p.name_en)}" loading="lazy"></a>`
    : `<div class="nophoto">No photo yet.<br>Seen it? <a href="https://github.com/sofianebeloucif/manhole-japan">Add one.</a></div>`;

  const rows = [
    ["Type", catLabel(p.category)],
    ["Prefecture", p.prefecture_ja ? `${p.prefecture_en} · ${p.prefecture_ja}` : p.prefecture_en],
    ["Municipality", p.municipality],
    ["Installed", p.installed],
    ["Photo", p.photo_credit ? `${p.photo_credit}${p.photo_license ? ` (${p.photo_license})` : ""}` : null],
  ].filter(([, v]) => v);

  const themes = (p.themes || [])
    .map((t) => `<button type="button" data-theme="${esc(t)}">${esc(t)}</button>`)
    .join("");

  return (
    media +
    `<h2>${esc(p.name_en)}</h2>` +
    (p.name_ja && p.name_ja !== p.name_en ? `<div class="ja" lang="ja">${esc(p.name_ja)}</div>` : "") +
    (themes ? `<div class="tags">${themes}</div>` : "") +
    `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
    `<a class="src" href="${esc(p.source_url)}" target="_blank" rel="noopener">Source: ${esc(p.source)} ↗</a>`
  );
}

function bindThemeHandlers(onTheme) {
  body.querySelectorAll("[data-theme]").forEach((b) =>
    b.addEventListener("click", () => onTheme && onTheme(b.dataset.theme)),
  );
}

export function show(feature, { onTheme } = {}) {
  body.innerHTML = `<div class="detail-card">${cardHtml(feature)}</div>`;
  bindThemeHandlers(onTheme);
  el.hidden = false;
  el.scrollTop = 0;
}

// Several covers sharing the same (approximate) spot: main.js#siblingsOf
// decides when this applies. Renders every one as its own card in the same
// already-scrollable #detail panel, so scrolling the panel steps through
// them all.
export function showMultiple(features, { onTheme } = {}) {
  body.innerHTML =
    `<p class="stack-hint">${features.length} covers at this spot. Scroll to see them all.</p>` +
    features.map((f) => `<div class="detail-card">${cardHtml(f)}</div>`).join("");
  bindThemeHandlers(onTheme);
  el.hidden = false;
  el.scrollTop = 0;
}
