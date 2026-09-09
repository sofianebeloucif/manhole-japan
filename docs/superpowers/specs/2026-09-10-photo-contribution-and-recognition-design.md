# Photo contribution + manhole-cover origin recognition — design

Status: approved for planning (2026-09-10)

## Context

`manhole-japan` is a static, backend-less map of Japan's decorative manhole
covers (v1: 259 Poké Lids from OpenStreetMap, deployed to GitHub Pages). Covers
have no photos yet, and the only way to add a "personal" observation today is to
hand-edit `data/personal/*.json` and run the Python pipeline.

Two features are wanted:

1. **Add-photo option** — an in-page form to contribute a cover photo without
   touching the toolchain by hand.
2. **Origin recognition** — given a photo, estimate which prefecture / city the
   cover is from.

Decisions taken with the user:

- **No backend.** The form produces a JSON block + optimised WebP files + a
  "open a PR" flow. Photos never leave the browser until the user commits them.
- **Recognition techniques:** EXIF GPS → prefecture, Japanese OCR of the cast
  text, and a trained prefecture classifier.
- The classifier **cannot work on day one** (no labelled photos). We ship the
  full training + in-browser inference pipeline; the contribution flow is the
  data collector; the classifier signal reports "insufficient data (N / 50)"
  until enough photos exist, then activates automatically.
- Recognition serves **both** the contribution form (pre-fill) and a **standalone
  "identify this cover" tool**, sharing one `analyze()` engine.
- Scope: build all of it in one iteration (implementation still phased).

Out of scope: HEIC decoding (accept JPEG/PNG only), visual-similarity / pHash /
CLIP zero-shot matching, any server component.

## Architecture overview

```
src/
  geo.js                 point-in-polygon, haversine, nearest-prefecture/cover (JS port of scripts/lib_geo.py)
  recognize/
    index.js             analyze(file, opts) -> AnalysisResult ; fuse()
    exif.js              readGps(file) -> {lat,lon} | null      (lazy: exifr from CDN)
    ocr.js               runOcr(bitmap) -> {rawText, tokens}     (lazy: tesseract.js from CDN)
    gazetteer.js         loadGazetteer(); matchMunicipality(tokens) -> guesses[]
    classifier.js        loadMeta(); predict(bitmap) -> predictions[]   (lazy: onnxruntime-web from CDN)
  contribute/
    form.js              the "+ Add a cover" panel; field state; calls analyze()
    image.js             toWebp(file, maxDim, q) -> Blob ; slugify()
    output.js            build feature JSON + PHOTO_CREDITS row + PR steps ; trigger downloads
  identify/
    view.js              ?tool=identify full-screen tool; same analyze(); hand-off to contribute
data/
  municipalities.json    gazetteer: ~1900 rows {code,name_ja,name_kana,name_en,prefecture_en,prefecture_ja,lon,lat}
models/
  meta.json              {n_samples, trained_at, classes, val_accuracy, input_size, min_samples}
  prefecture-clf.onnx    committed only once training produces one (via PR)
  labels.json
scripts/
  build_gazetteer.py     public source -> data/municipalities.json
  train_classifier.py    data/personal/*.json + assets/photos/*.webp -> models/*.onnx (+ int8), labels, meta
.github/workflows/
  train-model.yml         workflow_dispatch + push to data/personal|assets/photos -> retrain -> PR
```

First-paint weight is unchanged: `exifr`, `tesseract.js`, `onnxruntime-web` and
`data/municipalities.json` load only when the user opens the form or the tool.

## Recognition engine

### `analyze(file, { runOcr = false, runClassifier = true }) -> AnalysisResult`

```
AnalysisResult = {
  image:     { width, height },
  gps:       null | {
               lat, lon,
               prefecture_en, prefecture_ja,
               nearestCover: null | { id, name_en, dist_m },
               confidence: 0.95
             },
  ocr:       null | {
               status: 'ok' | 'skipped' | 'error',
               rawText, tokens: string[],
               municipalityGuesses: [{ name_ja, name_en, prefecture_en, score }],
               confidence: 0..1
             },
  classifier: null | {
               status: 'ok' | 'insufficient_data' | 'unavailable',
               have?: number, need?: number,
               predictions: [{ prefecture_en, prob }],   // top 3 when ok
               confidence: 0..1
             },
  combined:  {
               prefecture_en: string | null,
               municipality:  string | null,
               basis:  string[],                 // e.g. ["GPS", "OCR agrees"]
               confidence: 'high' | 'medium' | 'low'
             }
}
```

