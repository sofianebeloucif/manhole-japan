import { CATEGORIES } from "./config.js";

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
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function show(feature, { onTheme } = {}) {
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

  body.innerHTML =
    media +
    `<h2>${esc(p.name_en)}</h2>` +
    (p.name_ja && p.name_ja !== p.name_en ? `<div class="ja" lang="ja">${esc(p.name_ja)}</div>` : "") +
    (themes ? `<div class="tags">${themes}</div>` : "") +
    `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
    `<a class="src" href="${esc(p.source_url)}" target="_blank" rel="noopener">Source: ${esc(p.source)} ↗</a>`;

  body.querySelectorAll("[data-theme]").forEach((b) =>
    b.addEventListener("click", () => onTheme && onTheme(b.dataset.theme)),
  );

  el.hidden = false;
  el.scrollTop = 0;
}
