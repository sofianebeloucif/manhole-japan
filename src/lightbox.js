/* global document */
// src/lightbox.js: the shared full-size photo overlay (#lightbox in
// index.html). Originally lived inside contribute/unclassify.js; pulled out
// so gallery.js can reuse the same overlay instead of duplicating it.
import { openReconstruct } from "./reconstruct/view.js";

const $ = (id) => document.getElementById(id);

export function openLightbox(src) {
  $("lightbox-img").src = src;
  $("lightbox").hidden = false;
}

export function closeLightbox() {
  $("lightbox").hidden = true;
  $("lightbox-img").src = "";
}

$("lightbox").addEventListener("click", closeLightbox);
$("lightbox-close").addEventListener("click", (e) => { e.stopPropagation(); closeLightbox(); });
$("lightbox-reconstruct").addEventListener("click", (e) => {
  e.stopPropagation();
  const src = $("lightbox-img").src;
  closeLightbox();
  openReconstruct(src);
});