- `analyze()` always returns; any signal whose lazy dependency fails to load
  degrades to `status: 'error'` / `'unavailable'` and is left out of fusion.
- OCR is opt-in (heavy download): the form/tool has a "Read the text on the
  cover" button that sets `runOcr: true`.

### GPS signal (`exif.js` + `geo.js`)

- `readGps(file)`: lazy `import('https://cdn.jsdelivr.net/npm/exifr@<pin>/dist/full.esm.mjs')`,
  return `{ lat, lon }` from GPS tags or `null`.
- `geo.js` (JS port of `scripts/lib_geo.py`, must stay in parity — see tests):
  - `pointInPolygon(lon, lat, polygon)`, `pointInMultiPolygon(...)`
  - `resolvePrefecture(lon, lat, prefFC) -> { prefecture_en, prefecture_ja, exact }`
    (contains-test, then nearest-vertex fallback — same as Python `resolve()`)
  - `haversine([lon,lat],[lon,lat]) -> metres`
  - `nearestCover(lon, lat, coversFC) -> { feature, dist_m } | null`
- Confidence fixed at 0.95 when GPS present (the cover could have been moved /
  photo geotag off, but this is the strongest signal).

### OCR signal (`ocr.js` + `gazetteer.js`)

- `runOcr(bitmap)`: lazy-load `tesseract.js@<pin>` from jsdelivr; `corePath`,
  `workerPath`, `langPath` point at pinned jsdelivr paths; languages `jpn+jpn_vert`.
  Pre-process on a canvas: longest side → 1000px, grayscale, adaptive threshold.
  Return `{ rawText, tokens }` (tokens = rawText split on whitespace/punct,
  normalised NFKC, deduped).
- `gazetteer.js`:
  - `loadGazetteer()`: fetch `data/municipalities.json` once, cache.
  - `matchMunicipality(tokens)`:
    - strip noise tokens (`市 区 町 村 おすい 汚水 うすい 雨水 下水道 仕切弁 制水弁 消火栓` …).
    - for each remaining token, score against every gazetteer `name_ja` /
      `name_kana` with: exact match = 1.0; token is substring of name (or vice
      versa) = 0.8; else Sørensen–Dice on character bigrams.
    - return top 5 `{ name_ja, name_en, prefecture_en, score }`, score ≥ 0.4.
  - OCR `confidence` = best guess score, capped 0.7 (cast metal is noisy).

### Classifier signal (`classifier.js` + training pipeline)

- `models/meta.json` (committed, seeded):
  `{ "n_samples": 0, "trained_at": null, "classes": [], "val_accuracy": null,
     "input_size": 224, "min_samples": 50 }`
- `classifier.js`:
  - fetch `models/meta.json`.
  - if `n_samples < min_samples` or no `prefecture-clf.onnx`:
    return `{ status: 'insufficient_data', have: n_samples, need: min_samples, predictions: [] }`.
  - else: lazy-load `onnxruntime-web@<pin>` (set `ort.env.wasm.wasmPaths` to the
    pinned CDN dir), create session on `models/prefecture-clf.onnx` (int8 build
    if present), cache it. Preprocess bitmap → 224² → NCHW float32, ImageNet
    mean/std. Run → softmax → top-3 `{ prefecture_en, prob }`. `confidence` =
    `top1.prob * meta.val_accuracy`.
