# Batch contribution + deduplication + visual match — design

Status: approved for planning (2026-09-10). Follows on from
`2026-09-10-photo-contribution-and-recognition-design.md` (already shipped).

## Context

`manhole-japan` is a static, backend-less map. The shipped recognition engine
(`src/recognize/index.js#analyze()`) returns independent `gps` / `ocr` /
`classifier` signals + a fused `combined` verdict; the classifier is dormant
until ~50 labelled photos exist. Contribution is a client-side "＋ Add a cover"
panel that emits schema-valid Feature JSON + WebP files + PR steps — nothing
is uploaded. The map currently holds 259 Poké Lids from OpenStreetMap and
**zero cover photos**.

Three enhancements are wanted for the recognition/contribution flow:

1. **Batch mode** — drop many photos, analyse all, one combined output → one PR.
2. **Deduplication** — flag when a photo is of an already-mapped cover (or when
   two photos in a batch are the same cover).
3. **"Google Lens"-style analysis** — visual understanding of the photo, not just
   the GPS + OCR heuristics.

### Decisions taken with the user

- **Stay backend-less.** No Google Vision / reverse-image API, no serverless
  function, no vector DB. A real open-world "Lens" would add hosting, API keys,
  a proxy and per-call cost to a zero-infra portfolio piece — a bad trade.
- "Lens-style analysis" is scoped to **visual similarity against our own cover
  library**: a client-side image-embedding model (ONNX, lazy-loaded like the
  existing tesseract/onnx deps) produces a vector per photo; cosine similarity
  against embeddings of every known cover. Brute-force loop in JS — a few
  thousand covers is microseconds; no vector DB.
- The embedding unlocks all three asks: it is a new `analyze()` signal
  (`visual`), it powers visual dedup, and it runs once per batch.
- **Chicken-and-egg** (no reference photos yet): solved exactly like the
  classifier. Contributions commit photos → an offline build step
  (`scripts/build_embeddings.py`, same ONNX model) regenerates
  `data/embeddings.bin` → PR via a GitHub Action. Day one: the `visual` signal
  reports `no_library` and stays out of fusion, like the classifier's
  `insufficient_data`.
- UI wording: **"visual match" / "looks like"**, never "Lens". It answers
  "which known cover does this resemble", which is what dedup and contribution
  confirmation actually need.

### Out of scope

Open-world object recognition; any server component; text-prompt zero-shot;
scraping the GKP manhole-card database (a separate `data-refresh`-style concern).

## Architecture overview

```
src/recognize/
  index.js        + `visual` signal in analyze(); fuse() consumes it
  embed.js        NEW  embed(bitmap, deps) -> L2-normalised Float32Array   (lazy onnxruntime-web + DINOv2-small ONNX from HF CDN)
  visualmatch.js  NEW  loadEmbeddings(); matchVisual(vec, data, {topK})
  dedup.js        NEW  gpsDuplicate / visualDuplicate / duplicateVerdict / clusterEntries
src/contribute/
  batch.js        NEW  the batch panel: multi-file -> per-row analyse+edit -> one array + zip + PR steps
  output.js       + buildFeatureArray(entries); (fflate zip helper)
  form.js         + duplicate warning; feeds from dedup.js
src/identify/
  view.js         + visual-match cards; prominent "already on the map" verdict
data/
  embeddings.bin        NEW  generated: N*D little-endian float32, row order = index
  embeddings-index.json  NEW  { dim: D, ids: ["cover-id", ...] }
models/
  embed-model.json     NEW  { source, upstream, license, revision, dim, input_size, norm, output } — the model itself loads from HF CDN, nothing large committed
scripts/
  fetch_embed_model.py  NEW  download the pinned ONNX into a git-ignored cache for build_embeddings.py (no commit)
  build_embeddings.py   NEW  data/personal/*.json (photo + id) -> data/embeddings.bin + index
  validate.py           + embeddings integrity checks
  smoke.mjs             + ?tool=batch mounts; visual/dedup degradation guards
.github/workflows/
  embed.yml             NEW  standalone: on data/personal/** or assets/photos/** -> rebuild embeddings -> PR
```

First-paint weight is unchanged: `embed.js` / `visualmatch.js`, the DINOv2 ONNX,
`data/embeddings.bin` and the zip lib load only when the batch tool is opened or a
"visual match" button is pressed — never referenced from `index.html` or an eager
import.

