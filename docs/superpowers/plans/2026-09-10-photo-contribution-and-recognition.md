# Photo Contribution + Origin Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-page form to contribute a manhole-cover photo (produces JSON + WebP + PR steps, no backend) plus a shared `analyze()` engine that estimates the cover's origin from EXIF GPS, Japanese OCR, and a (initially dormant) trained prefecture classifier, surfaced both in the form and as a standalone "identify a cover" tool.

**Architecture:** Everything is client-side vanilla ES modules on the existing static GitHub Pages site. A single `src/recognize/index.js#analyze()` returns independent signals (`gps`, `ocr`, `classifier`) plus a fused `combined` verdict. Heavy dependencies (`exifr`, `tesseract.js`, `onnxruntime-web`) and `data/municipalities.json` load only on user action. The contribution flow is also the labelled-data collector that eventually trains the classifier via a GitHub Action.

**Tech Stack:** Vanilla JS ES modules (no framework, no build), Node's built-in test runner (`node --test`), jsdom smoke test, Python 3.12 for data/model scripts, MapLibre GL (already present), CDN libs pinned exact: `exifr`, `tesseract.js`, `onnxruntime-web`; Python-only for `build_gazetteer.py` / `train_classifier.py`.

**Spec:** `docs/superpowers/specs/2026-09-10-photo-contribution-and-recognition-design.md`

## Global Constraints

- No backend. Static site, deployed by `.github/workflows/deploy.yml`. The form outputs files + JSON + a manual "open a PR" checklist; nothing is uploaded.
- Vanilla ES modules, no framework, no bundler/build step. Match existing `src/` style.
- First-paint weight unchanged: `exifr`, `tesseract.js`, `onnxruntime-web`, and `data/municipalities.json` must load only via lazy `import()` / `fetch` triggered by opening the form or the identify tool. Never referenced from `index.html` or imported at module top level of anything `src/main.js` pulls in on load.
- Accept only `image/jpeg` and `image/png`. Reject everything else (incl. HEIC) with a message.
- All photo processing is client-side. Exported WebP must have EXIF stripped (canvas re-encode does this).
- Contribution Feature JSON must validate against `scripts/schema.json`: `id` matches `^[a-z0-9][a-z0-9-]*$`; required props `id,name_en,prefecture_en,category,source,source_url,themes,visited`; geometry `Point` with lon ∈ [122,154], lat ∈ [20,46]; `category` for contributions is `"personal"`; `additionalProperties:false` on `properties`.
- `models/meta.json` `min_samples` is `50`.
- Prefecture names are exactly the 47 `pref_en` values in `data/prefectures.geojson` (e.g. `Tokyo`, `Hokkaido`, `Kyoto`).
- Commit messages: plain, no Claude/Claude Code attribution (enforced by `~/.claude/settings.json`).
- CDN pins: exact versions from `cdn.jsdelivr.net` or `cdnjs.cloudflare.com`; resolve the newest working version at implementation time and hard-code it in `src/config.js`.
- `src/geo.js` must stay behaviour-compatible with `scripts/lib_geo.py` (`scripts/test_geo_parity.mjs` enforces this).

---

## File Structure

**New:**

| File | Responsibility |
| --- | --- |
| `src/geo.js` | Pure geo: `pointInPolygon`, `pointInMultiPolygon`, `resolvePrefecture`, `haversine`, `nearestCover`. JS port of `scripts/lib_geo.py`. |
| `src/recognize/index.js` | `analyze(file, opts, deps)` orchestration + `fuse(signals)`. |
| `src/recognize/exif.js` | `readGps(input, deps)` — GPS from EXIF (lazy `exifr`). |
| `src/recognize/gazetteer.js` | `normalizeText`, `NOISE_WORDS`, `matchMunicipality(tokens, rows)`, `loadGazetteer()`. |
| `src/recognize/ocr.js` | `runOcr(blob, deps)` — Tesseract.js jpn (lazy). |
| `src/recognize/classifier.js` | `loadMeta()`, `classify(bitmap, deps, injected)` — dormant until a model exists. |
| `src/contribute/image.js` | `toWebp(file, maxDim, quality)`, `slugify(str)`, `randHex(n)`. |
| `src/contribute/output.js` | `buildFeature(input)`, `photoCreditsRow(input)`, `prSteps(slug)`, `download(blob, name)`. |
| `src/contribute/form.js` | Contribute panel UI + flow; exports `openContribute()`, `openContributeWith(file, analysis)`, `closeContribute()`. |
| `src/identify/view.js` | `?tool=identify` overlay; exports `openIdentify()`, `closeIdentify()`. |
| `data/municipalities.json` | Gazetteer rows (generated). |
| `models/meta.json` | Classifier metadata (seed committed). |
| `models/.gitkeep` | Keep `models/` in git. |
| `scripts/build_gazetteer.py` | Public dataset → `data/municipalities.json`. |
| `scripts/train_classifier.py` | `data/personal/*.json` + `assets/photos/*.webp` → `models/*.onnx` + `labels.json` + `meta.json`. |
| `scripts/make_fixtures.py` | Generate `test/fixtures/gps.jpg` + `nogps.jpg`. |
| `scripts/test_geo_parity.mjs` | Assert `src/geo.js` == `scripts/lib_geo.py` on sample coords. |
| `scripts/test_gazetteer_build.py` | `unittest` for `build_gazetteer.py` transform. |
| `scripts/test_train_classifier.py` | `unittest` for the "insufficient samples" gate. |
| `requirements-train.txt` | `torch`, `torchvision`, `onnx`, `onnxruntime` (only for training). |
| `test/geo.test.mjs`, `test/exif.test.mjs`, `test/fuse.test.mjs`, `test/analyze.test.mjs`, `test/image.test.mjs`, `test/contribute-output.test.mjs`, `test/gazetteer.test.mjs`, `test/classifier.test.mjs` | `node --test` unit tests. |
| `test/fixtures/gps.jpg`, `test/fixtures/nogps.jpg` | Test images. |
| `.github/workflows/train-model.yml` | Retrain on new photos → PR. |

**Modified:**

| File | Change |
| --- | --- |
| `index.html` | Add `#add-cover` button, `#contribute` panel, `#identify` overlay, footer "Identify a cover" link. |
| `style.css` | Styles for contribute panel, identify overlay, result card. |
| `src/config.js` | Add `MUNICIPALITIES_URL`, `MODEL_META_URL`, `MODEL_ONNX_URL`, `CDN` pins. |
| `src/main.js` | Wire `#add-cover`, `?tool=identify` route, contribute↔identify handoff. |
| `scripts/smoke.mjs` | Assert contribute panel toggles + builds schema-valid JSON; `?tool=identify` mounts; `analyze()` degrades gracefully with no lazy deps. |
| `scripts/validate.py` | Validate `data/municipalities.json` and `models/meta.json`. |
| `package.json` | Add `"test": "node --test test/"`; add devDep `exifr`. |
| `.github/workflows/ci.yml` | Run `npm test` and `node scripts/test_geo_parity.mjs`. |
| `README.md` | New section, privacy note, gazetteer source/licence, classifier note. |

---

## Task 1: `src/geo.js` + unit tests + `npm test`

**Files:**
- Create: `src/geo.js`
- Create: `test/geo.test.mjs`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pointInPolygon(lon, lat, polygon)` → `boolean` (`polygon` = `[outerRing, ...holes]`, ring = `[[lon,lat], ...]`)
  - `pointInMultiPolygon(lon, lat, multiPolygon)` → `boolean` (`multiPolygon` = `[polygon, ...]`)
  - `resolvePrefecture(lon, lat, prefFC)` → `{ prefecture_en: string|null, prefecture_ja: string|null, exact: boolean }` (`prefFC` = the parsed `data/prefectures.geojson` FeatureCollection; features have `properties.pref_en` / `pref_ja` and MultiPolygon/Polygon geometry)
  - `haversine(a, b)` → metres (`a`, `b` = `[lon, lat]`)
  - `nearestCover(lon, lat, coversFC)` → `{ feature, dist_m }` | `null`

- [ ] **Step 1: Write the failing test**

```js
// test/geo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pointInPolygon, pointInMultiPolygon, resolvePrefecture, haversine, nearestCover,
} from "../src/geo.js";

const prefFC = JSON.parse(readFileSync(new URL("../data/prefectures.geojson", import.meta.url)));
const coversFC = JSON.parse(readFileSync(new URL("../data/covers.geojson", import.meta.url)));

test("pointInPolygon: inside and outside a unit square", () => {
  const sq = [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]];
  assert.equal(pointInPolygon(1, 1, sq), true);
  assert.equal(pointInPolygon(3, 1, sq), false);
});

test("pointInPolygon: hole", () => {
  const withHole = [
    [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
    [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]],
  ];
  assert.equal(pointInPolygon(1, 1, withHole), true);
  assert.equal(pointInPolygon(5, 5, withHole), false);
});

test("pointInMultiPolygon: any part counts", () => {
  const mp = [
    [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    [[[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]]],
  ];
  assert.equal(pointInMultiPolygon(10.5, 10.5, mp), true);
  assert.equal(pointInMultiPolygon(5, 5, mp), false);
});

test("haversine: Tokyo Station to Osaka Station ≈ 400 km", () => {
  const d = haversine([139.767, 35.681], [135.498, 34.702]);
  assert.ok(Math.abs(d - 400000) < 30000, `got ${d}`);
});

test("resolvePrefecture: Tokyo Tower is exactly in Tokyo", () => {
  const r = resolvePrefecture(139.7454, 35.6586, prefFC);
  assert.equal(r.prefecture_en, "Tokyo");
  assert.equal(r.exact, true);
});

test("resolvePrefecture: a point just off the Okinawa coast snaps to Okinawa", () => {
  const r = resolvePrefecture(127.9, 26.2, prefFC);
  assert.equal(r.prefecture_en, "Okinawa");
});

test("nearestCover: returns the closest feature with a distance", () => {
  const f0 = coversFC.features[0];
  const [lon, lat] = f0.geometry.coordinates;
  const got = nearestCover(lon + 0.0005, lat, coversFC);
  assert.equal(got.feature.properties.id, f0.properties.id);
  assert.ok(got.dist_m < 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/geo.test.mjs`
Expected: FAIL — `Cannot find module '../src/geo.js'`.

- [ ] **Step 3: Write the implementation**

```js
// src/geo.js
// Pure geometry helpers. Behaviour must match scripts/lib_geo.py.

export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(lon, lat, polygon) {
  if (!polygon.length || !pointInRing(lon, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lon, lat, polygon[h])) return false;
  }
  return true;
}

export function pointInMultiPolygon(lon, lat, multiPolygon) {
  return multiPolygon.some((poly) => pointInPolygon(lon, lat, poly));
}

function polys(geom) {
  return geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
}

function bbox(geom) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const poly of polys(geom)) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  return [minx, miny, maxx, maxy];
}

export function resolvePrefecture(lon, lat, prefFC) {
  for (const f of prefFC.features) {
    const [minx, miny, maxx, maxy] = bbox(f.geometry);
    if (lon < minx || lon > maxx || lat < miny || lat > maxy) continue;
    if (pointInMultiPolygon(lon, lat, polys(f.geometry))) {
      return { prefecture_en: f.properties.pref_en, prefecture_ja: f.properties.pref_ja, exact: true };
    }
  }
  let best = null;
  let bestD2 = Infinity;
  for (const f of prefFC.features) {
    for (const poly of polys(f.geometry)) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          const d2 = (x - lon) ** 2 + (y - lat) ** 2;
          if (d2 < bestD2) { bestD2 = d2; best = f; }
        }
      }
    }
  }
  return best
    ? { prefecture_en: best.properties.pref_en, prefecture_ja: best.properties.pref_ja, exact: false }
    : { prefecture_en: null, prefecture_ja: null, exact: false };
}