- `scripts/train_classifier.py`:
  - inputs: every `data/personal/*.json` feature that has a `photo` **and** a
    non-null `prefecture_en`, paired with `assets/photos/<...>.webp`.
  - `count < min_samples` → write `meta.json` with the current count and exit 0
    (no model).
  - else: torchvision `mobilenet_v3_small` (ImageNet weights), replace head with
    `Linear(*, n_classes)`; 224² inputs; light augmentation; 80/20 stratified
    split; a few epochs with early stop on val accuracy; export
    `models/prefecture-clf.onnx` (opset 17) and an int8 dynamic-quantised
    `prefecture-clf.int8.onnx`; write `models/labels.json` and `models/meta.json`
    (`n_samples`, `trained_at`, `classes`, `val_accuracy`, `input_size`).
  - if too few classes have ≥ 3 samples, fall back to 8 macro-regions instead of
    47 prefectures (`classes` names the region; browser maps region → highlight).
- `.github/workflows/train-model.yml`: `workflow_dispatch` + `push` on `main`
  touching `data/personal/**` or `assets/photos/**`. Runs `train_classifier.py`
  on CPU. If it produced a model whose `val_accuracy` ≥ the committed one, open a
  **PR** (`peter-evans/create-pull-request`) with `models/**` — never auto-commit
  a model straight to `main`.

### Fusion (`fuse()` inside `index.js`)

- Start from the highest-confidence signal that has a prefecture.
- Priority weight: GPS 1.0, classifier `0.4 * val_accuracy`, OCR 0.5.
- If a second signal names the **same** prefecture, bump `combined.confidence`
  one level and add `"<signal> agrees"` to `basis`.
- `municipality`: from GPS `nearestCover` municipality if `dist_m < 60`, else the
  top OCR municipality guess if score ≥ 0.6, else null.
- `combined.confidence`: `high` if GPS present or two signals agree; `medium` if
  one non-GPS signal ≥ 0.6; `low` otherwise.

## Contribution form (`src/contribute/`)

- Sidebar gains a **"＋ Add a cover"** button → opens the contribute panel
  (replaces the filter panel content; "back" returns to filters).
- Flow:
  1. File input / drop zone. Reject anything but `image/jpeg` and `image/png`
     with a message pointing HEIC users to "Most Compatible" capture.
  2. On file: `createImageBitmap`, run `analyze(file, { runClassifier: true })`,
     show the result card (`combined` headline + per-signal detail), drop a
     **draggable** map marker at `gps.lat/lon` (or map centre if no GPS).
     A "Read the cover text (OCR)" button re-runs with `runOcr: true`.
  3. Fields, pre-filled from `analyze()` where possible:
     `name_en` (required), `name_ja`, `municipality`, `themes` (tag input),
     `installed`, `photo_credit` (default: value remembered in localStorage or
     empty), `photo_license` (default `own-work`). `category` fixed to `personal`.
     `prefecture_en` = `combined.prefecture_en` (editable dropdown of the 47).
     Coordinates come from the marker position.
  4. `image.js`:
     - `toWebp(file, 1200, 0.82)` and `toWebp(file, 320, 0.78)` via a canvas and
       `canvas.toBlob('image/webp', q)` — re-encoding drops all EXIF.
     - `slugify()` → `personal-<pref-slug>-<name-slug>-<4 hex>` (matches
       `scripts/schema.json` `id` pattern `^[a-z0-9][a-z0-9-]*$`).
  5. `output.js` renders:
     - a `<pre>` with the Feature JSON to paste into `data/personal/mine.json`
       (array-append friendly), conforming to `scripts/schema.json`
       (`photo: "assets/photos/<slug>.webp"`, `photo_thumb: "...thumb.webp"`).
     - two **Download** buttons (`<a download>` + `URL.createObjectURL`) for the
       full and thumb WebP. (Works: this is a normal Pages site, not an Artifact.)
     - the `PHOTO_CREDITS.md` table row to copy.
     - a numbered "open a PR" checklist and a link to
       `https://github.com/sofianebeloucif/manhole-japan/upload/main/assets/photos`.

## Standalone identify tool (`src/identify/`)

- `?tool=identify` (or a small "Identify a cover" link in the footer) opens a
  full-screen overlay: drop a photo → `analyze(file, { runOcr: true, runClassifier: true })`
  → left: the photo; right: `combined` verdict + the three signals with their
  evidence; the map recentres on the estimate and highlights `gps.nearestCover`
  plus same-prefecture known covers.