## Phase 1 — Batch mode

**`src/contribute/batch.js`** — exports `openBatch()`, `closeBatch()`.

- `index.html`: a `#batch` panel (hidden), a **"Batch"** button beside
  **"＋ Add a cover"**, and a `?tool=batch` route wired in `src/main.js`
  (mirrors `?tool=identify`).
- `#b-files`: `<input type="file" accept="image/jpeg,image/png" multiple>`.
- On change: one row per file `{ file, objectUrl, status: "pending" }`. Process
  **sequentially** (heavy models are shared; parallel gains nothing):
  `analyze(file, { runOcr: false, runVisual: true, runClassifier: true })`.
  OCR stays opt-in **per row** (a button) — it is the 15 MB download.
- Row UI: thumbnail, filename, `combined` verdict (prefecture + confidence),
  dedup badge (phases 2/4), inline-editable `name_en`, `prefecture` (select of
  the 47), `lon`/`lat` (number, prefilled from GPS), `themes`, and a
  keep/skip checkbox. A row with no coords and no manual lon/lat is
  keep-disabled (same rule the single form enforces).
- Progress: "Analysing 4 / 12…", cancelable (`AbortController`-style flag).
- **Build all** → for each kept row: `toWebp` ×2, `buildFeature`. Output:
  - `buildFeatureArray(entries)` — a JSON **array** to append to
    `data/personal/mine.json`; every element validates against `scripts/schema.json`.
  - one combined `PHOTO_CREDITS.md` block.
  - a `prSteps`-style checklist, batch variant.
  - **Download all photos (.zip)** — `fflate` (MIT, ~8 KB, lazy from
    `https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js`) packing every
    `<slug>.webp` / `<slug>.thumb.webp`. Per-row download buttons remain as a
    fallback.

**`src/contribute/output.js`**: add `buildFeatureArray(entries)` (maps each to
`buildFeature`, returns `JSON.stringify(arr, null, 2)`); a small
`zipWebps(files)` wrapper around lazy `fflate`.

**Tests**
- `test/batch-output.test.mjs` — `buildFeatureArray` yields a JSON array whose
  every element passes `python3 … jsonschema` against `scripts/schema.json`
  (same spawn pattern as `test/contribute-output.test.mjs`).
- `scripts/smoke.mjs` — `?tool=batch` mounts `#batch`; feeding N jsdom `File`s
  makes N rows; "Build all" with a canned per-row analysis yields a schema-valid
  array string in the output `<pre>`.

## Phase 2 — GPS deduplication

**`src/recognize/dedup.js`** (new; phases 2 and 4 both live here):

- `DUP_M = 15`, `CLUSTER_M = 20` (module constants).
- `gpsDuplicate(analysis, coversFC)` → `{ duplicate: boolean, of: { id, name_en, dist_m } | null }`.
  Uses the already-computed `analysis.gps.nearestCover`; `analysis.gps == null`
  → `{ duplicate: false, of: null }`.
- `clusterByLocation(entries, { radiusM = CLUSTER_M })` → adds `clusterId` to
  each entry via union-find over pairwise `haversine([lon,lat],[lon,lat]) < radiusM`.
  Entries without coordinates each get a singleton cluster.

**Integration**
- `src/contribute/form.js` — after `analyze()`, call `gpsDuplicate`; on
  `duplicate`, render a non-blocking warning in `#c-analysis`: the existing
  cover's name, distance, a link to it, and an "Add anyway" affordance (the
  build is not blocked).
- `src/contribute/batch.js` — `clusterByLocation` over the rows; for clusters
  of size > 1, default the non-first members to `skip` with a
  "duplicate of row N" badge (user can re-enable).
- `scripts/build_covers.py` `load_personal()` — a **warning print** (never an
  error) when a personal entry lands within `DUP_M` of an existing feature.

**Tests** — `test/dedup.test.mjs`: `gpsDuplicate` (dist 8 → true; 200 → false;
`gps:null` → false); `clusterByLocation` (3 entries, two 10 m apart → 2 clusters).

## Phase 3 — Visual-match signal

### Model

