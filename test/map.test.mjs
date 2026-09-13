// Regression coverage for a real bug: createMap() used to always start with
// BASEMAPS.light and swap to dark right after boot when the system/saved
// theme was dark. map.setStyle()'s async source teardown raced the initial
// setCovers()/setPrefectures() calls, and on a system already in dark mode
// this silently dropped all map data (source.setData() on a torn-down
// source is a no-op, not an error). The map showed the basemap with zero
// markers, no console error. Fixed by starting the map with the right
// style up front instead of swapping after the fact.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASEMAPS } from "../src/config.js";

class FakeSource {
  constructor(d) { this._data = d; }
  setData(d) { this._data = d; }
}
class FakeMap {
  constructor(opts) { this.opts = opts; this._src = {}; this._layers = new Set(); this._ev = {}; }
  addControl() {}
  addSource(id, cfg) { this._src[id] = new FakeSource(cfg.data); }
  getSource(id) { return this._src[id]; }
  addLayer(l) { this._layers.add(l.id); }
  getLayer(id) { return this._layers.has(id) ? { id } : undefined; }
  setPaintProperty() {}
  setStyle(s) { this.opts.style = s; }
  fitBounds(bounds, opts) { this._lastFitBounds = opts; }
  on(a, b, c) {
    const [ev, fn] = typeof b === "function" ? [a, b] : [a + ":" + b, c];
    (this._ev[ev] ||= []).push(fn);
    if (a === "load") queueMicrotask(fn);
  }
  once(a, fn) { this.on(a, fn); }
  fire(ev, arg) { (this._ev[ev] || []).forEach((fn) => fn(arg)); }
  getCanvas() { return { style: {} }; }
}
globalThis.maplibregl = {
  Map: FakeMap,
  NavigationControl: class {},
  GeolocateControl: class {},
  LngLatBounds: class { extend() {} },
};

const { createMap } = await import("../src/map.js");

test("createMap(theme): starts the underlying map with the requested basemap style, no swap needed", async () => {
  const view = createMap("dark");
  await view.ready;
  assert.equal(view.map.opts.style, BASEMAPS.dark);
});

test("createMap(): defaults to the light basemap when no theme is given", async () => {
  const view = createMap();
  await view.ready;
  assert.equal(view.map.opts.style, BASEMAPS.light);
});

test("setCovers() right after boot (no interleaved setBasemap) actually reaches the source", async () => {
  const view = createMap("dark");
  await view.ready;
  const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: { id: "a" }, geometry: { type: "Point", coordinates: [1, 2] } }] };
  view.setCovers(fc);
  assert.equal(view.map.getSource("covers")._data.features.length, 1);
});

// Regression coverage for a real bug: fitJapan()/fitFeatures() always used
// a 360px left padding sized for the docked desktop sidebar. Under 640px
// the sidebar sits on TOP of the map instead (style.css), so that much
// left padding left almost nothing to fit into and the map rendered
// zoomed/panned somewhere far from Japan. pad() now picks a different
// padding shape depending on window.innerWidth.
test("fitJapan(): uses the desktop (large left) padding on a wide viewport", async () => {
  globalThis.window = { innerWidth: 1440 };
  try {
    const view = createMap("light");
    await view.ready;
    view.fitJapan();
    assert.equal(view.map._lastFitBounds.padding.left, 360);
  } finally {
    delete globalThis.window;
  }
});

test("fitJapan(): switches to a small, top-heavy padding under the 640px breakpoint", async () => {
  globalThis.window = { innerWidth: 390 };
  try {
    const view = createMap("light");
    await view.ready;
    view.fitJapan();
    const p = view.map._lastFitBounds.padding;
    assert.equal(p.left, 20);
    assert.ok(p.top > p.left, "top padding should exceed the desktop-sized left padding on mobile");
  } finally {
    delete globalThis.window;
  }
});
