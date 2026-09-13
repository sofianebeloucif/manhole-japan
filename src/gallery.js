/* global document */
// src/gallery.js: a clean photo showcase. Every currently-visible cover
// that actually has a photo (pokefuta mostly doesn't -- see README), laid
// out as a responsive grid. Click a thumbnail for the full-size photo in
// the shared lightbox; click a card's caption to jump to it on the map.
import { esc } from "./contribute/output.js";
import { openLightbox } from "./lightbox.js";

const $ = (id) => document.getElementById(id);
const el = $("gallery");
const grid = $("gallery-grid");
const countEl = $("gallery-count");

function cardEl(feature, onSelect) {
  const p = feature.properties;
  const card = document.createElement("div");
  card.className = "gal-card";
  card.innerHTML =
    `<img src="${esc(p.photo_thumb || p.photo)}" alt="${esc(p.name_en)}" class="gal-thumb" loading="lazy">` +
    `<button type="button" class="gal-caption">${esc(p.name_en)}<span>${esc(p.prefecture_en)}</span></button>`;
  card.querySelector(".gal-thumb").addEventListener("click", () => openLightbox(p.photo));
  card.querySelector(".gal-caption").addEventListener("click", () => onSelect(p.id));
  return card;
}

export function openGallery(features, { onSelect } = {}) {
  const withPhotos = features.filter((f) => f.properties.photo);
  countEl.textContent = withPhotos.length
    ? `${withPhotos.length} photographed cover${withPhotos.length === 1 ? "" : "s"} in the current filter.`
    : "No photographed covers in the current filter. Poké Lids are location-only (see README); try 'My finds' or 'Community photos'.";
  grid.innerHTML = "";
  for (const f of withPhotos) grid.appendChild(cardEl(f, (id) => { close(); onSelect && onSelect(id); }));
  el.hidden = false;
}

export function close() {
  el.hidden = true;
}

$("gallery-close").addEventListener("click", close);
