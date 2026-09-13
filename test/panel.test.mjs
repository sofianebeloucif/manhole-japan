// Regression coverage for panel.js#showMultiple: several personal covers can
// intentionally share the same (approximate) coordinate when the exact spot
// is unknown. Clicking that spot must surface every one of them, not just
// whichever MapLibre happened to report first. See main.js#siblingsOf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<div id="detail" hidden><button id="detail-close"></button><div id="detail-body"></div></div>`,
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { show, showMultiple } = await import("../src/panel.js");

function feature(id, name_en, themes = []) {
  return {
    properties: {
      id,
      name_en,
      prefecture_en: "Saga",
      category: "personal",
      themes,
      photo: null,
      source: "personal",
      source_url: "https://example.test",
    },
  };
}

test("show(): renders a single card, panel visible", () => {
  show(feature("a", "Albert"));
  const body = document.getElementById("detail-body");
  assert.equal(document.getElementById("detail").hidden, false);
  assert.equal(body.querySelectorAll(".detail-card").length, 1);
  assert.match(body.textContent, /Albert/);
});

test("showMultiple(): renders one card per feature, with a count hint", () => {
  const features = [
    feature("a", "Albert"),
    feature("b", "Aisha"),
    feature("c", "Urpina"),
  ];
  showMultiple(features);
  const body = document.getElementById("detail-body");
  assert.equal(body.querySelectorAll(".detail-card").length, 3);
  assert.match(body.textContent, /3 covers at this spot/);
  assert.match(body.textContent, /Albert/);
  assert.match(body.textContent, /Aisha/);
  assert.match(body.textContent, /Urpina/);
});

test("showMultiple(): each card's theme tag fires onTheme with its own value, independently", () => {
  const seen = [];
  showMultiple(
    [feature("a", "Albert", ["mascot"]), feature("b", "Aisha", ["romancing-saga"])],
    { onTheme: (t) => seen.push(t) },
  );
  const buttons = document.querySelectorAll("#detail-body [data-theme]");
  assert.equal(buttons.length, 2);
  buttons[1].dispatchEvent(new window.Event("click"));
  assert.deepEqual(seen, ["romancing-saga"]);
});