- A **"Looks right → add this as a cover"** button passes the `File` +
  `AnalysisResult` to the contribute form (skips re-analysis).
- `src/main.js` handles the route and the hand-off; closing the overlay restores
  the map state from the URL as today.

## Data & third-party code

- `data/municipalities.json` built by `scripts/build_gazetteer.py` from a public
  dataset (target: geolonia/japanese-addresses — has municipality names, kana
  readings and coordinates; licence recorded in README). ~300–500 KB, lazy-loaded.
- CDN, pinned exact versions, lazy `import()` / injected at use time only:
  `exifr`, `tesseract.js` (+ its core/worker/lang paths pinned on the same CDN),
  `onnxruntime-web` (+ `wasmPaths`). No CSP on the site; runtime CDN fetches are
  acceptable. Self-hosting the tesseract assets under `assets/vendor/` is a
  documented follow-up if CDN reliability becomes an issue.

## CI / tooling changes

- `eslint` already globs `src/` — new dirs covered.
- `scripts/smoke.mjs`: assert `analyze()` (with lazy deps unavailable in jsdom)
  returns a well-formed result and does not throw; assert the contribute form
  builds schema-valid Feature JSON from a canned analysis; assert `?tool=identify`
  mounts the overlay.
- `scripts/validate.py`: also validate `data/municipalities.json` (array; each
  row has the required keys and in-range coords) and `models/meta.json` shape.
- New `scripts/test_geo_parity.mjs`: for a set of sample coordinates, assert
  `src/geo.js` `resolvePrefecture` matches `scripts/lib_geo.py` `Prefectures.resolve`.
- `.github/workflows/train-model.yml` added (see above).

## Privacy

All photo processing is client-side. EXIF (including GPS) is read locally, used
for the estimate, and dropped from the exported WebP by canvas re-encoding. The
identify tool transmits nothing. Stated in the UI and README.

## Implementation phases

- **P1 — geo + GPS + form skeleton.** `src/geo.js` + parity test; `analyze()`
  with the GPS signal and `fuse()`; contribute panel end-to-end using GPS only
  (fields, WebP encode, JSON + downloads + PR steps); wire the "+ Add a cover"
  button; extend smoke + validate; deploy.
- **P2 — OCR.** `scripts/build_gazetteer.py` + `data/municipalities.json`;
  `ocr.js` + `gazetteer.js`; "Read the cover text" button in the form; fusion
  updated.
- **P3 — identify tool.** `src/identify/view.js`, route + hand-off to contribute.
- **P4 — classifier pipeline.** `models/meta.json` seed; `classifier.js`
  (`insufficient_data` path now, onnx inference path dormant); `train_classifier.py`;
  `train-model.yml`.
- **P5 — polish.** README + PHOTO_CREDITS + this repo's docs; final smoke/validate;
  Lighthouse pass (first paint unaffected).

## Verification

1. `npm run lint`, `npm run smoke`, `python scripts/validate.py`,
   `node scripts/test_geo_parity.mjs` all pass.
2. `npm run serve`; open "+ Add a cover", pick a **GPS-tagged** JPEG →
   marker lands at the right spot, prefecture pre-filled, nearest cover shown.
3. Pick a **non-GPS** JPEG → marker at map centre, prefecture empty, form still
   completable by hand.
4. Click "Read the cover text" on a cover photo with legible kanji → OCR text
   appears, a plausible municipality is suggested (best-effort).
5. Finish the form → JSON validates against `scripts/schema.json`; the two
   downloaded files are WebP and open; pasting the JSON into
   `data/personal/mine.json` + running `npm run data` adds the cover and the map
   shows it.
6. `?tool=identify` with a photo → verdict + three signals render; "Looks right"
   opens the contribute form pre-filled.
7. Classifier signal shows "insufficient data (N / 50)" (no model committed).
8. `python scripts/train_classifier.py` with < 50 labelled photos exits 0 and
   only updates `models/meta.json`.
9. First paint unchanged: DevTools Network shows no exifr / tesseract / onnx /
   municipalities.json request until the form or tool is opened.
10. Push a branch → `ci.yml` green; merge → `deploy.yml` publishes; site loads.