**DINOv2-small, quantised ONNX, loaded from the Hugging Face CDN at runtime —
NOT committed to the repo.** Self-supervised, purpose-built for retrieval /
near-duplicate matching; 384-dim; `~23 MB` quantised. Upstream
`facebook/dinov2-small` is **Apache-2.0**; the Xenova ONNX re-export
(`Xenova/dinov2-small/onnx/model_quantized.onnx`) is the same weights, pinned by
commit revision `c2bb04a51fab207c420665f1946016107bffc701`.

- `CDN.embedModel` in `src/config.js` = the pinned HF `resolve/<sha>/…` URL.
  `onnxruntime-web` `InferenceSession.create(url)` loads it lazily — same
  pattern as the tesseract wasm/lang loaded from jsdelivr. The repo gains **no**
  large binary.
- `models/embed-model.json` (committed, tiny) records
  `{ source, upstream, license: "apache-2.0", revision, dim: 384, input_size: 224,
  norm: "imagenet", output: "last_hidden_state[:,0]" }`.
- `scripts/fetch_embed_model.py` — a small helper that downloads that same ONNX
  into a local cache dir (git-ignored) for `build_embeddings.py` to use offline;
  it does NOT commit anything.
- Implementer verifies at build time that the pinned revision still resolves and
  the upstream license is unchanged; a different permissive small encoder
  (e.g. `Xenova/clip-vit-base-patch32` vision tower, MIT via `openai/clip-vit-base-patch32`)
  is an acceptable substitute if DINOv2 becomes unavailable — update
  `embed-model.json` + `dim` accordingly.

Image embedding = the CLS token of `last_hidden_state` (row 0), L2-normalised.
Preprocess: resize 224², ImageNet mean `[0.485,0.456,0.406]` / std
`[0.229,0.224,0.225]`, NCHW float32.

### `src/recognize/embed.js`