export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestCover(lon, lat, coversFC) {
  let best = null;
  let bestD = Infinity;
  for (const f of coversFC.features) {
    const d = haversine([lon, lat], f.geometry.coordinates);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best ? { feature: best, dist_m: Math.round(bestD) } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/geo.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the `test` script and commit**

Edit `package.json` `scripts`: add `"test": "node --test"`. (Node's no-arg
default test discovery finds `**/*.test.mjs` and `**/test/**/*.{js,mjs,cjs}`,
excludes `node_modules`. Do **not** use `node --test test/` — passing the
directory is broken on Node 24.x and runs the directory itself as a failing
"test".)

```bash
git add src/geo.js test/geo.test.mjs package.json
git commit -m "feat: add src/geo.js pure geometry helpers with tests"
```

---

## Task 2: geo/Python parity test + CI wiring

**Files:**
- Create: `scripts/test_geo_parity.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `src/geo.js#resolvePrefecture`, `scripts/lib_geo.py#Prefectures.resolve`.
- Produces: an executable check (`node scripts/test_geo_parity.mjs`, exit 0/1).

- [ ] **Step 1: Write the parity script (it is the test)**

```js
// scripts/test_geo_parity.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolvePrefecture } from "../src/geo.js";

const prefFC = JSON.parse(readFileSync(new URL("../data/prefectures.geojson", import.meta.url)));

// [lon, lat] samples: city centres + a few coastal/edge points
const samples = [
  [139.7454, 35.6586], // Tokyo Tower
  [135.4959, 34.7025], // Osaka Station
  [141.3469, 43.0686], // Sapporo
  [127.6809, 26.2124], // Naha
  [130.4017, 33.5904], // Fukuoka
  [136.8816, 35.1709], // Nagoya
  [142.19, 27.09],     // Ogasawara (island, snaps)
  [130.93, 33.935],    // Kitakyushu coast (snaps)
];

const py = `
import json, sys
sys.path.insert(0, "scripts")
from lib_geo import Prefectures
p = Prefectures()
out = [list(p.resolve(lon, lat))[:2] for lon, lat in json.load(sys.stdin)]
print(json.dumps(out))
`;
const pyOut = JSON.parse(
  execFileSync("python3", ["-c", py], { input: JSON.stringify(samples) }).toString(),
);

let failures = 0;
samples.forEach(([lon, lat], i) => {
  const js = resolvePrefecture(lon, lat, prefFC);
  const [pyEn] = pyOut[i];
  if (js.prefecture_en !== pyEn) {
    failures++;
    console.error(`MISMATCH @ ${lat},${lon}: js=${js.prefecture_en} py=${pyEn}`);
  }
});
if (failures) {
  console.error(`${failures} parity mismatch(es)`);
  process.exit(1);
}
console.log(`geo parity OK (${samples.length} points)`);
```

- [ ] **Step 2: Run it**

Run: `node scripts/test_geo_parity.mjs`
Expected: `geo parity OK (8 points)`. If a coastal point mismatches, adjust that sample to a clearly-inland coordinate for the same prefecture — do not weaken either implementation.

- [ ] **Step 3: Wire into CI**

In `.github/workflows/ci.yml`, in the `checks` job after the existing `Smoke test (headless)` step, add:

```yaml
      - name: Unit tests
        run: npm test
      - name: geo parity (JS vs Python)
        run: node scripts/test_geo_parity.mjs
```

- [ ] **Step 4: Commit**

```bash
git add scripts/test_geo_parity.mjs .github/workflows/ci.yml
git commit -m "test: geo.js / lib_geo.py parity check + run unit tests in CI"
```

---

## Task 3: test image fixtures

**Files:**
- Create: `scripts/make_fixtures.py`
- Create: `test/fixtures/gps.jpg`
- Create: `test/fixtures/nogps.jpg`
- Modify: `requirements.txt` (add `piexif`)

**Interfaces:**
- Produces: `test/fixtures/gps.jpg` (64×64 JPEG, GPS EXIF at lat 35.6586 / lon 139.7454), `test/fixtures/nogps.jpg` (64×64 JPEG, no EXIF).

- [ ] **Step 1: Write the generator**

```python
# scripts/make_fixtures.py
"""Generate the two test images used by the recognition unit tests."""
import pathlib
import piexif
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / "test" / "fixtures"
LAT, LON = 35.6586, 139.7454  # Tokyo Tower


def _dms(value):
    deg = int(value)
    minutes = int((value - deg) * 60)
    sec = round((value - deg - minutes / 60) * 3600 * 100)
    return ((deg, 1), (minutes, 1), (sec, 100))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (64, 64), (90, 110, 130))

    img.save(OUT / "nogps.jpg", "JPEG", quality=80)

    gps_ifd = {
        piexif.GPSIFD.GPSLatitudeRef: "N",
        piexif.GPSIFD.GPSLatitude: _dms(LAT),
        piexif.GPSIFD.GPSLongitudeRef: "E",
        piexif.GPSIFD.GPSLongitude: _dms(LON),
    }
    exif_bytes = piexif.dump({"GPS": gps_ifd})
    img.save(OUT / "gps.jpg", "JPEG", quality=80, exif=exif_bytes)
    print(f"wrote {OUT/'gps.jpg'} and {OUT/'nogps.jpg'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add dep and run**

Append `piexif>=1.1` to `requirements.txt`.

Run: `pip install -r requirements.txt && python scripts/make_fixtures.py`
Expected: both files created. `python3 -c "import piexif,sys; print(piexif.load('test/fixtures/gps.jpg')['GPS'][piexif.GPSIFD.GPSLatitudeRef])"` prints `b'N'`.

- [ ] **Step 3: Commit**

```bash
git add scripts/make_fixtures.py test/fixtures/gps.jpg test/fixtures/nogps.jpg requirements.txt
git commit -m "test: add GPS / no-GPS JPEG fixtures"
```

---

## Task 4: `src/recognize/exif.js` — `readGps`

**Files:**
- Create: `src/recognize/exif.js`
- Create: `test/exif.test.mjs`
- Modify: `package.json` (devDep `exifr`), `src/config.js` (CDN pin)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `readGps(input, deps = {})` → `Promise<{ lat: number, lon: number } | null>`. `input` is a `Blob`/`File`/`ArrayBuffer`/`Uint8Array`. `deps.exifr` optionally injects the parser (tests pass the npm module); otherwise it lazy-imports `config.CDN.exifr`.

- [ ] **Step 1: Write the failing test**

```js
// test/exif.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as exifr from "exifr";
import { readGps } from "../src/recognize/exif.js";

const gps = readFileSync(new URL("./fixtures/gps.jpg", import.meta.url));
const nogps = readFileSync(new URL("./fixtures/nogps.jpg", import.meta.url));

test("readGps: extracts lat/lon from GPS EXIF", async () => {
  const r = await readGps(gps, { exifr });
  assert.ok(r);
  assert.ok(Math.abs(r.lat - 35.6586) < 0.01, `lat ${r.lat}`);
  assert.ok(Math.abs(r.lon - 139.7454) < 0.01, `lon ${r.lon}`);
});

test("readGps: returns null when there is no GPS", async () => {
  assert.equal(await readGps(nogps, { exifr }), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm i -D exifr && node --test test/exif.test.mjs`
Expected: FAIL — `Cannot find module '../src/recognize/exif.js'`.

- [ ] **Step 3: Implement**

Add to `src/config.js`:

```js
export const CDN = {
  // resolve the newest working versions at implementation time; pin exact.
  exifr: "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js",
  tesseractCore: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
  tesseractLang: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn@1.0.0/4.0.0",
  ort: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.mjs",
  ortWasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/",
};
export const MUNICIPALITIES_URL = "data/municipalities.json";
export const MODEL_META_URL = "models/meta.json";
export const MODEL_ONNX_URL = "models/prefecture-clf.onnx";
```

```js
// src/recognize/exif.js
import { CDN } from "../config.js";

async function getExifr(deps) {
  if (deps.exifr) return deps.exifr;
  return import(/* @vite-ignore */ CDN.exifr);
}

export async function readGps(input, deps = {}) {
  try {
    const exifr = await getExifr(deps);
    const g = await exifr.gps(input);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) {
      return { lat: g.latitude, lon: g.longitude };
    }
  } catch {
    /* no EXIF / parse failure → treat as no GPS */
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/exif.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recognize/exif.js test/exif.test.mjs src/config.js package.json package-lock.json
git commit -m "feat: readGps() — GPS from EXIF via lazy exifr"
```

---

## Task 5: `src/recognize/index.js` — `analyze()` (GPS-only) + `fuse()`

**Files:**
- Create: `src/recognize/index.js`
- Create: `test/fuse.test.mjs`
- Create: `test/analyze.test.mjs`

**Interfaces:**
- Consumes: `src/geo.js` (`resolvePrefecture`, `nearestCover`), `src/recognize/exif.js` (`readGps`), `src/config.js` (`PREFECTURES_URL`, `DATA_URL`).
- Produces:
  - `analyze(file, opts = {}, deps = {})` → `Promise<AnalysisResult>` (shape in the spec). `opts` = `{ runOcr = false, runClassifier = true }`. `deps` may inject `{ exifr, prefFC, coversFC, classify, ocr, gazetteer }` for tests; otherwise it fetches the geojson files (cached) and uses the real signal modules.
  - `fuse(signals)` → `AnalysisResult["combined"]` where `signals = { gps, ocr, classifier }`.
  - The default `deps.classify` in this task is a stub: `async () => ({ status: "unavailable", predictions: [] })`. Task 13 swaps in the real one.

- [ ] **Step 1: Write the failing tests**

```js
// test/fuse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fuse } from "../src/recognize/index.js";

test("fuse: GPS alone → high confidence, prefecture from GPS", () => {
  const c = fuse({
    gps: { prefecture_en: "Tokyo", nearestCover: { dist_m: 20 }, confidence: 0.95 },
    ocr: null,
    classifier: null,
  });
  assert.equal(c.prefecture_en, "Tokyo");
  assert.equal(c.confidence, "high");
  assert.deepEqual(c.basis, ["GPS"]);
});

test("fuse: GPS + OCR agree → basis notes the agreement", () => {
  const c = fuse({
    gps: { prefecture_en: "Kyoto", nearestCover: null, confidence: 0.95 },
    ocr: { status: "ok", municipalityGuesses: [{ name_en: "Kyoto", prefecture_en: "Kyoto", score: 0.8 }], confidence: 0.7 },
    classifier: null,
  });
  assert.equal(c.prefecture_en, "Kyoto");
  assert.equal(c.confidence, "high");
  assert.ok(c.basis.includes("OCR agrees"));
});

test("fuse: OCR only, strong → medium confidence", () => {
  const c = fuse({
    gps: null,
    ocr: { status: "ok", municipalityGuesses: [{ name_en: "Nara", prefecture_en: "Nara", score: 0.9 }], confidence: 0.65 },
    classifier: { status: "insufficient_data", predictions: [] },
  });
  assert.equal(c.prefecture_en, "Nara");
  assert.equal(c.confidence, "medium");
});

test("fuse: nothing usable → null / low", () => {
  const c = fuse({ gps: null, ocr: null, classifier: { status: "insufficient_data", predictions: [] } });
  assert.equal(c.prefecture_en, null);
  assert.equal(c.confidence, "low");
});
```

```js
// test/analyze.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as exifr from "exifr";
import { analyze } from "../src/recognize/index.js";

const prefFC = JSON.parse(readFileSync(new URL("../data/prefectures.geojson", import.meta.url)));
const coversFC = JSON.parse(readFileSync(new URL("../data/covers.geojson", import.meta.url)));
const gps = readFileSync(new URL("./fixtures/gps.jpg", import.meta.url));
const nogps = readFileSync(new URL("./fixtures/nogps.jpg", import.meta.url));

test("analyze: GPS-tagged image → Tokyo, high confidence", async () => {
  const r = await analyze(gps, {}, { exifr, prefFC, coversFC });
  assert.equal(r.gps.prefecture_en, "Tokyo");
  assert.equal(r.combined.prefecture_en, "Tokyo");
  assert.equal(r.combined.confidence, "high");
});

test("analyze: no-GPS image → gps null, does not throw", async () => {
  const r = await analyze(nogps, {}, { exifr, prefFC, coversFC });
  assert.equal(r.gps, null);
  assert.equal(r.combined.prefecture_en, null);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/fuse.test.mjs test/analyze.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/recognize/index.js
import { PREFECTURES_URL, DATA_URL } from "../config.js";
import { resolvePrefecture, nearestCover } from "../geo.js";
import { readGps } from "./exif.js";

const stubClassify = async () => ({ status: "unavailable", predictions: [] });

let _prefFC = null;
let _coversFC = null;
async function geo(deps) {
  const prefFC = deps.prefFC || _prefFC || (_prefFC = await fetch(PREFECTURES_URL).then((r) => r.json()));
  const coversFC = deps.coversFC || _coversFC || (_coversFC = await fetch(DATA_URL).then((r) => r.json()));
  return { prefFC, coversFC };
}

async function gpsSignal(file, deps) {
  const g = await readGps(file, deps);
  if (!g) return null;
  const { prefFC, coversFC } = await geo(deps);
  const pref = resolvePrefecture(g.lon, g.lat, prefFC);
  const nc = nearestCover(g.lon, g.lat, coversFC);
  return {
    lat: g.lat, lon: g.lon,
    prefecture_en: pref.prefecture_en, prefecture_ja: pref.prefecture_ja,
    nearestCover: nc
      ? { id: nc.feature.properties.id, name_en: nc.feature.properties.name_en, dist_m: nc.dist_m }
      : null,
    confidence: 0.95,
  };
}

export function fuse({ gps, ocr, classifier }) {
  const basis = [];
  let prefecture_en = null;
  let level = "low";

  if (gps && gps.prefecture_en) {
    prefecture_en = gps.prefecture_en;
    basis.push("GPS");
    level = "high";
  }

  const ocrTop = ocr && ocr.status === "ok" && ocr.municipalityGuesses[0];
  if (ocrTop && ocrTop.score >= 0.4) {
    if (!prefecture_en) {
      prefecture_en = ocrTop.prefecture_en;
      level = ocr.confidence >= 0.6 ? "medium" : "low";
      basis.push("OCR");
    } else if (ocrTop.prefecture_en === prefecture_en) {
      basis.push("OCR agrees");
      level = "high";
    }
  }

  const clfTop = classifier && classifier.status === "ok" && classifier.predictions[0];
  if (clfTop) {
    if (!prefecture_en) {
      prefecture_en = clfTop.prefecture_en;
      level = clfTop.prob >= 0.6 ? "medium" : "low";
      basis.push("classifier");
    } else if (clfTop.prefecture_en === prefecture_en) {
      basis.push("classifier agrees");
      if (level !== "high") level = "medium";
    }
  }

  let municipality = null;
  if (gps && gps.nearestCover && gps.nearestCover.dist_m < 60) {
    municipality = gps.nearestCover.name_en;
  } else if (ocrTop && ocrTop.score >= 0.6) {
    municipality = ocrTop.name_en;
  }

  return { prefecture_en, municipality, basis, confidence: level };
}

export async function analyze(file, opts = {}, deps = {}) {
  const { runOcr = false, runClassifier = true } = opts;
  const classify = deps.classify || stubClassify;

  let bitmap = null;
  try {
    bitmap = typeof createImageBitmap === "function" ? await createImageBitmap(new Blob([file])) : null;
  } catch { /* node / unsupported */ }

  const gps = await gpsSignal(file, deps);

  let ocr = null;
  if (runOcr && deps.ocr) {
    try { ocr = await deps.ocr(file, deps); }
    catch { ocr = { status: "error", rawText: "", tokens: [], municipalityGuesses: [], confidence: 0 }; }
  }

  let classifier = null;
  if (runClassifier) {
    try { classifier = await classify(bitmap, deps); }
    catch { classifier = { status: "unavailable", predictions: [] }; }
  }

  return {
    image: bitmap ? { width: bitmap.width, height: bitmap.height } : { width: 0, height: 0 },
    gps, ocr, classifier,
    combined: fuse({ gps, ocr, classifier }),
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/fuse.test.mjs test/analyze.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recognize/index.js test/fuse.test.mjs test/analyze.test.mjs
git commit -m "feat: analyze() with GPS signal + fuse()"
```

---

## Task 6: `src/contribute/image.js` — `toWebp`, `slugify`, `randHex`

**Files:**
- Create: `src/contribute/image.js`
- Create: `test/image.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `slugify(str)` → kebab-case ASCII, `[a-z0-9-]` only, collapsed dashes, trimmed; empty input → `"cover"`.
  - `randHex(n)` → lowercase hex string of length `n`.
  - `toWebp(file, maxDim, quality)` → `Promise<Blob>` (`image/webp`, longest side ≤ `maxDim`, EXIF dropped). Browser-only (uses `createImageBitmap` + canvas); not unit-tested here — covered by the browser verification step and a smoke guard.

- [ ] **Step 1: Write the failing test**

```js
// test/image.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, randHex } from "../src/contribute/image.js";

test("slugify: ascii", () => {
  assert.equal(slugify("This Number & Co!"), "this-number-co");
  assert.equal(slugify("  multiple   spaces  "), "multiple-spaces");
  assert.equal(slugify("--already--kebab--"), "already-kebab");
});

test("slugify: empty / non-ascii falls back", () => {
  assert.equal(slugify(""), "cover");
  assert.equal(slugify("京都市"), "cover");
});

test("randHex: length and charset", () => {
  const h = randHex(4);
  assert.match(h, /^[0-9a-f]{4}$/);
  assert.notEqual(randHex(8), randHex(8));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/image.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/contribute/image.js

export function slugify(str) {
  const s = String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return s || "cover";
}

export function randHex(n) {
  let out = "";
  while (out.length < n) out += Math.floor(Math.random() * 16).toString(16);
  return out.slice(0, n);
}

export async function toWebp(file, maxDim, quality) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/webp",
      quality,
    ),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/image.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/contribute/image.js test/image.test.mjs
git commit -m "feat: image helpers — toWebp / slugify / randHex"
```

---

## Task 7: `src/contribute/output.js` — feature JSON + PR steps

**Files:**
- Create: `src/contribute/output.js`
- Create: `test/contribute-output.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildFeature(input)` → a GeoJSON Feature object valid against `scripts/schema.json`. `input = { name_en, name_ja?, prefecture_en?, municipality?, themes: string[], installed?, photo_credit?, photo_license?, lon, lat, slug }`. Sets `id = slug`, `category="personal"`, `source="personal"`, `source_url="https://github.com/sofianebeloucif/manhole-japan"`, `visited=true`, `photo="assets/photos/<slug>.webp"`, `photo_thumb="assets/photos/<slug>.thumb.webp"`. Missing optional strings become `null`.
  - `photoCreditsRow(input)` → a Markdown table row string for `PHOTO_CREDITS.md`.
  - `prSteps(slug)` → a multi-line instructions string.
  - `download(blob, filename)` → triggers a browser download (DOM; not unit-tested).

- [ ] **Step 1: Write the failing test**

```js
// test/contribute-output.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildFeature, photoCreditsRow, prSteps } from "../src/contribute/output.js";

function schemaValid(obj) {
  const py = `import json,sys,jsonschema; jsonschema.validate(json.load(sys.stdin), json.load(open("scripts/schema.json")))`;
  execFileSync("python3", ["-c", py], { input: JSON.stringify(obj) });
}

const input = {
  name_en: "Shinjuku ward flower design",
  name_ja: "新宿区 花のデザイン",
  prefecture_en: "Tokyo",
  municipality: "Shinjuku, Tokyo",
  themes: ["flowers"],
  installed: "2019",
  photo_credit: "Sofiane Beloucif",
  photo_license: "own-work",
  lon: 139.7004,
  lat: 35.6902,
  slug: "personal-tokyo-shinjuku-ward-flower-design-1a2b",
};

test("buildFeature: produces schema-valid Feature", () => {
  const f = buildFeature(input);
  assert.equal(f.type, "Feature");
  assert.equal(f.properties.id, input.slug);
  assert.equal(f.properties.category, "personal");
  assert.equal(f.properties.photo, `assets/photos/${input.slug}.webp`);
  assert.deepEqual(f.geometry.coordinates, [139.7004, 35.6902]);
  schemaValid(f); // throws on invalid
});

test("buildFeature: missing optionals become null", () => {
  const f = buildFeature({ ...input, name_ja: undefined, installed: undefined, municipality: undefined });
  assert.equal(f.properties.name_ja, null);
  assert.equal(f.properties.installed, null);
  assert.equal(f.properties.municipality, null);
  schemaValid(f);
});

test("photoCreditsRow: markdown row", () => {
  const row = photoCreditsRow(input);
  assert.match(row, /^\| personal-tokyo-.*\.webp \| .*\| Sofiane Beloucif \| own-work \|/);
});

test("prSteps: mentions the two files and the data command", () => {
  const s = prSteps(input.slug);
  assert.match(s, /assets\/photos\/personal-tokyo-.*\.webp/);
  assert.match(s, /data\/personal\/mine\.json/);
  assert.match(s, /npm run data/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/contribute-output.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/contribute/output.js

const REPO = "https://github.com/sofianebeloucif/manhole-japan";
const orNull = (v) => (v === undefined || v === "" ? null : v);

export function buildFeature(input) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(input.lon), Number(input.lat)] },
    properties: {
      id: input.slug,
      name_en: input.name_en,
      name_ja: orNull(input.name_ja),
      prefecture_en: orNull(input.prefecture_en),
      prefecture_ja: null,
      municipality: orNull(input.municipality),
      category: "personal",
      themes: input.themes || [],
      photo: `assets/photos/${input.slug}.webp`,
      photo_thumb: `assets/photos/${input.slug}.thumb.webp`,
      photo_credit: orNull(input.photo_credit),
      photo_license: orNull(input.photo_license),
      installed: orNull(input.installed),
      source: "personal",
      source_url: REPO,
      visited: true,
    },
  };
}

export function photoCreditsRow(input) {
  const credit = input.photo_credit || "";
  const lic = input.photo_license || "";
  return `| ${input.slug}.webp | ${input.name_en} | ${credit} | ${lic} | own photo |`;
}

export function prSteps(slug) {
  return [
    "To publish this cover:",
    `1. Add \`assets/photos/${slug}.webp\` and \`assets/photos/${slug}.thumb.webp\` (the two files just downloaded).`,
    "2. Append the JSON above to the array in `data/personal/mine.json` (create the file as `[ ... ]` if it does not exist).",
    "3. Add the row above to `PHOTO_CREDITS.md`.",
    "4. Run `npm run data` then `npm run lint`.",
    `5. Open a pull request. Upload files at ${REPO}/upload/main/assets/photos`,
  ].join("\n");
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/contribute-output.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/contribute/output.js test/contribute-output.test.mjs
git commit -m "feat: contribute output — buildFeature / photoCreditsRow / prSteps"
```

---

## Task 8: contribute panel — HTML + CSS + `form.js` + `main.js` wiring (GPS-only)

**Files:**
- Modify: `index.html`, `style.css`, `src/main.js`
- Create: `src/contribute/form.js`
- Modify: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `src/recognize/index.js#analyze`, `src/contribute/image.js` (`toWebp`, `slugify`, `randHex`), `src/contribute/output.js` (`buildFeature`, `photoCreditsRow`, `prSteps`, `download`).
- Produces: `src/contribute/form.js` exports `openContribute()`, `openContributeWith(file, analysis)` (skips re-analysis, used by Task 12), `closeContribute()`, and `onClose(fn)`.

- [ ] **Step 1: Add DOM**

In `index.html`, inside `<section class="filters">` area add the trigger, and after `<article id="detail" …>` add the panel:

```html
<button type="button" id="add-cover" class="reset">＋ Add a cover</button>
```

```html
<section id="contribute" hidden aria-label="Add a cover">
  <button type="button" id="contribute-close" aria-label="Close">×</button>
  <h2>Add a cover</h2>
  <p class="hint">Everything stays in your browser. You get a JSON block + two
     WebP files + steps to open a pull request.</p>
  <input type="file" id="c-file" accept="image/jpeg,image/png">
  <div id="c-analysis" class="analysis" hidden></div>
  <div id="c-fields" hidden>
    <label class="field"><span>Name (English) *</span><input id="c-name-en"></label>
    <label class="field"><span>Name (Japanese)</span><input id="c-name-ja"></label>
    <label class="field"><span>Prefecture</span><select id="c-pref"></select></label>
    <label class="field"><span>Municipality</span><input id="c-muni"></label>
    <label class="field"><span>Themes (comma separated)</span><input id="c-themes"></label>
    <label class="field"><span>Installed (year)</span><input id="c-installed"></label>
    <label class="field"><span>Photo credit</span><input id="c-credit"></label>
    <label class="field"><span>Photo licence</span><input id="c-license" value="own-work"></label>
    <button type="button" id="c-build" class="reset">Build files + JSON</button>
  </div>
  <div id="c-output" hidden>
    <pre id="c-json"></pre>
    <div class="c-actions">
      <button type="button" id="c-dl-full" class="reset">Download photo.webp</button>
      <button type="button" id="c-dl-thumb" class="reset">Download thumb.webp</button>
    </div>
    <pre id="c-credits"></pre>
    <pre id="c-steps"></pre>
  </div>
</section>
```

- [ ] **Step 2: Style it**

In `style.css` add (reuse existing tokens):

```css
#contribute {
  position: absolute; top: 14px; right: 14px; width: 340px;
  max-height: calc(100dvh - 28px); overflow-y: auto; z-index: 7;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px;
}
#contribute h2 { margin: 0 0 4px; font-size: 15px; }
#contribute .hint { font-size: 11.5px; color: var(--text-dim); margin: 0 0 10px; }
#contribute-close {
  position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
  border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text); font-size: 16px; cursor: pointer;
}
#contribute input[type="file"] { font-size: 12px; margin-bottom: 10px; }
#contribute .field { margin-bottom: 8px; }
#contribute pre {
  white-space: pre-wrap; word-break: break-word; font-size: 11px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px; margin: 8px 0;
}
#contribute .c-actions { display: flex; gap: 8px; }
.analysis { font-size: 12px; background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px; margin-bottom: 10px; }
.analysis .verdict { font-weight: 600; }
.analysis .sig { color: var(--text-dim); margin-top: 4px; }
@media (max-width: 640px) {
  #contribute { top: auto; bottom: 0; right: 0; left: 0; width: 100%;
    max-height: 80dvh; border-radius: var(--radius) var(--radius) 0 0; }
}
```

- [ ] **Step 3: Implement `form.js`**

```js
// src/contribute/form.js
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
    $("c-analysis").hidden = false;
    $("c-analysis").textContent = "Please choose a JPEG or PNG. HEIC is not supported.";
    return;
  }
  current = { file, analysis: null, webpFull: null, webpThumb: null };
  current.analysis = await analyze(file, { runClassifier: true });
  renderAnalysis(current.analysis);
  prefill(current.analysis);
}

async function build() {
  const a = current.analysis || { gps: null };
  const name_en = $("c-name-en").value.trim();
  if (!name_en) { $("c-name-en").focus(); return; }
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
```

- [ ] **Step 4: Wire the button in `main.js`**

Add near the sidebar wiring in `src/main.js`:

```js
import { openContribute } from "./contribute/form.js";
document.getElementById("add-cover").addEventListener("click", openContribute);
```

- [ ] **Step 5: Extend the smoke test**

In `scripts/smoke.mjs`, after the existing checks add:

```js
d.getElementById("add-cover").dispatchEvent(new window.Event("click"));
check("contribute panel opens", d.getElementById("contribute").hidden === false);
d.getElementById("contribute-close").dispatchEvent(new window.Event("click"));
check("contribute panel closes", d.getElementById("contribute").hidden === true);
```

- [ ] **Step 6: Run everything**

Run: `npm run lint && npm test && node scripts/smoke.mjs`
Expected: lint clean, all unit tests pass, smoke prints the two new PASS lines.

- [ ] **Step 7: Browser check**

Run `npm run serve`, open `http://localhost:8777`, click **＋ Add a cover**, choose `test/fixtures/gps.jpg`: the analysis box shows `Tokyo · high confidence`, prefecture pre-selected `Tokyo`. Type a name, click **Build**: JSON appears, both download buttons produce `.webp` files that open.

- [ ] **Step 8: Commit + deploy checkpoint**

```bash
git add index.html style.css src/main.js src/contribute/form.js scripts/smoke.mjs
git commit -m "feat: + Add a cover panel (GPS-based, client-side, PR flow)"
```

Push the branch; confirm `ci.yml` is green; merge to `main`; confirm `deploy.yml` publishes and the site still loads.

---

## Task 9: `scripts/build_gazetteer.py` → `data/municipalities.json`

**Files:**
- Create: `scripts/build_gazetteer.py`
- Create: `scripts/test_gazetteer_build.py`
- Create: `data/municipalities.json` (generated, committed)
- Modify: `scripts/validate.py`

**Interfaces:**
- Produces: `data/municipalities.json` = JSON array of `{ code, name_ja, name_kana, name_en, prefecture_en, prefecture_ja, lon, lat }`, sorted by `code`, deduped.
- `build_gazetteer.py` exposes `rows_from_records(records)` (pure transform) for the unit test.

- [ ] **Step 1: Write the failing unit test**

```python
# scripts/test_gazetteer_build.py
import unittest
from build_gazetteer import rows_from_records

SAMPLE = [
    {"code": "13104", "pref_ja": "東京都", "pref_en": "Tokyo",
     "city_ja": "新宿区", "city_kana": "シンジュクク", "lon": 139.7036, "lat": 35.6938},
    {"code": "13104", "pref_ja": "東京都", "pref_en": "Tokyo",
     "city_ja": "新宿区", "city_kana": "シンジュクク", "lon": 139.7036, "lat": 35.6938},
    {"code": "26100", "pref_ja": "京都府", "pref_en": "Kyoto",
     "city_ja": "京都市", "city_kana": "キョウトシ", "lon": 135.7681, "lat": 35.0116},
]


class T(unittest.TestCase):
    def test_dedupe_and_shape(self):
        rows = rows_from_records(SAMPLE)
        self.assertEqual(len(rows), 2)
        r = [x for x in rows if x["code"] == "13104"][0]
        self.assertEqual(r["name_ja"], "新宿区")
        self.assertEqual(r["prefecture_en"], "Tokyo")
        self.assertIsInstance(r["lon"], float)
        self.assertEqual(set(r), {
            "code", "name_ja", "name_kana", "name_en",
            "prefecture_en", "prefecture_ja", "lon", "lat",
        })

    def test_sorted_by_code(self):
        rows = rows_from_records(SAMPLE)
        self.assertEqual([r["code"] for r in rows], ["13104", "26100"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd scripts && python -m unittest test_gazetteer_build -v`
Expected: FAIL — `No module named 'build_gazetteer'`.

- [ ] **Step 3: Implement**

```python
# scripts/build_gazetteer.py
"""Build data/municipalities.json from a public municipality dataset.

Source: geolonia/japanese-addresses  latest.csv
  https://raw.githubusercontent.com/geolonia/japanese-addresses/master/data/latest.csv
  (columns include: 都道府県コード, 都道府県名, 市区町村コード, 市区町村名,
   市区町村名カナ, 緯度, 経度). Licence: see that repository (recorded in README).
Fallback if the URL changes: any CSV with prefecture / municipality / kana /
lat / lon columns; adapt _records_from_csv().
"""
from __future__ import annotations

import csv
import io
import json
import pathlib
import sys

import requests

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "municipalities.json"
SRC = "https://raw.githubusercontent.com/geolonia/japanese-addresses/master/data/latest.csv"

PREF_EN = {
    "北海道": "Hokkaido", "青森県": "Aomori", "岩手県": "Iwate", "宮城県": "Miyagi",
    "秋田県": "Akita", "山形県": "Yamagata", "福島県": "Fukushima", "茨城県": "Ibaraki",
    "栃木県": "Tochigi", "群馬県": "Gunma", "埼玉県": "Saitama", "千葉県": "Chiba",
    "東京都": "Tokyo", "神奈川県": "Kanagawa", "新潟県": "Niigata", "富山県": "Toyama",
    "石川県": "Ishikawa", "福井県": "Fukui", "山梨県": "Yamanashi", "長野県": "Nagano",
    "岐阜県": "Gifu", "静岡県": "Shizuoka", "愛知県": "Aichi", "三重県": "Mie",
    "滋賀県": "Shiga", "京都府": "Kyoto", "大阪府": "Osaka", "兵庫県": "Hyogo",
    "奈良県": "Nara", "和歌山県": "Wakayama", "鳥取県": "Tottori", "島根県": "Shimane",
    "岡山県": "Okayama", "広島県": "Hiroshima", "山口県": "Yamaguchi", "徳島県": "Tokushima",
    "香川県": "Kagawa", "愛媛県": "Ehime", "高知県": "Kochi", "福岡県": "Fukuoka",
    "佐賀県": "Saga", "長崎県": "Nagasaki", "熊本県": "Kumamoto", "大分県": "Oita",
    "宮崎県": "Miyazaki", "鹿児島県": "Kagoshima", "沖縄県": "Okinawa",
}


def _records_from_csv(text: str):
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        pref_ja = row.get("都道府県名") or row.get("pref")
        city_ja = row.get("市区町村名") or row.get("city")
        if not pref_ja or not city_ja:
            continue
        try:
            lat = float(row.get("緯度") or row.get("lat"))
            lon = float(row.get("経度") or row.get("lng") or row.get("lon"))
        except (TypeError, ValueError):
            continue
        yield {
            "code": (row.get("市区町村コード") or row.get("code") or "").strip(),
            "pref_ja": pref_ja.strip(),
            "pref_en": PREF_EN.get(pref_ja.strip(), pref_ja.strip()),
            "city_ja": city_ja.strip(),
            "city_kana": (row.get("市区町村名カナ") or "").strip(),
            "lon": lon,
            "lat": lat,
        }


def rows_from_records(records) -> list[dict]:
    seen = {}
    for r in records:
        key = (r["code"], r["city_ja"])
        if key in seen:
            continue
        seen[key] = {
            "code": r["code"],
            "name_ja": r["city_ja"],
            "name_kana": r["city_kana"],
            "name_en": r["city_ja"],  # romaji not in source; keep JA (UI shows both)
            "prefecture_en": r["pref_en"],
            "prefecture_ja": r["pref_ja"],
            "lon": float(r["lon"]),
            "lat": float(r["lat"]),
        }
    return sorted(seen.values(), key=lambda x: (x["code"], x["name_ja"]))


def main() -> None:
    print(f"Fetching {SRC}")
    text = requests.get(SRC, timeout=120).text
    rows = rows_from_records(_records_from_csv(text))
    if len(rows) < 1000:
        sys.exit(f"only {len(rows)} municipalities — source format likely changed")
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} municipalities -> {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the unit test — it passes**

Run: `cd scripts && python -m unittest test_gazetteer_build -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Build the real file**

Run: `python scripts/build_gazetteer.py`
Expected: `wrote NNNN municipalities` with `NNNN` between ~1700 and ~2000.

If the source URL 404s, find geolonia's current `latest.csv` path (or an equivalent municipalities CSV) and update `SRC` + column names in `_records_from_csv`.

- [ ] **Step 6: Add the validate.py check**

In `scripts/validate.py`, before `return 0`, add:

```python
    gaz = ROOT / "data" / "municipalities.json"
    if gaz.exists():
        rows = json.loads(gaz.read_text(encoding="utf-8"))
        if not isinstance(rows, list) or len(rows) < 1000:
            print("municipalities.json: expected a list of >= 1000 rows", file=sys.stderr)
            return 1
        need = {"code", "name_ja", "name_kana", "name_en",
                "prefecture_en", "prefecture_ja", "lon", "lat"}
        for r in rows[:50]:
            if set(r) != need:
                print(f"municipalities.json: bad row keys {sorted(r)}", file=sys.stderr)
                return 1
            if not (122 <= r["lon"] <= 154 and 20 <= r["lat"] <= 46):
                print(f"municipalities.json: coord out of range {r['code']}", file=sys.stderr)
                return 1
```

- [ ] **Step 7: Commit**

```bash
git add scripts/build_gazetteer.py scripts/test_gazetteer_build.py data/municipalities.json scripts/validate.py
git commit -m "feat: municipality gazetteer (data/municipalities.json) + build script"
```

---

## Task 10: `src/recognize/gazetteer.js` — matching

**Files:**
- Create: `src/recognize/gazetteer.js`
- Create: `test/gazetteer.test.mjs`

**Interfaces:**
- Consumes: `src/config.js#MUNICIPALITIES_URL`.
- Produces:
  - `normalizeText(s)` → NFKC, remove whitespace.
  - `NOISE_WORDS` → `Set<string>`.
  - `matchMunicipality(tokens, rows)` → `[{ name_ja, name_en, prefecture_en, score }]` top 5, `score >= 0.4`, best first.
  - `loadGazetteer()` → `Promise<rows[]>` (fetch + cache `MUNICIPALITIES_URL`).

- [ ] **Step 1: Write the failing test**

```js
// test/gazetteer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchMunicipality, normalizeText, NOISE_WORDS } from "../src/recognize/gazetteer.js";

const ROWS = [
  { code: "13104", name_ja: "新宿区", name_en: "新宿区", prefecture_en: "Tokyo", prefecture_ja: "東京都", lon: 139.7, lat: 35.69 },
  { code: "26100", name_ja: "京都市", name_en: "京都市", prefecture_en: "Kyoto", prefecture_ja: "京都府", lon: 135.76, lat: 35.01 },
  { code: "27100", name_ja: "大阪市", name_en: "大阪市", prefecture_en: "Osaka", prefecture_ja: "大阪府", lon: 135.5, lat: 34.69 },
];

test("normalizeText: NFKC + strips spaces", () => {
  assert.equal(normalizeText("京 都 市"), "京都市");
});

test("matchMunicipality: exact hit wins", () => {
  const g = matchMunicipality(["京都市", "おすい"], ROWS);
  assert.equal(g[0].prefecture_en, "Kyoto");
  assert.equal(g[0].score, 1);
});

test("matchMunicipality: partial 京都 still matches 京都市", () => {
  const g = matchMunicipality(["京都"], ROWS);
  assert.equal(g[0].prefecture_en, "Kyoto");
  assert.ok(g[0].score >= 0.6 && g[0].score < 1);
});

test("matchMunicipality: noise-only tokens → empty", () => {
  assert.deepEqual(matchMunicipality(["おすい", "汚水", "仕切弁"], ROWS), []);
});

test("NOISE_WORDS covers the common cast words", () => {
  for (const w of ["おすい", "汚水", "雨水", "下水道"]) assert.ok(NOISE_WORDS.has(w));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/gazetteer.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/recognize/gazetteer.js
import { MUNICIPALITIES_URL } from "../config.js";

export function normalizeText(s) {
  return String(s || "").normalize("NFKC").replace(/\s+/g, "");
}

export const NOISE_WORDS = new Set([
  "市", "区", "町", "村", "おすい", "汚水", "うすい", "雨水", "合流",
  "下水", "下水道", "公共", "仕切弁", "制水弁", "消火栓", "空気弁", "量水器",
  "電気", "通信", "ガス", "国土交通省", "日本下水道協会",
]);

function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}

function dice(a, b) {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function scoreToken(token, name) {
  if (token === name) return 1;
  if (name.includes(token) || token.includes(name)) return 0.8;
  return dice(token, name);
}

export function matchMunicipality(tokens, rows) {
  const clean = [...new Set(tokens.map(normalizeText))].filter(
    (t) => t.length >= 2 && !NOISE_WORDS.has(t),
  );
  if (!clean.length) return [];
  const scored = [];
  for (const r of rows) {
    let best = 0;
    for (const t of clean) {
      best = Math.max(best, scoreToken(t, normalizeText(r.name_ja)));
      if (r.name_kana) best = Math.max(best, scoreToken(t, normalizeText(r.name_kana)));
    }
    if (best >= 0.4) {
      scored.push({
        name_ja: r.name_ja, name_en: r.name_en,
        prefecture_en: r.prefecture_en, score: Number(best.toFixed(3)),
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

let _rows = null;
export async function loadGazetteer() {
  if (!_rows) _rows = await fetch(MUNICIPALITIES_URL).then((r) => r.json());
  return _rows;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/gazetteer.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recognize/gazetteer.js test/gazetteer.test.mjs
git commit -m "feat: gazetteer matching (normalize + noise words + fuzzy)"
```

---

## Task 11: `src/recognize/ocr.js` + wire OCR into `analyze()` and the form

**Files:**
- Create: `src/recognize/ocr.js`
- Modify: `src/recognize/index.js`, `src/contribute/form.js`, `index.html`, `scripts/smoke.mjs`
- Modify: `test/fuse.test.mjs` (add cases — already covered by Task 5's `fuse` cases; extend for classifier-agrees), `test/analyze.test.mjs` (OCR-error degradation)

**Interfaces:**
- Consumes: `src/config.js#CDN`, `src/recognize/gazetteer.js` (`matchMunicipality`, `loadGazetteer`).
- Produces: `runOcr(blob, deps = {})` → `Promise<{ rawText: string, tokens: string[] }>`. `deps.tesseract` optionally injects a `{ recognize }`-compatible object; otherwise lazy-loads `CDN.tesseract`.
- `analyze()` gains: when `opts.runOcr`, it lazy-loads `runOcr` + `loadGazetteer` internally (unless `deps.ocr` / `deps.gazetteer` injected), builds the `ocr` signal `{ status, rawText, tokens, municipalityGuesses, confidence }`.

- [ ] **Step 1: Write the failing test (degradation + fusion)**

```js
// add to test/analyze.test.mjs
import { analyze } from "../src/recognize/index.js";

test("analyze: runOcr with a failing OCR dep → ocr.status 'error', no throw", async () => {
  const failingOcr = async () => { throw new Error("no wasm in node"); };
  const r = await analyze(
    JSON.parse("null") ?? new Uint8Array(),
    { runOcr: true, runClassifier: false },
    { exifr: (await import("exifr")), prefFC, coversFC, ocr: failingOcr },
  );
  assert.equal(r.ocr.status, "error");
});

test("analyze: injected OCR that yields a municipality feeds fuse", async () => {
  const ocr = async () => ({
    status: "ok",
    rawText: "京都市 おすい",
    tokens: ["京都市", "おすい"],
    municipalityGuesses: [{ name_ja: "京都市", name_en: "京都市", prefecture_en: "Kyoto", score: 1 }],
    confidence: 0.7,
  });
  const r = await analyze(new Uint8Array(), { runOcr: true, runClassifier: false }, { prefFC, coversFC, ocr });
  assert.equal(r.combined.prefecture_en, "Kyoto");
});
```

(Guard the first test's odd input: `analyze` must tolerate a zero-length `Uint8Array` — `gpsSignal` returns `null`, `createImageBitmap` is absent in node.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/analyze.test.mjs`
Expected: FAIL — `analyze` does not yet handle `deps.ocr` producing the signal object / the injected-ocr path.

- [ ] **Step 3: Implement `ocr.js`**

```js
// src/recognize/ocr.js
import { CDN } from "../config.js";

async function getTesseract(deps) {
  if (deps.tesseract) return deps.tesseract;
  return import(/* @vite-ignore */ CDN.tesseract);
}

function preprocess(bitmap) {
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = g > 135 ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function runOcr(blob, deps = {}) {
  const Tesseract = await getTesseract(deps);
  const bitmap = await createImageBitmap(blob instanceof Blob ? blob : new Blob([blob]));
  const canvas = preprocess(bitmap);
  const { data } = await Tesseract.recognize(canvas, "jpn+jpn_vert", {
    corePath: CDN.tesseractCore,
    langPath: CDN.tesseractLang,
  });
  const rawText = (data.text || "").trim();
  const tokens = [
    ...new Set(rawText.split(/[\s、。・()（）\d]+/u).map((s) => s.trim()).filter((s) => s.length >= 2)),
  ];
  return { rawText, tokens };
}
```

- [ ] **Step 4: Extend `analyze()` in `src/recognize/index.js`**

Replace the `runOcr` block in `analyze()` with:

```js
  let ocr = null;
  if (runOcr) {
    try {
      const ocrFn = deps.ocr || (await import("./ocr.js")).runOcr;
      const gaz = deps.gazetteer || (await import("./gazetteer.js")).loadGazetteer;
      const raw = await ocrFn(file, deps);
      // ocrFn may already return a full signal (tests) or just {rawText,tokens}
      if (raw.status) {
        ocr = raw;
      } else {
        const rows = typeof gaz === "function" ? await gaz() : gaz;
        const guesses = (await import("./gazetteer.js")).matchMunicipality(raw.tokens, rows);
        ocr = {
          status: "ok",
          rawText: raw.rawText,
          tokens: raw.tokens,
          municipalityGuesses: guesses,
          confidence: guesses.length ? Math.min(0.7, guesses[0].score) : 0.2,
        };
      }
    } catch {
      ocr = { status: "error", rawText: "", tokens: [], municipalityGuesses: [], confidence: 0 };
    }
  }
```

- [ ] **Step 5: Add the OCR button to the form**

`index.html` — inside `#c-analysis` area add `<button type="button" id="c-ocr" class="reset">Read the cover text (OCR)</button>` (or append it in `renderAnalysis`). In `src/contribute/form.js` `renderAnalysis`, append the button and wire:

```js
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "reset"; btn.textContent = "Read the cover text (OCR)";
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = "Reading… (downloads ~15 MB once)";
    current.analysis = await analyze(current.file, { runOcr: true, runClassifier: true });
    renderAnalysis(current.analysis);
    prefill(current.analysis);
  };
  box.appendChild(btn);
```

- [ ] **Step 6: Smoke guard**

In `scripts/smoke.mjs` (OCR can't run in jsdom) assert `analyze` with `runOcr:true` and no deps resolves without throwing:

```js
import { analyze as _analyze } from "../src/recognize/index.js";
const ocrRes = await _analyze(new Uint8Array(), { runOcr: true, runClassifier: false }, {});
check("analyze(runOcr) degrades gracefully", ocrRes.ocr && ocrRes.ocr.status === "error");
```

- [ ] **Step 7: Run everything**

Run: `npm run lint && npm test && node scripts/smoke.mjs`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/recognize/ocr.js src/recognize/index.js src/contribute/form.js index.html scripts/smoke.mjs test/analyze.test.mjs
git commit -m "feat: OCR signal (Tesseract.js jpn) + gazetteer match in analyze()"
```

---

## Task 12: standalone "identify a cover" tool

**Files:**
- Create: `src/identify/view.js`
- Modify: `index.html`, `style.css`, `src/main.js`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `src/recognize/index.js#analyze`, `src/contribute/form.js#openContributeWith`, the map view object from `src/map.js` (already exposes `flyToFeature`, `highlightPrefecture`, `setCovers` — reuse `map`/`view` from `main.js`).
- Produces: `openIdentify()`, `closeIdentify()` exported from `src/identify/view.js`.

- [ ] **Step 1: Add DOM + CSS**

`index.html` — add a footer link inside `.credits`:
`<a href="?tool=identify" id="identify-link">Identify a cover</a>` and the overlay:

```html
<div id="identify" hidden aria-label="Identify a cover">
  <button type="button" id="identify-close" aria-label="Close">×</button>
  <div class="id-grid">
    <div class="id-left">
      <input type="file" id="id-file" accept="image/jpeg,image/png">
      <img id="id-preview" alt="" hidden>
    </div>
    <div class="id-right" id="id-result"></div>
  </div>
</div>
```

`style.css`:

```css
#identify { position: absolute; inset: 0; z-index: 20; background: var(--bg);
  padding: 20px; overflow-y: auto; }
#identify-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px;
  border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text); font-size: 18px; cursor: pointer; }
.id-grid { display: grid; grid-template-columns: minmax(200px, 360px) 1fr; gap: 20px; max-width: 900px; margin: 40px auto 0; }
#id-preview { width: 100%; border-radius: 10px; }
.id-right .verdict { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.id-right .sig { border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 12.5px; }
@media (max-width: 640px) { .id-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Implement `view.js`**

```js
// src/identify/view.js
import { analyze } from "../recognize/index.js";
import { openContributeWith } from "../contribute/form.js";

const $ = (id) => document.getElementById(id);
let mapView = null;
let last = { file: null, analysis: null };

export function bindMap(view) { mapView = view; }

function render(a) {
  const c = a.combined;
  const box = $("id-result");
  box.innerHTML =
    `<div class="verdict">${c.prefecture_en || "Origin unknown"} · ${c.confidence} confidence</div>` +
    `<div class="sig"><b>GPS</b><br>${a.gps
      ? `${a.gps.prefecture_en} — nearest known cover ${a.gps.nearestCover ? `${a.gps.nearestCover.name_en} (${a.gps.nearestCover.dist_m} m)` : "none"}`
      : "no GPS in this photo"}</div>` +
    `<div class="sig"><b>OCR</b><br>${a.ocr && a.ocr.status === "ok"
      ? `read: “${a.ocr.rawText.replace(/\n/g, " ").slice(0, 80)}” → ${a.ocr.municipalityGuesses.map((g) => `${g.name_ja} (${g.prefecture_en})`).join(", ") || "no match"}`
      : a.ocr ? a.ocr.status : "not run"}</div>` +
    `<div class="sig"><b>Classifier</b><br>${a.classifier && a.classifier.status === "ok"
      ? a.classifier.predictions.map((p) => `${p.prefecture_en} ${(p.prob * 100).toFixed(0)}%`).join(", ")
      : a.classifier && a.classifier.status === "insufficient_data"
      ? `not enough data yet (${a.classifier.have}/${a.classifier.need}) — contribute photos to train it`
      : "unavailable"}</div>` +
    `<div class="sig">Basis: ${c.basis.join(", ") || "—"}</div>` +
    `<button type="button" id="id-accept" class="reset">Looks right → add this as a cover</button>`;
  $("id-accept").onclick = () => { closeIdentify(); openContributeWith(last.file, last.analysis); };

  if (mapView && a.gps) {
    mapView.flyToFeature({ geometry: { coordinates: [a.gps.lon, a.gps.lat] } });
    mapView.highlightPrefecture(a.gps.prefecture_en);
  }
}

async function onFile(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) { $("id-result").textContent = "JPEG or PNG only."; return; }
  const url = URL.createObjectURL(file);
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
  if (location.search.includes("tool=identify")) history.replaceState(null, "", location.pathname);
}

$("identify-close").addEventListener("click", closeIdentify);
$("id-file").addEventListener("change", (e) => e.target.files[0] && onFile(e.target.files[0]));
$("identify-link").addEventListener("click", (e) => { e.preventDefault(); openIdentify(); });
```

- [ ] **Step 3: Route it in `main.js`**

```js
import { openIdentify, bindMap as bindIdentifyMap } from "./identify/view.js";
bindIdentifyMap(view); // `view` is the object returned by createMap()
if (new URLSearchParams(location.search).get("tool") === "identify") openIdentify();
```

- [ ] **Step 4: Smoke**

```js
d.getElementById("identify-link").dispatchEvent(new window.Event("click"));
check("identify overlay opens", d.getElementById("identify").hidden === false);
d.getElementById("identify-close").dispatchEvent(new window.Event("click"));
check("identify overlay closes", d.getElementById("identify").hidden === true);
```

- [ ] **Step 5: Run + browser check**

`npm run lint && npm test && node scripts/smoke.mjs` — green.
`npm run serve`, open `http://localhost:8777/?tool=identify`, drop `test/fixtures/gps.jpg`: verdict shows `Tokyo · high confidence`, GPS sig populated, classifier sig says "not enough data yet (0/50)". Click "Looks right" → contribute panel opens pre-filled.

- [ ] **Step 6: Commit + deploy checkpoint**

```bash
git add src/identify/view.js index.html style.css src/main.js scripts/smoke.mjs
git commit -m "feat: standalone 'identify a cover' tool (?tool=identify)"
```

Push branch → CI green → merge → deploy → site loads and `?tool=identify` works.

---

## Task 13: classifier module + seed metadata (dormant path)

**Files:**
- Create: `src/recognize/classifier.js`, `models/meta.json`, `models/.gitkeep`
- Create: `test/classifier.test.mjs`
- Modify: `src/recognize/index.js` (default `classify`), `scripts/validate.py`

**Interfaces:**
- Consumes: `src/config.js` (`MODEL_META_URL`, `MODEL_ONNX_URL`, `CDN`).
- Produces:
  - `loadMeta(injected)` → `Promise<meta>` (fetch `MODEL_META_URL`, cache; `injected` overrides for tests).
  - `classify(bitmap, deps = {}, injected = {})` → `Promise<{ status, have?, need?, predictions }>`. `injected.meta` / `injected.ort` override the fetch / lazy import.
- `src/recognize/index.js` default `deps.classify` becomes `classify` from this module.

- [ ] **Step 1: Seed `models/meta.json` + `.gitkeep`**

```json
{
  "n_samples": 0,
  "trained_at": null,
  "classes": [],
  "val_accuracy": null,
  "input_size": 224,
  "min_samples": 50
}
```

`models/.gitkeep` — empty file.

- [ ] **Step 2: Write the failing test**

```js
// test/classifier.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/recognize/classifier.js";

test("classify: below min_samples → insufficient_data", async () => {
  const r = await classify(null, {}, { meta: { n_samples: 12, min_samples: 50, classes: [] } });
  assert.equal(r.status, "insufficient_data");
  assert.equal(r.have, 12);
  assert.equal(r.need, 50);
  assert.deepEqual(r.predictions, []);
});

test("classify: no meta at all → unavailable", async () => {
  const r = await classify(null, {}, { meta: null });
  assert.equal(r.status, "unavailable");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/classifier.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `classifier.js`**

```js
// src/recognize/classifier.js
import { MODEL_META_URL, MODEL_ONNX_URL, CDN } from "../config.js";

let _meta;
let _session;

export async function loadMeta(injected) {
  if (injected && "meta" in injected) return injected.meta;
  if (_meta === undefined) {
    try { _meta = await fetch(MODEL_META_URL).then((r) => (r.ok ? r.json() : null)); }
    catch { _meta = null; }
  }
  return _meta;
}

function preprocess(bitmap, size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(bitmap, 0, 0, size, size);
  const { data } = c.getContext("2d").getImageData(0, 0, size, size);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const out = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) {
    for (let ch = 0; ch < 3; ch++) {
      out[ch * size * size + i] = (data[i * 4 + ch] / 255 - mean[ch]) / std[ch];
    }
  }
  return out;
}

function softmax(arr) {
  const m = Math.max(...arr);
  const ex = arr.map((v) => Math.exp(v - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

export async function classify(bitmap, deps = {}, injected = {}) {
  const meta = await loadMeta(injected);
  if (!meta) return { status: "unavailable", predictions: [] };
  if (!meta.n_samples || meta.n_samples < meta.min_samples || !meta.classes.length) {
    return { status: "insufficient_data", have: meta.n_samples || 0, need: meta.min_samples, predictions: [] };
  }
  if (!bitmap) return { status: "unavailable", predictions: [] };
  try {
    const ort = injected.ort || deps.ort || (await import(/* @vite-ignore */ CDN.ort));
    ort.env.wasm.wasmPaths = CDN.ortWasm;
    if (!_session) _session = await ort.InferenceSession.create(MODEL_ONNX_URL);
    const size = meta.input_size || 224;
    const input = new ort.Tensor("float32", preprocess(bitmap, size), [1, 3, size, size]);
    const out = await _session.run({ [_session.inputNames[0]]: input });
    const logits = Array.from(out[_session.outputNames[0]].data);
    const probs = softmax(logits);
    const top = probs
      .map((prob, i) => ({ prefecture_en: meta.classes[i], prob }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 3);
    return { status: "ok", predictions: top };
  } catch {
    return { status: "unavailable", predictions: [] };
  }
}
```

- [ ] **Step 5: Swap the stub in `analyze()`**

In `src/recognize/index.js` replace `const stubClassify = …` and its use:

```js
import { classify as defaultClassify } from "./classifier.js";
// ...
const classify = deps.classify || defaultClassify;
```

- [ ] **Step 6: validate.py — meta shape**

In `scripts/validate.py` add:

```python
    meta_p = ROOT / "models" / "meta.json"
    if meta_p.exists():
        m = json.loads(meta_p.read_text(encoding="utf-8"))
        need = {"n_samples", "trained_at", "classes", "val_accuracy", "input_size", "min_samples"}
        if set(m) != need:
            print(f"models/meta.json: bad keys {sorted(m)}", file=sys.stderr)
            return 1
```

- [ ] **Step 7: Run everything**

Run: `npm run lint && npm test && node scripts/smoke.mjs && python scripts/validate.py`
Expected: all green; `analyze()` on the GPS fixture still returns `classifier.status === "insufficient_data"` (Task 5's analyze test may need its assertion relaxed from `classifier` stub to `insufficient_data` — update it).

- [ ] **Step 8: Commit**

```bash
git add src/recognize/classifier.js src/recognize/index.js models/meta.json models/.gitkeep test/classifier.test.mjs scripts/validate.py test/analyze.test.mjs
git commit -m "feat: classifier module (insufficient_data path) + ONNX inference (dormant)"
```

---

## Task 14: `scripts/train_classifier.py` + gate test

**Files:**
- Create: `scripts/train_classifier.py`, `scripts/test_train_classifier.py`, `requirements-train.txt`

**Interfaces:**
- Produces: `main()` that reads `data/personal/*.json` + `assets/photos/*.webp`; if labelled-sample count `< min_samples`, only rewrites `models/meta.json` with the count and exits 0; otherwise trains `mobilenet_v3_small`, writes `models/prefecture-clf.onnx`, `models/prefecture-clf.int8.onnx`, `models/labels.json`, `models/meta.json`.
- Exposes `collect_samples(personal_dir, photos_dir)` → `[(photo_path, prefecture_en)]` (pure, tested).

- [ ] **Step 1: Write the failing gate test**

```python
# scripts/test_train_classifier.py
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


class GateTest(unittest.TestCase):
    def test_below_min_samples_only_updates_meta(self):
        root = pathlib.Path(__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            (tmp / "data" / "personal").mkdir(parents=True)
            (tmp / "assets" / "photos").mkdir(parents=True)
            (tmp / "models").mkdir()
            (tmp / "models" / "meta.json").write_text(json.dumps({
                "n_samples": 0, "trained_at": None, "classes": [],
                "val_accuracy": None, "input_size": 224, "min_samples": 50,
            }))
            for i in range(3):
                (tmp / "assets" / "photos" / f"p{i}.webp").write_bytes(b"x")
                (tmp / "data" / "personal" / f"p{i}.json").write_text(json.dumps([{
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [139.7, 35.68]},
                    "properties": {"id": f"personal-x-{i}", "name_en": "x",
                                   "prefecture_en": "Tokyo", "category": "personal",
                                   "themes": [], "source": "personal",
                                   "source_url": "u", "visited": True,
                                   "photo": f"assets/photos/p{i}.webp"},
                }]))
            r = subprocess.run(
                [sys.executable, str(root / "scripts" / "train_classifier.py")],
                cwd=tmp, capture_output=True, text=True,
            )
            self.assertEqual(r.returncode, 0, r.stderr)
            meta = json.loads((tmp / "models" / "meta.json").read_text())
            self.assertEqual(meta["n_samples"], 3)
            self.assertFalse((tmp / "models" / "prefecture-clf.onnx").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd scripts && python -m unittest test_train_classifier -v`
Expected: FAIL — `train_classifier.py` missing.

- [ ] **Step 3: Implement**

```python
# scripts/train_classifier.py
"""Train a prefecture classifier from contributed personal photos.

Under models/min_samples labelled photos: only refresh models/meta.json with the
count and exit. Otherwise fine-tune mobilenet_v3_small and export ONNX.

Heavy deps (torch, torchvision, onnx) live in requirements-train.txt and are
imported lazily so the gate path runs with the base requirements only.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path.cwd()
MODELS = ROOT / "models"
META = MODELS / "meta.json"


def collect_samples(personal_dir: pathlib.Path, photos_dir: pathlib.Path):
    out = []
    for jf in sorted(personal_dir.glob("*.json")):
        if jf.name.startswith("_"):
            continue
        entries = json.loads(jf.read_text(encoding="utf-8"))
        for e in entries if isinstance(entries, list) else [entries]:
            p = e.get("properties", {})
            photo = p.get("photo")
            pref = p.get("prefecture_en")
            if not photo or not pref:
                continue
            path = ROOT / photo
            if path.exists() or (photos_dir / pathlib.Path(photo).name).exists():
                out.append((path, pref))
    return out


def _write_meta(n, classes=None, acc=None, trained=None, input_size=224, min_samples=50):
    META.write_text(json.dumps({
        "n_samples": n,
        "trained_at": trained,
        "classes": classes or [],
        "val_accuracy": acc,
        "input_size": input_size,
        "min_samples": min_samples,
    }, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    MODELS.mkdir(exist_ok=True)
    min_samples = json.loads(META.read_text())["min_samples"] if META.exists() else 50
    samples = collect_samples(ROOT / "data" / "personal", ROOT / "assets" / "photos")
    n = len(samples)
    print(f"{n} labelled photo(s); need {min_samples}")

    if n < min_samples:
        _write_meta(n, min_samples=min_samples)
        print("below threshold — refreshed models/meta.json only")
        return

    import torch
    from torch import nn
    from torch.utils.data import DataLoader, Dataset
    import torchvision.transforms as T
    from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
    from PIL import Image

    prefs = sorted({p for _, p in samples})
    # region fallback when too few classes are populated enough
    counts = {p: sum(1 for _, q in samples if q == p) for p in prefs}
    if sum(1 for p in prefs if counts[p] >= 3) < 4:
        raise SystemExit("not enough per-prefecture samples; add region-fallback labels first")
    idx = {p: i for i, p in enumerate(prefs)}

    tf = T.Compose([
        T.Resize((224, 224)),
        T.RandomHorizontalFlip(),
        T.ColorJitter(0.2, 0.2, 0.2),
        T.ToTensor(),
        T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    class DS(Dataset):
        def __init__(self, rows):
            self.rows = rows

        def __len__(self):
            return len(self.rows)

        def __getitem__(self, i):
            path, pref = self.rows[i]
            return tf(Image.open(path).convert("RGB")), idx[pref]

    torch.manual_seed(0)
    perm = torch.randperm(n).tolist()
    cut = max(1, int(n * 0.2))
    val_rows = [samples[i] for i in perm[:cut]]
    train_rows = [samples[i] for i in perm[cut:]]

    model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(prefs))
    opt = torch.optim.Adam(model.parameters(), lr=1e-4)
    lossf = nn.CrossEntropyLoss()
    tl = DataLoader(DS(train_rows), batch_size=16, shuffle=True)
    vl = DataLoader(DS(val_rows), batch_size=16)

    best_acc = 0.0
    for epoch in range(12):
        model.train()
        for x, y in tl:
            opt.zero_grad()
            lossf(model(x), y).backward()
            opt.step()
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for x, y in vl:
                correct += (model(x).argmax(1) == y).sum().item()
                total += len(y)
        acc = correct / max(1, total)
        print(f"epoch {epoch}: val_acc={acc:.3f}")
        best_acc = max(best_acc, acc)

    model.eval()
    dummy = torch.zeros(1, 3, 224, 224)
    onnx_path = MODELS / "prefecture-clf.onnx"
    torch.onnx.export(
        model, dummy, str(onnx_path), opset_version=17,
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}},
    )
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantize_dynamic(str(onnx_path), str(MODELS / "prefecture-clf.int8.onnx"),
                         weight_type=QuantType.QInt8)
    except Exception as e:  # noqa: BLE001
        print(f"int8 quantise skipped: {e}")

    (MODELS / "labels.json").write_text(json.dumps(prefs, ensure_ascii=False), encoding="utf-8")
    _write_meta(n, classes=prefs, acc=round(best_acc, 3),
                trained=dt.datetime.now(dt.timezone.utc).isoformat(), min_samples=min_samples)
    print(f"exported {onnx_path.name}; val_acc={best_acc:.3f}")


if __name__ == "__main__":
    main()
```

`requirements-train.txt`:

```
torch>=2.2
torchvision>=0.17
onnx>=1.16
onnxruntime>=1.18
```

- [ ] **Step 4: Run the gate test — passes**

Run: `cd scripts && python -m unittest test_train_classifier -v`
Expected: PASS (1 test). (Torch is not needed for this branch.)

- [ ] **Step 5: Commit**

```bash
git add scripts/train_classifier.py scripts/test_train_classifier.py requirements-train.txt
git commit -m "feat: train_classifier.py (gate + mobilenet_v3 fine-tune + ONNX export)"
```

---

## Task 15: `.github/workflows/train-model.yml`

**Files:**
- Create: `.github/workflows/train-model.yml`

**Interfaces:** none (CI only).

- [ ] **Step 1: Write the workflow**

```yaml
name: Train classifier

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - "data/personal/**"
      - "assets/photos/**"

permissions:
  contents: write
  pull-requests: write

jobs:
  train:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt -r requirements-train.txt
      - name: Train (or just refresh the counter)
        run: python scripts/train_classifier.py
      - name: Validate
        run: python scripts/validate.py
      - name: Open a PR if the model or metadata changed
        uses: peter-evans/create-pull-request@v7
        with:
          branch: model/refresh
          commit-message: "model: retrain prefecture classifier"
          title: "model: retrain prefecture classifier"
          body: |
            Automated retrain from contributed photos. Check `models/meta.json`
            `val_accuracy` before merging.
          add-paths: |
            models/**
```

- [ ] **Step 2: Lint the YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/train-model.yml'))"`
Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/train-model.yml
git commit -m "ci: retrain classifier on new photos, open a PR"
```

---

## Task 16: docs, CI consolidation, final verification

**Files:**
- Modify: `README.md`, `.github/workflows/ci.yml`, `package.json`, `scripts/smoke.mjs`

- [ ] **Step 1: README**

Add a section after "Add a cover you've seen":

```markdown
## Add a cover from the site

Open **＋ Add a cover** (top of the panel) or the **Identify a cover** link in the
footer. Pick a JPEG/PNG of a cover: the page reads its EXIF GPS, can OCR the text
cast into it, and (once enough photos exist) runs a prefecture classifier, then
gives you a ready-to-paste JSON block, two optimised WebP files, and the steps to
open a pull request. Everything runs in your browser — the photo is never
uploaded, and its GPS metadata is stripped from the files you download.

### Origin recognition

`src/recognize/analyze()` combines three independent signals:

| Signal | How | Notes |
| --- | --- | --- |
| GPS | EXIF coordinates → prefecture (point-in-polygon) + nearest known cover | strongest; needs a geotagged photo |
| OCR | Tesseract.js (Japanese) reads the cast text → matched against `data/municipalities.json` | best-effort on stylised metal |
| Classifier | `mobilenet_v3_small` fine-tuned on contributed photos, run via ONNX in the browser | shows "not enough data yet" until ~50 labelled photos exist, then trains automatically (`train-model.yml`) |

`data/municipalities.json` is built by `scripts/build_gazetteer.py` from
[geolonia/japanese-addresses](https://github.com/geolonia/japanese-addresses)
(licence noted there).
```

- [ ] **Step 2: CI consolidation**

Ensure `.github/workflows/ci.yml` `checks` job runs, in order: `npx eslint src/`,
`node scripts/smoke.mjs`, `npm test`, `node scripts/test_geo_parity.mjs`,
`python scripts/validate.py`, and the existing "data up to date" step. Add the
Python unit tests:

```yaml
      - name: Python unit tests
        run: |
          cd scripts && python -m unittest discover -p 'test_*.py' -v
```

- [ ] **Step 3: Full local verification**

Run each and confirm the expected result:

1. `npm run lint` → clean.
2. `npm test` → all `test/*.test.mjs` pass.
3. `node scripts/smoke.mjs` → every line `PASS`.
4. `node scripts/test_geo_parity.mjs` → `geo parity OK`.
5. `python scripts/validate.py` → `OK - …`.
6. `cd scripts && python -m unittest discover -p 'test_*.py'` → OK.
7. `npm run serve`; `http://localhost:8777`:
   - **＋ Add a cover** → `test/fixtures/gps.jpg` → "Tokyo · high confidence",
     prefecture pre-filled; **Build** → schema-looking JSON + two `.webp`
     downloads that open.
   - `test/fixtures/nogps.jpg` → "Origin unknown", form still completable.
   - `?tool=identify` → drop `gps.jpg` → verdict + three signal cards; classifier
     card says "not enough data yet (0/50)"; **Looks right** opens the form
     pre-filled.
   - DevTools Network on first load: **no** request for exifr / tesseract / ort /
     `data/municipalities.json` until the form or tool is opened.
8. `git grep -n 'TODO\|FIXME\|placeholder' src/ scripts/` → nothing new.

- [ ] **Step 4: Commit + final deploy**

```bash
git add README.md .github/workflows/ci.yml package.json scripts/smoke.mjs
git commit -m "docs+ci: document recognition + run all test suites in CI"
```

Push the branch, confirm `ci.yml` is green, merge to `main`, confirm `deploy.yml`
publishes, load `https://sofianebeloucif.github.io/manhole-japan/` and the
`?tool=identify` route.

---

## Self-Review

**Spec coverage**

| Spec item | Task |
| --- | --- |
| `analyze()` shape + signals + graceful degradation | 5, 11, 13 |
| GPS signal (exifr, geo, nearest cover) | 3, 4, 5 |
| `src/geo.js` parity with `lib_geo.py` | 1, 2 |
| OCR signal (Tesseract.js jpn, preprocess, tokens) | 11 |
| Gazetteer build + `data/municipalities.json` | 9 |
| Municipality matching (normalize, noise words, fuzzy) | 10 |
| Classifier `insufficient_data` path + ONNX inference | 13 |
| `scripts/train_classifier.py` + gate | 14 |
| `train-model.yml` (PR, not auto-commit) | 15 |
| Contribution form (file → analyse → fields → WebP → JSON → downloads → PR steps) | 6, 7, 8 |
| WebP re-encode strips EXIF; JPEG/PNG only | 6, 8 |
| Feature JSON validates against `schema.json` | 7 |
| Standalone identify tool + handoff | 12 |
| First-paint weight unchanged (lazy everything) | 4, 11, 13 (lazy `import()`); 16 step 3.7 verifies |
| `models/meta.json` seed, `min_samples: 50` | 13 |
| CI runs new suites | 2, 16 |
| README + privacy note + gazetteer licence | 16 |
| Prefecture names = the 47 `pref_en` | 8 (`PREFS` list), 1 (`resolvePrefecture`) |

No spec section is left without a task.

**Placeholder scan:** no "TBD/TODO/handle edge cases/similar to Task N" — each
step carries real code or a concrete command. The two version placeholders in
`src/config.js` (`CDN` pins) are explicitly "resolve newest working, pin exact at
implementation time" per Global Constraints, not hidden work.

**Type consistency:** `analyze(file, opts, deps)` and `fuse({gps,ocr,classifier})`
signatures are identical across Tasks 5, 11, 13. `AnalysisResult` fields
(`gps.prefecture_en`, `gps.nearestCover.{id,name_en,dist_m}`, `ocr.status`,
`ocr.municipalityGuesses[].{name_ja,name_en,prefecture_en,score}`,
`classifier.{status,have,need,predictions[].{prefecture_en,prob}}`,
`combined.{prefecture_en,municipality,basis,confidence}`) are used consistently in
`fuse` (5), the form's `renderAnalysis` (8), and identify's `render` (12).
`buildFeature` output keys match `scripts/schema.json` exactly (Task 7 test
enforces via `jsonschema`). `slugify`/`randHex`/`toWebp` names match between Task 6
and their callers in Task 8. `classify(bitmap, deps, injected)` matches between
Task 13 and the `analyze()` default in Task 13 step 5.
