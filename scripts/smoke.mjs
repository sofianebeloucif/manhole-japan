// Headless smoke test: loads index.html in jsdom with a stubbed maplibregl,
// boots src/main.js against the real data files, and exercises filters +
// selection + theme toggle. Catches wiring bugs without a real browser.
import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));

class FakeSource {
  constructor(d) { this._data = d; }
  setData(d) { this._data = d; }
  getClusterExpansionZoom() { return Promise.resolve(10); }
}
class FakeMap {
  constructor() { this._src = {}; this._layers = new Set(); this._ev = {}; }
  addControl() {}
  addSource(id, cfg) { this._src[id] = new FakeSource(cfg.data); }
  getSource(id) { return this._src[id]; }
  addLayer(l) { this._layers.add(l.id); }
  getLayer(id) { return this._layers.has(id) ? { id } : undefined; }
  setPaintProperty() {}
  on(a, b, c) {
    const [ev, fn] = typeof b === "function" ? [a, b] : [a + ":" + b, c];
    (this._ev[ev] ||= []).push(fn);
    if (a === "load") queueMicrotask(fn);
  }
  once(a, fn) { this.on(a, fn); }
  fire(ev, arg) { (this._ev[ev] || []).forEach((fn) => fn(arg)); }
  easeTo() {} flyTo() {} fitBounds() {} setStyle() {}
  getZoom() { return 5; }
  getCanvas() { return { style: {} }; }
}
const maplibregl = {
  Map: FakeMap,
  NavigationControl: class {},
  GeolocateControl: class {},
  LngLatBounds: class { extend() {} },
};

const dom = new JSDOM(read("index.html"), {
  url: "http://localhost:8777/?pref=Miyagi",
  runScripts: "outside-only",
  virtualConsole: vc,
  pretendToBeVisual: true,
});
const { window } = dom;
window.maplibregl = maplibregl;
window.fetch = (u) => {
  const rel = u.replace(/^https?:\/\/[^/]+\//, "").replace(/^\//, "");
  return Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(rel))) });
};
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

globalThis.window = window;
globalThis.document = window.document;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.localStorage = window.localStorage;
globalThis.matchMedia = window.matchMedia;
globalThis.fetch = window.fetch;
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.maplibregl = maplibregl;

await import(path.join(ROOT, "src/main.js"));
await new Promise((r) => setTimeout(r, 300));

function check(name, cond) {
  console.log((cond ? "PASS " : "FAIL ") + name);
  if (!cond) process.exitCode = 1;
}

const d = window.document;
const stats = d.querySelectorAll("#stats .stat b");
check("stats rendered", stats.length === 3);
check("prefecture filter from URL applied", d.getElementById("prefecture").value === "Miyagi");
check("prefecture options populated", d.getElementById("prefecture").options.length > 20);
check("category chips built", d.querySelectorAll("#categories .chip").length === 4);
check("prefecture bars rendered", d.querySelectorAll("#prefbars .row").length > 0);
const covers = Number(stats[0]?.textContent || 0);
check("Miyagi cover count sane (10-60)", covers >= 10 && covers <= 60);

// exercise selection
const gj = JSON.parse(read("data/covers.geojson"));
const miyagi = gj.features.find((f) => f.properties.prefecture_en === "Miyagi");
window.dispatchEvent(new window.Event("x")); // noop to ensure event system alive
d.getElementById("q").value = miyagi.properties.themes[0] || "Lapras";
d.getElementById("q").dispatchEvent(new window.Event("input"));
await new Promise((r) => setTimeout(r, 250));
check("search narrows results", Number(d.querySelector("#stats .stat b").textContent) <= covers);

// theme toggle
d.getElementById("theme-toggle").dispatchEvent(new window.Event("click"));
check("theme flips to dark", d.documentElement.dataset.theme === "dark");

// OCR signal degrades gracefully when tesseract can't load (jsdom / node)
const { analyze: _analyze } = await import(path.join(ROOT, "src/recognize/index.js"));
let ocrThrew = false;
let ocrRes = null;
try {
  ocrRes = await _analyze(new Uint8Array(), { runOcr: true, runClassifier: false }, {});
} catch { ocrThrew = true; }
check("analyze(runOcr) does not throw with no deps", !ocrThrew);
check("analyze(runOcr) degrades to ocr.status 'error'", !!ocrRes && !!ocrRes.ocr && ocrRes.ocr.status === "error");

// contribute panel open / close
d.getElementById("add-cover").dispatchEvent(new window.Event("click"));
check("contribute panel opens", d.getElementById("contribute").hidden === false);
d.getElementById("contribute-close").dispatchEvent(new window.Event("click"));
check("contribute panel closes", d.getElementById("contribute").hidden === true);

// identify overlay open / close
d.getElementById("identify-link").dispatchEvent(new window.Event("click"));
check("identify overlay opens", d.getElementById("identify").hidden === false);
d.getElementById("identify-close").dispatchEvent(new window.Event("click"));
check("identify overlay closes", d.getElementById("identify").hidden === true);

// batch panel open / close
d.getElementById("batch-open").dispatchEvent(new window.Event("click"));
check("batch panel opens", d.getElementById("batch").hidden === false);
d.getElementById("batch-close").dispatchEvent(new window.Event("click"));
check("batch panel closes", d.getElementById("batch").hidden === true);

check("no jsdom errors", errors.length === 0);
if (errors.length) console.log(errors.join("\n"));