- `embed(bitmap, deps = {})` → `Promise<Float32Array>` (L2-normalised, length
  `dim`). Lazy `import(CDN.ort)`; `InferenceSession.create(config.EMBED_MODEL_URL)`
  cached at module scope. Preprocess on a canvas: resize to `input_size` (224),
  ImageNet mean/std, NCHW float32 (reuse the classifier's `preprocess` shape).
  `deps.ort` / `deps.session` injectable for tests. Any failure → throws (caller
  in `analyze()` catches).

### `src/recognize/visualmatch.js`

- `loadEmbeddings()` → `{ dim, ids: string[], vectors: Float32Array }` from
  `config.EMBEDDINGS_URL` (`data/embeddings.bin`) + `config.EMBEDDINGS_INDEX_URL`
  (`data/embeddings-index.json`). Cache at module scope. If the `.bin` is
  absent, empty, or its byte length ≠ `ids.length * dim * 4` → return `null`.
- `matchVisual(vec, data, { topK = 5 })` → `[{ id, similarity }]`, best first.
  Cosine = dot product (both sides pre-normalised). Brute-force over rows.

### `analyze()` + `fuse()`

- `analyze(file, opts, deps)` gains `opts.runVisual` (opt-in). When set:
  lazy `import("./embed.js")` + `import("./visualmatch.js")` (or use
  `deps.visual` / `deps.embed` when injected), build:
  ```
  visual = {
    status: "ok" | "no_library" | "unavailable",
    matches: [{ id, name_en, prefecture_en, similarity }],   // enriched from coversFC
    vector: Float32Array | null,   // only when opts.keepVector (batch dedup needs it)
    confidence: 0..~0.9,
  }
  ```
  `loadEmbeddings()` → `null` yields `status: "no_library"` (day one). Any
  thrown error → `status: "unavailable"`. Never throws out of `analyze()`.
- `fuse()`: if `visual.status === "ok"` and `visual.matches[0]`:
  - prefecture agrees with the running `combined.prefecture_en` → push
    `"visual match agrees"` to `basis`, bump confidence one level.
  - GPS and OCR both gave nothing and `visual.matches[0].similarity > 0.85` →
    `combined.prefecture_en = visual.matches[0].prefecture_en`,
    `confidence = "medium"`, `basis = ["visual match"]`.

### Data build

- `scripts/build_embeddings.py` — `onnxruntime` + the cached ONNX (via `fetch_embed_model.py`) + Pillow.
  Input is `data/personal/*.json`: for each Feature that has a non-null `photo`,
  resolve `ROOT/<photo>` (the full-size `.webp`, not `.thumb`), embed it,
  L2-normalise. `id` for that row = the Feature's `properties.id`. Sort rows by
  `id`, then write `data/embeddings.bin` (little-endian float32, `N*dim`,
  row order = index order) and `data/embeddings-index.json`
  (`{ dim, ids: [...] }`). Deterministic. Zero photos → write an index with
  `ids: []` and a 0-byte `.bin`, exit 0. (OSM-sourced covers have no photo, so
  they never get a row — `visual` matches are only against contributed covers.)
- `.github/workflows/embed.yml` — a standalone workflow (not folded into
  `train-model.yml` — different trigger paths, different model): `workflow_dispatch`
  + `push` on `main` under `data/personal/**` or `assets/photos/**` → run
  `build_embeddings.py` → `peter-evans/create-pull-request` with
  `add-paths: data/embeddings*`. Never commits to `main`.
- `scripts/validate.py` — if `data/embeddings-index.json` exists: every `id` is a
  cover id in `data/covers.geojson`; `os.path.getsize("data/embeddings.bin")`
  equals `len(ids) * dim * 4`.

### Config

`EMBED_MODEL_URL` = the pinned HF `resolve/<sha>/onnx/model_quantized.onnx` URL, `EMBEDDINGS_URL = "data/embeddings.bin"`,
`EMBEDDINGS_INDEX_URL = "data/embeddings-index.json"`.

### UI

- `form.js` / `identify/view.js` — a "Find visual matches" button (sets
  `runVisual`) that renders the top matches: existing-cover thumbnail, name,
  prefecture, similarity %.
- `batch.js` — `runVisual: true, keepVector: true` per row (model loads once).

### Tests
- `test/visualmatch.test.mjs` — `matchVisual` ranks a hand-built
  `{dim, ids, vectors}` correctly by cosine; `loadEmbeddings` parses a
  synthetic `.bin` + index built in the test; size-mismatch → `null`.
- `test/embed.test.mjs` — `embed()` with an injected fake `session` returning a
  known tensor → L2-normalised `Float32Array` of length `dim`; no real onnx.
- `test/analyze.test.mjs` — injected `deps.visual` full signal feeds `fuse()`;
  `runVisual` with no deps → `visual.status === "unavailable"`, no throw.
- `scripts/smoke.mjs` — `analyze(new Uint8Array(), { runVisual: true }, {})` →
  `visual.status` ∈ {`unavailable`, `no_library`}, no throw.
- `scripts/test_build_embeddings.py` — the zero-photos path (stdlib + numpy):
  writes `ids: []` + 0-byte `.bin`, exit 0. The real embedding path is not run
  in CI (needs the model).

## Phase 4 — Visual deduplication

Extends `src/recognize/dedup.js`:

- `SIM_DUP = 0.93`.
- `visualDuplicate(analysis, coversFC)` → uses `analysis.visual.matches[0]`:
  `similarity > SIM_DUP` → `{ duplicate: true, of: { id, name_en, similarity } }`.
- `duplicateVerdict(analysis, coversFC)` → combines GPS + visual:
  ```
  { level: "new" | "likely" | "confirmed",
    reasons: string[],            // e.g. ["8 m from X", "96% visual match to X"]
    of: { id, name_en } | null }
  ```
  both signals fire (and point at the same cover) → `confirmed`; either alone →
  `likely`; neither → `new`.
- `clusterEntries(entries, { radiusM = CLUSTER_M, simThreshold = SIM_DUP })` —
  `clusterByLocation` **plus** merging clusters whose entries' `visual.vector`s
  have cosine > `simThreshold`. Requires each batch row to keep its query
  vector (`opts.keepVector`).

**Integration**
- `form.js` — swap the phase-2 `gpsDuplicate` call for `duplicateVerdict`; the
  warning states the combined reason.
- `batch.js` — `clusterEntries` with both signals; non-first cluster members
  default to `skip` with the reason shown.
- `identify/view.js` — a prominent verdict line when `level !== "new"`:
  "This cover is already on the map: [link]".

**Tests** — `test/dedup.test.mjs`: `visualDuplicate` (sim 0.95 → dup; 0.6 →
not); `duplicateVerdict` matrix (both / gps-only / visual-only / neither →
`confirmed` / `likely` / `likely` / `new`); `clusterEntries` merges two rows by
embedding similarity even when 40 m apart.

## Cross-cutting requirements

- **No backend.** Everything client-side. The DINOv2 ONNX (HF CDN),
  `data/embeddings.bin`, `fflate`, `onnxruntime-web` all lazy; none referenced
  from `index.html` or an eager import in the graph reachable from `src/main.js`.
- **`analyze()` contract:** always resolves; every signal (`gps`, `ocr`,
  `classifier`, `visual`) independently try/caught so one failure can't sink the
  call. `combined` never contains `undefined`.
- **Repo growth:** none for the model (loaded from HF CDN, pinned revision).
  `data/embeddings.bin` = `N * 384 * 4` bytes (259 covers ≈ 400 KB; 2500 ≈ 3.8 MB),
  lazy-fetched. README notes it.
- **Licenses:** only MIT/Apache/BSD models; recorded in `models/embed-model.json`.
  Contributor photos stay own-work / CC per `PHOTO_CREDITS.md`.
- **Feature JSON** stays schema-valid, batch array elements included.
- **CI:** new JS unit tests run automatically (`node --test`); new Python
  unittest picked up by the existing `unittest discover -p 'test_*.py'` step.
  `embed.yml` opens PRs, never commits to `main`.
- **Perf budget:** a 30-photo batch — encoder loads once (first time ~5–15 s,
  cached after), ~200 ms/embed on a laptop → ~10 s total; OCR opt-in per row.
- **Vanilla ES modules, no build step**; commit messages plain, no trailers;
  `npx eslint src/` clean (`/* global X */` for new browser globals).

## Implementation phases (each independently shippable)

- **P1 — Batch mode.** `batch.js` + `#batch` panel + `?tool=batch` +
  `buildFeatureArray` + `fflate` zip; loop `analyze()` (no visual dep). Smoke +
  `batch-output` tests. Deploy.
- **P2 — GPS dedup.** `dedup.js` (`gpsDuplicate`, `clusterByLocation`);
  wire into `form.js` + `batch.js`; `build_covers.py` warning. `dedup` tests.
- **P3 — Visual-match signal.** `models/embed-model.json` + `fetch_embed_model.py`
  (download-to-cache helper, no commit); `embed.js`, `visualmatch.js`; `visual`
  signal in `analyze()` + `fuse()`; `build_embeddings.py`; `data/embeddings*`
  (empty on day one); `embed.yml`; `validate.py` checks; "Find visual matches"
  button. Dormant (`no_library`) until photos exist.
- **P4 — Visual dedup.** `visualDuplicate`, `duplicateVerdict`, `clusterEntries`;
  swap `form.js` / `batch.js` / `identify` to the combined verdict.

## Verification

1. `npm run lint`, `npm test` (count grows each phase), `node scripts/smoke.mjs`,
   `node scripts/test_geo_parity.mjs`, `python3 scripts/validate.py`, `cd scripts
   && python3 -m unittest discover -p 'test_*.py'` — all green after every phase.
2. `npm run serve`; **P1**: `?tool=batch`, drop 3 JPEGs (1 GPS-tagged, 2 not) →
   3 rows, verdicts shown, no-GPS rows keep-disabled until lon/lat filled;
   "Build all" → schema-valid JSON array + a `.zip` that opens with 6 webp files.
3. **P2**: drop two photos ~5 m apart in the batch → second row auto-flagged
   "duplicate of row 1", default-skipped. In the single form, a photo 8 m from an
   existing cover → warning with a link, build still allowed.
4. **P3**: with **no** `data/embeddings.bin`, "Find visual matches" → "no
   reference library yet"; `analyze()` `visual.status === "no_library"`. Add a
   photo, run `python scripts/build_embeddings.py` → `data/embeddings.bin` size
   == `ids×dim×4`, `validate.py` OK; re-open → the just-added cover is the top
   match at ~1.0 similarity.
5. **P4**: a re-photo of an existing cover from a slightly different angle,
   GPS within 10 m → `duplicateVerdict.level === "confirmed"`; the identify tool
   shows "already on the map".
6. First paint (DevTools Network) unchanged: no request for the DINOv2 ONNX,
   `embeddings.bin`, `fflate`, `onnxruntime`, or `tesseract` until the batch tool
   or a visual-match / OCR button is used.
7. `embed.yml` (`workflow_dispatch`) on a branch with one new photo → opens a PR
   touching only `data/embeddings*`, never pushes to `main`.
8. Push → `ci.yml` green; `deploy.yml` publishes; site loads; `?tool=batch` works.
