# Batch + Deduplication + Visual Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a batch-contribution tool, GPS + visual deduplication, and a client-side visual-match signal (image-embedding similarity against our own cover library) to `manhole-japan`, keeping the site backend-less and first-paint weight unchanged.

**Architecture:** A new `visual` signal in `src/recognize/index.js#analyze()` — a DINOv2-small ONNX encoder loaded lazily from the Hugging Face CDN produces an L2-normalised vector; `matchVisual()` does a brute-force cosine loop against `data/embeddings.bin` (regenerated from contributed photos by an offline script + PR workflow, dormant until photos exist). `src/recognize/dedup.js` combines GPS proximity and visual similarity into a duplicate verdict. `src/contribute/batch.js` is a multi-file panel that reuses the engine per row and emits one JSON array + a zip.

**Tech Stack:** Vanilla JS ES modules (no build). Node `node --test` (33 tests today). jsdom smoke test. Python 3.12 for data scripts. Lazy CDN libs: `onnxruntime-web` (already pinned), `fflate` (`https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js`), DINOv2-small ONNX (`https://huggingface.co/Xenova/dinov2-small/resolve/c2bb04a51fab207c420665f1946016107bffc701/onnx/model_quantized.onnx`, ~23 MB, upstream `facebook/dinov2-small` Apache-2.0). `peter-evans/create-pull-request@v7` for the embed workflow.

**Spec:** `docs/superpowers/specs/2026-09-10-batch-dedup-visual-match-design.md`

## Global Constraints

- **No backend.** Static site on GitHub Pages. Contribution flows emit files + JSON + a manual PR checklist; nothing uploads.
- **First-paint weight unchanged.** `src/recognize/embed.js`, `src/recognize/visualmatch.js`, `fflate`, `onnxruntime-web`, the DINOv2 ONNX, and `data/embeddings.bin` load ONLY via lazy `import()` / `fetch` triggered by opening the batch tool or pressing a "Find visual matches" / OCR button. Never referenced from `index.html`; never a top-level `import … from` of a heavy lib in any module reachable from `src/main.js` on load.
- **`analyze(file, opts, deps)` contract:** always resolves; every signal (`gps`, `ocr`, `classifier`, `visual`) is independently `try`/`catch`-wrapped so one failure can't sink the call. `combined` never contains `undefined`.
- Vanilla ES modules, no bundler. `npx eslint src/` must stay clean — use a top-of-file `/* global X, Y */` comment for any browser global not in `eslint.config.js` (existing repo pattern; see `src/contribute/image.js`).
- `npm test` script is `"node --test"` (no dir arg — the dir form is broken on this Node 24). Test files: `test/*.test.mjs`.
- Contribution Feature JSON — single and every element of a batch array — validates against `scripts/schema.json` (`id` matches `^[a-z0-9][a-z0-9-]*$`; `category:"personal"`; `additionalProperties:false` on `properties`; geometry `Point` lon ∈ [122,154] lat ∈ [20,46]).
- **Model license:** only MIT/Apache/BSD. `models/embed-model.json` records `{ source, upstream, license, revision, dim, input_size, norm, output }`. DINOv2-small: `dim: 384`, `input_size: 224`, `norm: "imagenet"` (mean `[0.485,0.456,0.406]` / std `[0.229,0.224,0.225]`), `output: "last_hidden_state[:,0]"` (CLS token), L2-normalised.
- `data/embeddings.bin` = `N * 384 * 4` bytes, little-endian float32, row order == `data/embeddings-index.json` `ids`. Day one: `ids: []` + 0-byte `.bin`.
- Dedup constants (`src/recognize/dedup.js` module scope): `DUP_M = 15`, `CLUSTER_M = 20`, `SIM_DUP = 0.93`.
- Accept only `image/jpeg` and `image/png`.
- Commit messages plain, no attribution trailers. Feature branch; deploy checkpoints merge to `main` per phase (the executing skill handles branch/merge).
- The 47 prefecture names are the `pref_en` values in `data/prefectures.geojson` (a `PREFS` array already exists in `src/contribute/form.js` — reuse or export it, don't retype a second copy).

---

## File Structure

**New:**

| File | Responsibility |
| --- | --- |
| `src/recognize/dedup.js` | `gpsDuplicate`, `clusterByLocation` (P2); `visualDuplicate`, `duplicateVerdict`, `clusterEntries` (P4). Constants `DUP_M`/`CLUSTER_M`/`SIM_DUP`. |
| `src/recognize/embed.js` | `embed(bitmap, deps)` → L2-normalised `Float32Array(384)` (lazy `onnxruntime-web` + DINOv2 ONNX). |
| `src/recognize/visualmatch.js` | `loadEmbeddings()`, `matchVisual(vec, data, {topK})`. |
| `src/contribute/batch.js` | The `#batch` panel: multi-file → per-row analyse + edit → one array + zip + PR steps. Exports `openBatch`, `closeBatch`. |
| `models/embed-model.json` | Model metadata (committed, tiny). |
| `scripts/fetch_embed_model.py` | Download the pinned ONNX into a git-ignored cache for `build_embeddings.py` (no commit). |
| `scripts/build_embeddings.py` | `data/personal/*.json` (photo + id) → `data/embeddings.bin` + `data/embeddings-index.json`. |
| `scripts/test_build_embeddings.py` | `unittest` for the zero-photos gate path. |
| `data/embeddings.bin`, `data/embeddings-index.json` | Generated; committed empty on day one. |
| `.github/workflows/embed.yml` | On `data/personal/**` or `assets/photos/**` → rebuild embeddings → PR. |
| `test/batch-output.test.mjs` | `buildFeatureArray` → schema-valid array. |
| `test/dedup.test.mjs` | dedup pure functions (P2 + P4). |
| `test/visualmatch.test.mjs` | `matchVisual` ranking + `loadEmbeddings` parsing. |
| `test/embed.test.mjs` | `embed()` with an injected fake session. |

**Modified:**

| File | Change |
| --- | --- |
| `src/config.js` | `CDN.fflate`, `CDN.embedModel`; `EMBEDDINGS_URL`, `EMBEDDINGS_INDEX_URL`. |
| `src/contribute/output.js` | `buildFeatureArray(entries)`, `zipWebps(files)`. |
| `src/contribute/form.js` | dedup warning (P2 → P4 verdict); "Find visual matches" button (P3); export `PREFS`. |
| `src/recognize/index.js` | `visual` signal in `analyze()` (`opts.runVisual` / `opts.keepVector`); `fuse()` consumes it. |
| `src/identify/view.js` | visual-match cards (P3); "already on the map" verdict (P4). |
| `index.html` | `#batch` panel + "Batch" button; "Find visual matches" buttons. |
| `style.css` | batch panel + rows + match cards + verdict badges. |
| `src/main.js` | `?tool=batch` route + "Batch" button wiring; `bindBatchMap` if the batch panel touches the map (it does not — skip). |
| `scripts/build_covers.py` | proximity warning in `load_personal()`. |
| `scripts/validate.py` | embeddings integrity check. |
| `scripts/smoke.mjs` | `?tool=batch` mount; visual/dedup degradation guards. |
| `.gitignore` | the embed-model cache dir. |
| `README.md` | batch + visual-match section, model note. |

---

## Task 1: `buildFeatureArray` + `zipWebps` + `fflate` config

**Files:**
- Modify: `src/contribute/output.js`, `src/config.js`
- Test: `test/batch-output.test.mjs`

**Interfaces:**
- Consumes: `src/contribute/output.js#buildFeature` (existing).
- Produces:
  - `buildFeatureArray(entries)` → a JSON string: `JSON.stringify(entries.map(buildFeature), null, 2)`. `entries` is an array of the same `input` object `buildFeature` already takes.
  - `zipWebps(files)` → `Promise<Blob>` (`application/zip`). `files` = `[{ name: "slug.webp", blob: Blob }, …]`. Lazy-imports `fflate` from `CDN.fflate`, `deps.fflate` injectable.
  - `CDN.fflate` string in `src/config.js`.

- [ ] **Step 1: Write the failing test**

```js
// test/batch-output.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildFeatureArray } from "../src/contribute/output.js";

function schemaValidArray(jsonStr) {
  const py =
    "import json,sys,jsonschema;" +
    "s=json.load(open('scripts/schema.json'));" +
    "[jsonschema.validate(f,s) for f in json.load(sys.stdin)]";
  execFileSync("python3", ["-c", py], { input: jsonStr });
}

const base = {
  name_en: "X", prefecture_en: "Tokyo", themes: ["a"],
  photo_credit: "S", photo_license: "own-work",
  lon: 139.7, lat: 35.68,
};

test("buildFeatureArray: array of schema-valid Features", () => {
  const s = buildFeatureArray([
    { ...base, slug: "personal-tokyo-a-1a2b" },
    { ...base, name_en: "Y", slug: "personal-tokyo-b-3c4d" },
  ]);
  const arr = JSON.parse(s);
  assert.equal(arr.length, 2);
  assert.equal(arr[0].properties.id, "personal-tokyo-a-1a2b");
  schemaValidArray(s); // throws on invalid
});

test("buildFeatureArray: empty input → []", () => {
  assert.equal(buildFeatureArray([]), "[]");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/batch-output.test.mjs`
Expected: FAIL — `buildFeatureArray` is not exported.

- [ ] **Step 3: Implement**

In `src/config.js`, add to the `CDN` object:

```js
  fflate: "https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js",
```

In `src/contribute/output.js`, add:

```js
export function buildFeatureArray(entries) {
  return JSON.stringify(entries.map(buildFeature), null, 2);
}

export async function zipWebps(files, deps = {}) {
  const fflate = deps.fflate || (await import(/* @vite-ignore */ CDN.fflate));
  const zipInput = {};
  for (const f of files) {
    zipInput[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  }
  return new Promise((resolve, reject) =>
    fflate.zip(zipInput, { level: 6 }, (err, data) =>
      err ? reject(err) : resolve(new Blob([data], { type: "application/zip" })),
    ),
  );
}
```

Add `import { CDN } from "../config.js";` at the top of `output.js` if not already present.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/batch-output.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/contribute/output.js src/config.js test/batch-output.test.mjs
git commit -m "feat: buildFeatureArray + zipWebps (lazy fflate) for batch output"
```

---

## Task 2: batch panel — `batch.js` + `#batch` + `?tool=batch` (no visual dep yet)

**Files:**
- Create: `src/contribute/batch.js`
- Modify: `index.html`, `style.css`, `src/main.js`, `src/contribute/form.js` (export `PREFS`), `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `src/recognize/index.js#analyze`, `src/contribute/image.js` (`toWebp`, `slugify`, `randHex`), `src/contribute/output.js` (`buildFeature`, `buildFeatureArray`, `photoCreditsRow`, `prSteps`, `download`, `zipWebps`, `esc`), `src/contribute/form.js#PREFS`.
- Produces: `src/contribute/batch.js` exports `openBatch()`, `closeBatch()`.

- [ ] **Step 1: Export `PREFS` from `form.js`**

In `src/contribute/form.js`, change the `PREFS` declaration to `export const PREFS = [...]` (keep the existing 47-value array; do not add a second copy anywhere).

- [ ] **Step 2: Add DOM**

In `index.html`, beside the existing `#add-cover` button:

```html
<button type="button" id="batch-open" class="reset">Batch</button>
```

After the `#contribute` section:

```html
<section id="batch" hidden aria-label="Batch add covers">
  <button type="button" id="batch-close" aria-label="Close">×</button>
  <h2>Batch add covers</h2>
  <p class="hint">Drop several photos. Each is analysed; edit inline, then get one
     JSON array + a zip of all the WebP files. Nothing is uploaded.</p>
  <input type="file" id="b-files" accept="image/jpeg,image/png" multiple>
  <p id="b-progress" hidden></p>
  <div id="b-rows"></div>
  <button type="button" id="b-build" class="reset" hidden>Build all</button>
  <div id="b-output" hidden>
    <pre id="b-json"></pre>
    <div class="c-actions">
      <button type="button" id="b-dl-zip" class="reset">Download all photos (.zip)</button>
    </div>
    <pre id="b-credits"></pre>
    <pre id="b-steps"></pre>
  </div>
</section>
```

- [ ] **Step 3: Style it**

In `style.css` (reuse existing tokens `--surface`, `--surface-2`, `--border`, `--radius`, `--shadow`, `--text`, `--text-dim`):

```css
#batch {
  position: absolute; top: 14px; right: 14px; width: 380px;
  max-height: calc(100dvh - 28px); overflow-y: auto; z-index: 8;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px;
}
#batch h2 { margin: 0 0 4px; font-size: 15px; }
#batch .hint { font-size: 11.5px; color: var(--text-dim); margin: 0 0 10px; }
#batch-close {
  position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
  border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text); font-size: 16px; cursor: pointer;
}
#b-progress { font-size: 12px; color: var(--text-dim); }
.b-row {
  display: grid; grid-template-columns: 56px 1fr; gap: 8px;
  border: 1px solid var(--border); border-radius: 8px; padding: 8px; margin-bottom: 8px;
}
.b-row img { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; background: var(--surface-2); }
.b-row .b-fields { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.b-row input, .b-row select { font: inherit; font-size: 12px; padding: 4px 6px;
  border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
.b-row .b-verdict { font-size: 11px; color: var(--text-dim); }
.b-row .b-dup { font-size: 11px; color: #b45309; }
#batch pre { white-space: pre-wrap; word-break: break-word; font-size: 11px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px; margin: 8px 0; }
@media (max-width: 640px) {
  #batch { top: auto; bottom: 0; right: 0; left: 0; width: 100%;
    max-height: 82dvh; border-radius: var(--radius) var(--radius) 0 0; }
}
```

- [ ] **Step 4: Implement `batch.js`**

```js
/* global document, Option */
import { analyze } from "../recognize/index.js";
import { toWebp, slugify, randHex } from "./image.js";
import {
  buildFeature, buildFeatureArray, photoCreditsRow, prSteps, download, zipWebps, esc,
} from "./output.js";
import { PREFS } from "./form.js";

const $ = (id) => document.getElementById(id);
let rows = [];
let cancelled = false;

function prefOptions(sel, value) {
  sel.append(new Option("(unknown)", ""));
  for (const p of PREFS) sel.append(new Option(p, p));
  sel.value = value || "";
}

function rowEl(row, i) {
  const el = document.createElement("div");
  el.className = "b-row";
  const c = row.analysis ? row.analysis.combined : { prefecture_en: null, confidence: "low" };
  el.innerHTML =
    `<img src="${esc(row.objectUrl)}" alt="">` +
    `<div class="b-fields">` +
    `<div class="b-verdict">#${i + 1} · ${esc(row.file.name)} · ${esc(c.prefecture_en || "unknown")} (${esc(c.confidence)})</div>` +
    `<div class="b-dup" ${row.dup ? "" : "hidden"}>${esc(row.dup || "")}</div>` +
    `<input class="b-name" placeholder="Name (English)">` +
    `<select class="b-pref"></select>` +
    `<input class="b-lon" type="number" step="any" placeholder="Longitude">` +
    `<input class="b-lat" type="number" step="any" placeholder="Latitude">` +
    `<input class="b-themes" placeholder="themes, comma separated">` +
    `<label style="font-size:11px"><input type="checkbox" class="b-keep" ${row.keep ? "checked" : ""}> keep</label>` +
    `</div>`;
  prefOptions(el.querySelector(".b-pref"), c.prefecture_en);
  const g = row.analysis && row.analysis.gps;
  if (g) { el.querySelector(".b-lon").value = g.lon; el.querySelector(".b-lat").value = g.lat; }
  el.querySelector(".b-keep").addEventListener("change", (e) => (row.keep = e.target.checked));
  row.el = el;
  return el;
}

async function processFiles(files) {
  cancelled = false;
  rows = [];
  $("b-rows").innerHTML = "";
  $("b-output").hidden = true;
  $("b-build").hidden = false;
  $("b-progress").hidden = false;
  for (let i = 0; i < files.length; i++) {
    if (cancelled) break;
    const f = files[i];
    if (!/^image\/(jpeg|png)$/.test(f.type)) continue;
    $("b-progress").textContent = `Analysing ${i + 1} / ${files.length}…`;
    const row = { file: f, objectUrl: URL.createObjectURL(f), keep: true, dup: null };
    // eslint-disable-next-line no-await-in-loop
    row.analysis = await analyze(f, { runOcr: false, runClassifier: true });
    rows.push(row);
    $("b-rows").append(rowEl(row, rows.length - 1));
  }
  $("b-progress").textContent = `${rows.length} photo(s) analysed.`;
}

async function buildAll() {
  const kept = [];
  for (const row of rows) {
    if (!row.keep) continue;
    const name = row.el.querySelector(".b-name").value.trim();
    const pref = row.el.querySelector(".b-pref").value;
    const lon = parseFloat(row.el.querySelector(".b-lon").value);
    const lat = parseFloat(row.el.querySelector(".b-lat").value);
    if (!name || !pref || Number.isNaN(lon) || Number.isNaN(lat)) {
      $("b-progress").textContent = `Row for "${row.file.name}" needs name, prefecture, lon, lat.`;
      return;
    }
    const slug = `personal-${slugify(pref)}-${slugify(name)}-${randHex(4)}`;
    kept.push({
      row, slug,
      input: {
        name_en: name, prefecture_en: pref,
        themes: row.el.querySelector(".b-themes").value.split(",").map((s) => s.trim()).filter(Boolean),
        photo_credit: "", photo_license: "own-work", lon, lat, slug,
      },
    });
  }
  const files = [];
  for (const k of kept) {
    // eslint-disable-next-line no-await-in-loop
    const full = await toWebp(k.row.file, 1200, 0.82);
    // eslint-disable-next-line no-await-in-loop
    const thumb = await toWebp(k.row.file, 320, 0.78);
    files.push({ name: `${k.slug}.webp`, blob: full }, { name: `${k.slug}.thumb.webp`, blob: thumb });
  }
  $("b-json").textContent = buildFeatureArray(kept.map((k) => k.input));
  $("b-credits").textContent = kept.map((k) => photoCreditsRow(k.input)).join("\n");
  $("b-steps").textContent = prSteps(kept.map((k) => k.slug).join(", "));
  $("b-output").hidden = false;
  $("b-dl-zip").onclick = async () => download(await zipWebps(files), "manhole-covers.zip");
  void buildFeature; // referenced for interface parity; buildFeatureArray uses it internally
}

export function openBatch() {
  $("batch").hidden = false;
  $("b-files").value = "";
  $("b-rows").innerHTML = "";
  $("b-output").hidden = true;
  $("b-build").hidden = true;
  $("b-progress").hidden = true;
}
export function closeBatch() {
  cancelled = true;
  $("batch").hidden = true;
}

$("batch-close").addEventListener("click", closeBatch);
$("b-files").addEventListener("change", (e) => processFiles([...e.target.files]));
$("b-build").addEventListener("click", () => { buildAll().catch(() => { $("b-progress").textContent = "Build failed."; }); });
```

(If eslint flags `no-await-in-loop`, the disable comments above cover it; sequential processing is intentional per the spec.)

- [ ] **Step 5: Wire in `main.js`**

```js
import { openBatch } from "./contribute/batch.js";
document.getElementById("batch-open").addEventListener("click", openBatch);
if (new URLSearchParams(location.search).get("tool") === "batch") openBatch();
```

- [ ] **Step 6: Smoke checks**

In `scripts/smoke.mjs`, before the final `no jsdom errors` check:

```js
d.getElementById("batch-open").dispatchEvent(new window.Event("click"));
check("batch panel opens", d.getElementById("batch").hidden === false);
d.getElementById("batch-close").dispatchEvent(new window.Event("click"));
check("batch panel closes", d.getElementById("batch").hidden === true);
```

- [ ] **Step 7: Run everything**

Run: `npm run lint && npm test && node scripts/smoke.mjs`
Expected: lint clean; all unit tests pass (35 + Task 1's 2 = 37); smoke prints the 2 new PASS lines.

- [ ] **Step 8: Browser check**

`npm run serve`; open `http://localhost:8777/?tool=batch`; drop `test/fixtures/gps.jpg` + `test/fixtures/nogps.jpg`: two rows appear, the GPS one has lon/lat prefilled and a "Tokyo" verdict, the other blank. Fill name/pref/lon/lat on both, click **Build all** → a JSON array of 2 Features in `#b-json`, and **Download all photos (.zip)** produces a zip with 4 `.webp` files.

- [ ] **Step 9: Commit + deploy checkpoint**

```bash
git add index.html style.css src/main.js src/contribute/batch.js src/contribute/form.js scripts/smoke.mjs
git commit -m "feat: batch add-covers panel (?tool=batch)"
```

Push branch; CI green; merge to `main`; `deploy.yml` publishes; `?tool=batch` works.

---

## Task 3: `src/recognize/dedup.js` — GPS dedup + location clustering

**Files:**
- Create: `src/recognize/dedup.js`, `test/dedup.test.mjs`

**Interfaces:**
- Consumes: `src/geo.js#haversine`.
- Produces:
  - `DUP_M` (15), `CLUSTER_M` (20), `SIM_DUP` (0.93) — exported consts.
  - `gpsDuplicate(analysis)` → `{ duplicate: boolean, of: { id, name_en, dist_m } | null }`. Reads `analysis.gps?.nearestCover`.
  - `clusterByLocation(entries, { radiusM = CLUSTER_M } = {})` → the same array with `clusterId` (integer) added to each entry. `entries` are `{ lon, lat }` (or `lon`/`lat` undefined). Union-find over pairwise `haversine`.

- [ ] **Step 1: Write the failing test**

```js
// test/dedup.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { gpsDuplicate, clusterByLocation, DUP_M } from "../src/recognize/dedup.js";

test("DUP_M is 15", () => assert.equal(DUP_M, 15));

test("gpsDuplicate: within DUP_M of a known cover", () => {
  const r = gpsDuplicate({ gps: { nearestCover: { id: "c1", name_en: "Cover 1", dist_m: 8 } } });
  assert.equal(r.duplicate, true);
  assert.equal(r.of.id, "c1");
});

test("gpsDuplicate: far away", () => {
  assert.equal(
    gpsDuplicate({ gps: { nearestCover: { id: "c1", name_en: "x", dist_m: 200 } } }).duplicate,
    false,
  );
});

test("gpsDuplicate: no gps", () => {
  assert.deepEqual(gpsDuplicate({ gps: null }), { duplicate: false, of: null });
});

test("clusterByLocation: two points ~10 m apart share a cluster, a third is separate", () => {
  const a = { lon: 139.7000, lat: 35.6800 };
  const b = { lon: 139.70011, lat: 35.6800 }; // ~10 m east
  const c = { lon: 135.5, lat: 34.7 };        // Osaka
  const out = clusterByLocation([a, b, c]);
  assert.equal(out[0].clusterId, out[1].clusterId);
  assert.notEqual(out[0].clusterId, out[2].clusterId);
});

test("clusterByLocation: entries without coords get singleton clusters", () => {
  const out = clusterByLocation([{}, {}]);
  assert.notEqual(out[0].clusterId, out[1].clusterId);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/dedup.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/recognize/dedup.js
import { haversine } from "../geo.js";

export const DUP_M = 15;
export const CLUSTER_M = 20;
export const SIM_DUP = 0.93;

export function gpsDuplicate(analysis) {
  const nc = analysis && analysis.gps && analysis.gps.nearestCover;
  if (nc && nc.dist_m < DUP_M) {
    return { duplicate: true, of: { id: nc.id, name_en: nc.name_en, dist_m: nc.dist_m } };
  }
  return { duplicate: false, of: null };
}

export function clusterByLocation(entries, { radiusM = CLUSTER_M } = {}) {
  const parent = entries.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { parent[find(i)] = find(j); };
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    if (!Number.isFinite(a.lon) || !Number.isFinite(a.lat)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (!Number.isFinite(b.lon) || !Number.isFinite(b.lat)) continue;
      if (haversine([a.lon, a.lat], [b.lon, b.lat]) < radiusM) union(i, j);
    }
  }
  entries.forEach((e, i) => { e.clusterId = find(i); });
  return entries;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/dedup.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recognize/dedup.js test/dedup.test.mjs
git commit -m "feat: dedup.js — gpsDuplicate + clusterByLocation"
```

---

## Task 4: wire GPS dedup into the form, batch, and `build_covers.py`

**Files:**
- Modify: `src/contribute/form.js`, `src/contribute/batch.js`, `scripts/build_covers.py`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `src/recognize/dedup.js` (`gpsDuplicate`, `clusterByLocation`), `data/covers.geojson` (already fetched by `analyze()` — the `nearestCover` in `analysis.gps` carries `id`/`name_en`/`dist_m`).
- Produces: no new exports; behaviour only.

- [ ] **Step 1: Form warning**

In `src/contribute/form.js` `renderAnalysis(a)`, after the existing signal lines, append (using the existing `esc`):

```js
  const dup = gpsDuplicate(a);
  if (dup.duplicate) {
    box.innerHTML +=
      `<div class="sig" style="color:#b45309">` +
      `⚠️ ${esc(dup.of.dist_m)} m from an existing cover: ` +
      `<a href="?id=${esc(dup.of.id)}">${esc(dup.of.name_en)}</a>. ` +
      `You can still add it if it's a different design.</div>`;
  }
```

Add `import { gpsDuplicate } from "../recognize/dedup.js";` at the top. This does **not** block `build()`.

- [ ] **Step 2: Batch clustering**

In `src/contribute/batch.js`, after the `processFiles` loop finishes, before setting the final progress text:

```js
  clusterByLocation(rows.map((r) => {
    const g = r.analysis && r.analysis.gps;
    return Object.assign(r, { lon: g ? g.lon : NaN, lat: g ? g.lat : NaN });
  }));
  const seen = new Set();
  rows.forEach((r, i) => {
    if (seen.has(r.clusterId)) {
      r.keep = false;
      r.dup = `same location as an earlier photo (row ${rows.findIndex((x) => x.clusterId === r.clusterId) + 1})`;
      const box = r.el.querySelector(".b-dup");
      box.hidden = false; box.textContent = r.dup;
      r.el.querySelector(".b-keep").checked = false;
    } else {
      seen.add(r.clusterId);
    }
  });
```

Add `import { clusterByLocation } from "../recognize/dedup.js";`.

- [ ] **Step 3: `build_covers.py` proximity warning**

In `scripts/build_covers.py` `load_personal()`, after a personal feature's coordinates and prefecture are resolved, before appending it, compare against the already-collected covers:

```python
    for prev in out:
        plon, plat = prev["geometry"]["coordinates"]
        if _haversine_m(lon, lat, plon, plat) < 15 or _existing_near(lon, lat, 15):
            print(f"  ~ {p['id']} is <15 m from an existing cover — possible duplicate", file=sys.stderr)
            break
```

Add a small `_haversine_m(lat/lon)` helper (or reuse `lib_geo` if it has one — check; `lib_geo.py` has `resolve` but likely no haversine, so add a 6-line `_haversine_m`). `_existing_near` checks the OSM `covers` list loaded earlier in `build_covers.main()` — if that list isn't in scope in `load_personal()`, pass it in as an argument. This is a **warning only**, never `sys.exit`.

- [ ] **Step 4: Smoke**

`scripts/smoke.mjs` cannot exercise the map/analyze path meaningfully for dedup; add a pure check instead:

```js
import { gpsDuplicate } from "../src/recognize/dedup.js";
check("gpsDuplicate flags a near cover",
  gpsDuplicate({ gps: { nearestCover: { id: "x", name_en: "x", dist_m: 5 } } }).duplicate === true);
```

- [ ] **Step 5: Run everything**

Run: `npm run lint && npm test && node scripts/smoke.mjs && python3 scripts/build_covers.py && python3 scripts/validate.py`
Expected: all green; `build_covers.py` still writes 259 covers (no personal entries yet, so no warning lines).

- [ ] **Step 6: Commit + deploy checkpoint**

```bash
git add src/contribute/form.js src/contribute/batch.js scripts/build_covers.py scripts/smoke.mjs
git commit -m "feat: surface GPS duplicates in the form, batch, and build_covers"
```

Push; CI green; merge to `main`; deploy.

---

## Task 5: `models/embed-model.json` + `scripts/fetch_embed_model.py` + `.gitignore`

**Files:**
- Create: `models/embed-model.json`, `scripts/fetch_embed_model.py`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `fetch_embed_model.py` with `model_path()` → `pathlib.Path` of the cached ONNX (downloads it if missing). Used by `build_embeddings.py` (Task 8).

- [ ] **Step 1: `models/embed-model.json`**

```json
{
  "source": "https://huggingface.co/Xenova/dinov2-small/resolve/c2bb04a51fab207c420665f1946016107bffc701/onnx/model_quantized.onnx",
  "upstream": "facebook/dinov2-small",
  "license": "apache-2.0",
  "revision": "c2bb04a51fab207c420665f1946016107bffc701",
  "dim": 384,
  "input_size": 224,
  "norm": "imagenet",
  "output": "last_hidden_state[:,0]"
}
```

- [ ] **Step 2: `.gitignore`**

Append:

```
# cached embedding model (downloaded by scripts/fetch_embed_model.py)
.cache/
```

- [ ] **Step 3: `scripts/fetch_embed_model.py`**

```python
#!/usr/bin/env python3
"""Download the pinned DINOv2-small ONNX into .cache/ for offline embedding.

Never commits anything. build_embeddings.py imports model_path().
"""
from __future__ import annotations

import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
META = json.loads((ROOT / "models" / "embed-model.json").read_text())
CACHE = ROOT / ".cache"
DEST = CACHE / "embed-model.onnx"


def model_path() -> pathlib.Path:
    if DEST.exists() and DEST.stat().st_size > 1_000_000:
        return DEST
    CACHE.mkdir(exist_ok=True)
    url = META["source"]
    print(f"Downloading embedding model ({url}) …", file=sys.stderr)
    with urllib.request.urlopen(url) as r, open(DEST, "wb") as f:  # noqa: S310
        f.write(r.read())
    if DEST.stat().st_size < 1_000_000:
        DEST.unlink(missing_ok=True)
        raise SystemExit("download too small — revision may have moved")
    return DEST


if __name__ == "__main__":
    print(model_path())
```

- [ ] **Step 4: Verify**

Run: `python3 scripts/fetch_embed_model.py`
Expected: prints a path under `.cache/`; the file is ~23 MB. `git status` shows nothing new to commit except the three files from Steps 1–3 (`.cache/` is ignored).

- [ ] **Step 5: Commit**

```bash
git add models/embed-model.json scripts/fetch_embed_model.py .gitignore
git commit -m "feat: pinned DINOv2-small embed-model metadata + cache fetcher"
```

---

## Task 6: `src/recognize/embed.js` — `embed(bitmap, deps)`

**Files:**
- Create: `src/recognize/embed.js`, `test/embed.test.mjs`
- Modify: `src/config.js`

**Interfaces:**
- Consumes: `src/config.js#CDN.ort`, `CDN.ortWasm`, new `CDN.embedModel`.
- Produces: `embed(bitmap, deps = {})` → `Promise<Float32Array>` length 384, L2-normalised. `deps.session` (an object with `run(feeds)` + `inputNames` + `outputNames`) and `deps.ort` injectable for tests.

- [ ] **Step 1: config**

In `src/config.js` add to `CDN`:

```js
  embedModel: "https://huggingface.co/Xenova/dinov2-small/resolve/c2bb04a51fab207c420665f1946016107bffc701/onnx/model_quantized.onnx",
```

and after the other URL exports:

```js
export const EMBEDDINGS_URL = "data/embeddings.bin";
export const EMBEDDINGS_INDEX_URL = "data/embeddings-index.json";
```

- [ ] **Step 2: Write the failing test**

```js
// test/embed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { embed } from "../src/recognize/embed.js";

// Fake ORT session: returns a fixed [1, N, 384] last_hidden_state so we exercise
// CLS extraction + L2 normalisation, without onnx or a real image.
function fakeSession(dim = 384) {
  return {
    inputNames: ["pixel_values"],
    outputNames: ["last_hidden_state"],
    async run() {
      const data = new Float32Array(1 * 5 * dim);
      for (let i = 0; i < dim; i++) data[i] = i + 1; // row 0 = CLS
      return { last_hidden_state: { data, dims: [1, 5, dim] } };
    },
  };
}

test("embed: returns an L2-normalised Float32Array of length 384", async () => {
  const v = await embed({ width: 224, height: 224 }, { session: fakeSession() });
  assert.equal(v.length, 384);
  const norm = Math.sqrt([...v].reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-5, `norm ${norm}`);
  // direction preserved: first component still the largest-ish for our ramp? row0 = 1..384
  assert.ok(v[383] > v[0]);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/embed.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```js
/* global document, createImageBitmap */
import { CDN, EMBED_MODEL_URL } from "../config.js";

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SIZE = 224;

let _session;

async function session(deps) {
  if (deps.session) return deps.session;
  if (!_session) {
    const ort = deps.ort || (await import(/* @vite-ignore */ CDN.ort));
    ort.env.wasm.wasmPaths = CDN.ortWasm;
    _session = await ort.InferenceSession.create(CDN.embedModel);
    _session._ort = ort;
  }
  return _session;
}

function preprocess(bitmap) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const out = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let ch = 0; ch < 3; ch++) {
      out[ch * SIZE * SIZE + i] = (data[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    }
  }
  return out;
}

function l2(vec) {
  let n = 0;
  for (const x of vec) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / n;
  return out;
}

export async function embed(bitmap, deps = {}) {
  const s = await session(deps);
  let feed;
  if (deps.session) {
    // test path: no real preprocessing needed, the fake ignores the tensor
    feed = { [s.inputNames[0]]: { data: new Float32Array(3 * SIZE * SIZE), dims: [1, 3, SIZE, SIZE] } };
  } else {
    const ort = s._ort;
    feed = { [s.inputNames[0]]: new ort.Tensor("float32", preprocess(bitmap), [1, 3, SIZE, SIZE]) };
  }
  const out = await s.run(feed);
  const t = out[s.outputNames[0]];
  const dim = t.dims[t.dims.length - 1];
  const cls = t.data.slice(0, dim); // last_hidden_state[0, 0, :]
  return l2(cls);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/embed.test.mjs`
Expected: PASS.

- [ ] **Step 6: eslint + commit**

Run: `npx eslint src/` → clean.

```bash
git add src/recognize/embed.js test/embed.test.mjs src/config.js
git commit -m "feat: embed.js — DINOv2-small image embedding via lazy onnxruntime-web"
```

---

## Task 7: `src/recognize/visualmatch.js` — `loadEmbeddings` + `matchVisual`

**Files:**
- Create: `src/recognize/visualmatch.js`, `test/visualmatch.test.mjs`

**Interfaces:**
- Consumes: `src/config.js#EMBEDDINGS_URL`, `EMBEDDINGS_INDEX_URL`.
- Produces:
  - `loadEmbeddings(deps = {})` → `Promise<{ dim, ids: string[], vectors: Float32Array } | null>`. `deps.bin` (ArrayBuffer) + `deps.index` (object) injectable. Returns `null` if the index is empty or `bin.byteLength !== ids.length * dim * 4`.
  - `matchVisual(vec, data, { topK = 5 } = {})` → `[{ id, similarity }]` sorted desc. Cosine == dot product (all L2-normalised).

- [ ] **Step 1: Write the failing test**

```js
// test/visualmatch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEmbeddings, matchVisual } from "../src/recognize/visualmatch.js";

function norm(a) {
  const n = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  return a.map((x) => x / n);
}

test("matchVisual: ranks by cosine, best first, topK respected", () => {
  const dim = 3;
  const ids = ["a", "b", "c"];
  const rows = [norm([1, 0, 0]), norm([0.9, 0.1, 0]), norm([0, 1, 0])];
  const vectors = new Float32Array(dim * 3);
  rows.forEach((r, i) => vectors.set(r, i * dim));
  const q = new Float32Array(norm([1, 0, 0]));
  const out = matchVisual(q, { dim, ids, vectors }, { topK: 2 });
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "a");
  assert.equal(out[1].id, "b");
  assert.ok(out[0].similarity > out[1].similarity);
  assert.ok(Math.abs(out[0].similarity - 1) < 1e-6);
});

test("loadEmbeddings: parses injected bin + index", async () => {
  const dim = 2;
  const ids = ["x", "y"];
  const f = new Float32Array([1, 0, 0, 1]);
  const data = await loadEmbeddings({ index: { dim, ids }, bin: f.buffer });
  assert.equal(data.dim, 2);
  assert.deepEqual(data.ids, ["x", "y"]);
  assert.equal(data.vectors.length, 4);
});

test("loadEmbeddings: size mismatch → null", async () => {
  const data = await loadEmbeddings({ index: { dim: 4, ids: ["x"] }, bin: new Float32Array([1, 2]).buffer });
  assert.equal(data, null);
});

test("loadEmbeddings: empty index → null", async () => {
  assert.equal(await loadEmbeddings({ index: { dim: 384, ids: [] }, bin: new ArrayBuffer(0) }), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/visualmatch.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/recognize/visualmatch.js
import { EMBEDDINGS_URL, EMBEDDINGS_INDEX_URL } from "../config.js";

let _cache;

export async function loadEmbeddings(deps = {}) {
  if (!deps.index && _cache !== undefined) return _cache;
  let index;
  let buf;
  if (deps.index) {
    index = deps.index;
    buf = deps.bin;
  } else {
    try {
      [index, buf] = await Promise.all([
        fetch(EMBEDDINGS_INDEX_URL).then((r) => (r.ok ? r.json() : null)),
        fetch(EMBEDDINGS_URL).then((r) => (r.ok ? r.arrayBuffer() : null)),
      ]);
    } catch {
      index = null;
    }
  }
  let result = null;
  if (index && Array.isArray(index.ids) && index.ids.length && buf) {
    if (buf.byteLength === index.ids.length * index.dim * 4) {
      result = { dim: index.dim, ids: index.ids, vectors: new Float32Array(buf) };
    }
  }
  if (!deps.index) _cache = result;
  return result;
}

export function matchVisual(vec, data, { topK = 5 } = {}) {
  const { dim, ids, vectors } = data;
  const scored = [];
  for (let r = 0; r < ids.length; r++) {
    let dot = 0;
    const base = r * dim;
    for (let k = 0; k < dim; k++) dot += vec[k] * vectors[base + k];
    scored.push({ id: ids[r], similarity: dot });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/visualmatch.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recognize/visualmatch.js test/visualmatch.test.mjs
git commit -m "feat: visualmatch.js — loadEmbeddings + cosine matchVisual"
```

---

## Task 8: `visual` signal in `analyze()` + `fuse()`

**Files:**
- Modify: `src/recognize/index.js`, `test/analyze.test.mjs`, `test/fuse.test.mjs`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `src/recognize/embed.js#embed`, `src/recognize/visualmatch.js` (`loadEmbeddings`, `matchVisual`), `analysis` `coversFC` (already fetched in `analyze()` for the GPS signal — reuse it to enrich matches with `name_en` / `prefecture_en`).
- Produces:
  - `analyze(file, opts, deps)` gains `opts.runVisual` (default `false`) and `opts.keepVector` (default `false`).
  - The `visual` member of `AnalysisResult`:
    ```
    visual = null | {
      status: "ok" | "no_library" | "unavailable",
      matches: [{ id, name_en, prefecture_en, similarity }],   // top 5 when ok
      vector: Float32Array | null,                              // only when opts.keepVector
      confidence: number,                                       // 0..~0.9
    }
    ```
  - `deps.visual` (a full signal, injected by tests) and `deps.embed` / `deps.embeddings` (injected) short-circuit the lazy imports.
  - `fuse({ gps, ocr, classifier, visual })` — visual participates (see Step 3).

- [ ] **Step 1: Write the failing tests**

```js
// add to test/analyze.test.mjs
import { analyze } from "../src/recognize/index.js";

test("analyze: injected visual signal feeds fuse()", async () => {
  const visual = {
    status: "ok",
    matches: [{ id: "c1", name_en: "C1", prefecture_en: "Kyoto", similarity: 0.97 }],
    vector: null, confidence: 0.9,
  };
  const r = await analyze(new Uint8Array(), { runOcr: false, runClassifier: false, runVisual: true },
    { prefFC, coversFC, visual });
  assert.equal(r.visual.status, "ok");
  assert.equal(r.combined.prefecture_en, "Kyoto");        // no GPS/OCR → visual wins
});

test("analyze: runVisual with no deps → visual.status 'unavailable' or 'no_library', no throw", async () => {
  const r = await analyze(new Uint8Array(), { runOcr: false, runClassifier: false, runVisual: true },
    { prefFC, coversFC });
  assert.ok(["unavailable", "no_library"].includes(r.visual.status));
});
```

```js
// add to test/fuse.test.mjs
import { fuse } from "../src/recognize/index.js";

test("fuse: visual agrees with GPS prefecture → bumps confidence + basis", () => {
  const c = fuse({
    gps: { prefecture_en: "Nara", nearestCover: null, confidence: 0.95 },
    ocr: null,
    classifier: null,
    visual: { status: "ok", matches: [{ prefecture_en: "Nara", similarity: 0.9 }], confidence: 0.9 },
  });
  assert.equal(c.prefecture_en, "Nara");
  assert.ok(c.basis.includes("visual match agrees"));
});

test("fuse: visual alone, strong → medium", () => {
  const c = fuse({
    gps: null, ocr: null, classifier: null,
    visual: { status: "ok", matches: [{ prefecture_en: "Gifu", similarity: 0.9 }], confidence: 0.9 },
  });
  assert.equal(c.prefecture_en, "Gifu");
  assert.equal(c.confidence, "medium");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/analyze.test.mjs test/fuse.test.mjs`
Expected: FAIL — `analyze` ignores `runVisual`; `fuse` ignores `visual`.

- [ ] **Step 3: Implement**

In `src/recognize/index.js`:

Add to `analyze()` after the OCR block, before building the result:

```js
  let visual = null;
  if (runVisual) {
    try {
      if (deps.visual) {
        visual = deps.visual;
      } else {
        const { loadEmbeddings, matchVisual } = deps.embeddings
          ? deps.embeddings
          : await import("./visualmatch.js");
        const emb = deps.embeddings ? deps.embeddings.data : await loadEmbeddings();
        if (!emb) {
          visual = { status: "no_library", matches: [], vector: null, confidence: 0 };
        } else {
          const embedFn = deps.embed || (await import("./embed.js")).embed;
          const vec = await embedFn(bitmap, deps);
          const raw = matchVisual(vec, emb, { topK: 5 });
          const byId = new Map(coversFC.features.map((f) => [f.properties.id, f.properties]));
          visual = {
            status: "ok",
            matches: raw.map((m) => ({
              id: m.id,
              name_en: byId.get(m.id)?.name_en ?? null,
              prefecture_en: byId.get(m.id)?.prefecture_en ?? null,
              similarity: m.similarity,
            })),
            vector: keepVector ? vec : null,
            confidence: Math.min(0.9, raw.length ? raw[0].similarity : 0),
          };
        }
      }
    } catch {
      visual = { status: "unavailable", matches: [], vector: null, confidence: 0 };
    }
  }
```

- destructure `runVisual = false, keepVector = false` from `opts` alongside the existing `runOcr` / `runClassifier`.
- `coversFC` is already resolved for the GPS signal via `geo(deps)`; make sure it is in scope here even when `gps` is null — call `const { coversFC } = await geo(deps);` near the top of `analyze()` (it caches), or hoist the existing call.
- add `visual` to the returned object: `{ image, gps, ocr, classifier, visual, combined: fuse({ gps, ocr, classifier, visual }) }`.

In `fuse(signals)` — destructure `visual` too. After the classifier block:

```js
  const visTop = visual && visual.status === "ok" && visual.matches[0];
  if (visTop && visTop.prefecture_en) {
    if (!prefecture_en) {
      prefecture_en = visTop.prefecture_en;
      level = visTop.similarity >= 0.85 ? "medium" : "low";
      basis.push("visual match");
    } else if (visTop.prefecture_en === prefecture_en) {
      basis.push("visual match agrees");
      if (level !== "high") level = "high";
    }
  }
```

(Adjust to match the existing `fuse()` variable names — it uses `prefecture_en`, `level`, `basis` per the shipped code.)

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/analyze.test.mjs test/fuse.test.mjs`
Expected: PASS. Then `npm test` — full suite green.

- [ ] **Step 5: Smoke guard**

In `scripts/smoke.mjs`:

```js
const visRes = await _analyze(new Uint8Array(), { runVisual: true, runClassifier: false, runOcr: false }, {});
check("analyze(runVisual) degrades, no throw",
  visRes.visual && ["no_library", "unavailable"].includes(visRes.visual.status));
```

- [ ] **Step 6: Run + commit**

Run: `npm run lint && npm test && node scripts/smoke.mjs`

```bash
git add src/recognize/index.js test/analyze.test.mjs test/fuse.test.mjs scripts/smoke.mjs
git commit -m "feat: visual signal in analyze() + fuse()"
```

---

## Task 9: `scripts/build_embeddings.py` + seed `data/embeddings*` + `validate.py`

**Files:**
- Create: `scripts/build_embeddings.py`, `scripts/test_build_embeddings.py`, `data/embeddings.bin`, `data/embeddings-index.json`
- Modify: `scripts/validate.py`

**Interfaces:**
- Produces: `collect_photos()` → `[(pathlib.Path, id)]` from `data/personal/*.json` features with a non-null `photo`. `main()`: if none → write `data/embeddings-index.json` = `{"dim": 384, "ids": []}` + a 0-byte `data/embeddings.bin`, exit 0. Else → embed each (via `fetch_embed_model.model_path()` + `onnxruntime`), L2-normalise, sort by id, write both files.

- [ ] **Step 1: Write the failing gate test**

```python
# scripts/test_build_embeddings.py
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent


class GateTest(unittest.TestCase):
    def test_no_photos_writes_empty_index_exit0(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            (tmp / "data" / "personal").mkdir(parents=True)
            (tmp / "data" / "personal" / "mine.json").write_text("[]")
            r = subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "build_embeddings.py")],
                cwd=tmp, capture_output=True, text=True,
            )
            self.assertEqual(r.returncode, 0, r.stderr)
            idx = json.loads((tmp / "data" / "embeddings-index.json").read_text())
            self.assertEqual(idx["ids"], [])
            self.assertEqual(idx["dim"], 384)
            self.assertEqual((tmp / "data" / "embeddings.bin").stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd scripts && python3 -m unittest test_build_embeddings -v`
Expected: FAIL — `build_embeddings.py` missing.

- [ ] **Step 3: Implement**

```python
#!/usr/bin/env python3
"""data/personal/*.json (photo + id) -> data/embeddings.bin + data/embeddings-index.json.

Heavy deps (onnxruntime, numpy, Pillow) are imported only when there is work to
do, so the zero-photos gate path runs with the stdlib.
"""
from __future__ import annotations

import json
import pathlib
import struct
import sys

ROOT = pathlib.Path.cwd()
DIM = json.loads((pathlib.Path(__file__).resolve().parent.parent / "models" / "embed-model.json").read_text())["dim"]
OUT_BIN = ROOT / "data" / "embeddings.bin"
OUT_IDX = ROOT / "data" / "embeddings-index.json"


def collect_photos():
    out = []
    for jf in sorted((ROOT / "data" / "personal").glob("*.json")):
        if jf.name.startswith("_"):
            continue
        entries = json.loads(jf.read_text(encoding="utf-8"))
        for e in entries if isinstance(entries, list) else [entries]:
            p = e.get("properties", {})
            photo, cid = p.get("photo"), p.get("id")
            if not photo or not cid:
                continue
            path = ROOT / photo
            if path.exists():
                out.append((path, cid))
    return sorted(out, key=lambda t: t[1])


def _write(ids, vectors):
    OUT_IDX.write_text(json.dumps({"dim": DIM, "ids": ids}, ensure_ascii=False), encoding="utf-8")
    with open(OUT_BIN, "wb") as f:
        for v in vectors:
            f.write(struct.pack(f"<{DIM}f", *v))


def main() -> None:
    photos = collect_photos()
    if not photos:
        _write([], [])
        print("no contributed photos — wrote empty embeddings index", file=sys.stderr)
        return

    import numpy as np
    import onnxruntime as ort
    from PIL import Image
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from fetch_embed_model import model_path

    sess = ort.InferenceSession(str(model_path()), providers=["CPUExecutionProvider"])
    mean = np.array([0.485, 0.456, 0.406], dtype="float32")
    std = np.array([0.229, 0.224, 0.225], dtype="float32")
    iname = sess.get_inputs()[0].name
    oname = sess.get_outputs()[0].name

    ids, vecs = [], []
    for path, cid in photos:
        img = Image.open(path).convert("RGB").resize((224, 224))
        arr = (np.asarray(img, dtype="float32") / 255.0 - mean) / std
        arr = arr.transpose(2, 0, 1)[None]
        out = sess.run([oname], {iname: arr})[0]
        cls = out[0, 0, :].astype("float32")
        cls /= (np.linalg.norm(cls) or 1.0)
        ids.append(cid)
        vecs.append(cls.tolist())
        print(f"  embedded {cid}", file=sys.stderr)

    _write(ids, vecs)
    print(f"wrote {len(ids)} embeddings ({DIM}-d) -> data/embeddings.bin", file=sys.stderr)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the gate test — passes; seed the empty files**

Run: `cd scripts && python3 -m unittest test_build_embeddings -v` → PASS.
Run: `python3 scripts/build_embeddings.py` (from repo root) → writes `data/embeddings-index.json` (`{"dim":384,"ids":[]}`) and a 0-byte `data/embeddings.bin`.

- [ ] **Step 5: `validate.py` check**

In `scripts/validate.py`, before `return 0`:

```python
    idx_p = ROOT / "data" / "embeddings-index.json"
    if idx_p.exists():
        idx = json.loads(idx_p.read_text(encoding="utf-8"))
        cover_ids = {f["properties"]["id"] for f in fc["features"]}
        # personal ids may not be in covers.geojson until build_covers runs; allow either
        personal_ids = set()
        for jf in (ROOT / "data" / "personal").glob("*.json"):
            if jf.name.startswith("_"):
                continue
            for e in json.loads(jf.read_text(encoding="utf-8")):
                personal_ids.add(e["properties"]["id"])
        unknown = [i for i in idx["ids"] if i not in cover_ids and i not in personal_ids]
        if unknown:
            print(f"embeddings-index: unknown ids {unknown[:5]}", file=sys.stderr)
            return 1
        want = len(idx["ids"]) * idx["dim"] * 4
        got = (ROOT / "data" / "embeddings.bin").stat().st_size
        if got != want:
            print(f"embeddings.bin: {got} bytes, expected {want}", file=sys.stderr)
            return 1
        print(f"OK - {len(idx['ids'])} embeddings")
```

- [ ] **Step 6: Run + commit**

Run: `python3 scripts/validate.py` → OK. `npm test` unaffected.

```bash
git add scripts/build_embeddings.py scripts/test_build_embeddings.py scripts/validate.py data/embeddings.bin data/embeddings-index.json
git commit -m "feat: build_embeddings.py + empty embeddings seed + validate check"
```

---

## Task 10: `.github/workflows/embed.yml`

**Files:**
- Create: `.github/workflows/embed.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Rebuild embeddings

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
  embed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt numpy onnxruntime
      - name: Rebuild embeddings
        run: |
          python scripts/build_embeddings.py
          python scripts/validate.py
      - name: Open a PR if embeddings changed
        uses: peter-evans/create-pull-request@v7
        with:
          branch: data/embeddings-refresh
          commit-message: "data: rebuild visual-match embeddings"
          title: "data: rebuild visual-match embeddings"
          body: Automated rebuild from contributed photos.
          add-paths: |
            data/embeddings.bin
            data/embeddings-index.json
```

- [ ] **Step 2: Verify YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/embed.yml'))"` → no error.

- [ ] **Step 3: Commit + deploy checkpoint**

```bash
git add .github/workflows/embed.yml
git commit -m "ci: rebuild visual-match embeddings on new photos, open a PR"
```

Push; CI green; merge to `main`; deploy (site unaffected — dormant until photos exist).

---

## Task 11: "Find visual matches" in the form and the identify tool

**Files:**
- Modify: `src/contribute/form.js`, `src/identify/view.js`, `index.html`, `style.css`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `analyze(file, { runVisual: true, … })`; the `visual` signal shape from Task 8.
- Produces: no new exports; UI only.

- [ ] **Step 1: Form button**

In `src/contribute/form.js` `renderAnalysis(a)`, append a button that re-runs analysis with `runVisual: true` and re-renders, plus a matches list when `a.visual`:

```js
  if (a.visual && a.visual.status === "ok") {
    box.innerHTML +=
      `<div class="sig"><b>Visual match</b><br>` +
      a.visual.matches.slice(0, 3).map((m) =>
        `${esc(m.name_en || m.id)} (${esc(m.prefecture_en || "?")}) — ${(m.similarity * 100).toFixed(0)}%`,
      ).join("<br>") + `</div>`;
  } else if (a.visual && a.visual.status === "no_library") {
    box.innerHTML += `<div class="sig">Visual match: no reference library yet — add contributed photos to build it.</div>`;
  }
  const vbtn = document.createElement("button");
  vbtn.type = "button"; vbtn.className = "reset"; vbtn.textContent = "Find visual matches (~23 MB once)";
  vbtn.onclick = async () => {
    vbtn.disabled = true; vbtn.textContent = "Matching…";
    current.analysis = await analyze(current.file, { runOcr: false, runVisual: true, runClassifier: true });
    renderAnalysis(current.analysis); prefill(current.analysis);
  };
  box.appendChild(vbtn);
```

- [ ] **Step 2: Identify tool**

In `src/identify/view.js`, the `#id-file` handler already runs `analyze(file, { runOcr: true, runClassifier: true })`. Add `runVisual: true` to that call, and in `render(a)` add a "Visual match" card (same shape as the OCR/classifier cards, escaped) listing `a.visual.matches.slice(0,3)` with similarity %, or the `no_library` / `unavailable` message.

- [ ] **Step 3: Smoke**

`scripts/smoke.mjs` — the form/identify visual buttons can't run tesseract/onnx in jsdom; just assert the button exists after a canned render, or skip (the Task 8 smoke guard already covers `analyze(runVisual)` degradation). Keep it minimal: no new smoke check required beyond Task 8's.

- [ ] **Step 4: Run + browser check + commit**

Run: `npm run lint && npm test && node scripts/smoke.mjs` — green.
`npm run serve`; `?tool=identify`, drop `test/fixtures/gps.jpg`, click nothing extra → the identify card shows "Visual match: no reference library yet". No `embed`/onnx request in the Network tab until a visual button is pressed.

```bash
git add src/contribute/form.js src/identify/view.js index.html style.css scripts/smoke.mjs
git commit -m "feat: 'Find visual matches' in the form and identify tool"
```

Push; CI green; merge to `main`; deploy. **End of Phase 3.**

---

## Task 12: `dedup.js` — `visualDuplicate` + `duplicateVerdict` + `clusterEntries`

**Files:**
- Modify: `src/recognize/dedup.js`, `test/dedup.test.mjs`

**Interfaces:**
- Consumes: `matchVisual` output shape (via `analysis.visual`), `src/geo.js#haversine`, the existing `clusterByLocation`.
- Produces:
  - `visualDuplicate(analysis)` → `{ duplicate, of: { id, name_en, similarity } | null }`. `analysis.visual?.matches[0].similarity > SIM_DUP`.
  - `duplicateVerdict(analysis)` → `{ level: "new"|"likely"|"confirmed", reasons: string[], of: { id, name_en } | null }`. `confirmed` when BOTH `gpsDuplicate` and `visualDuplicate` fire (any cover); `likely` when exactly one; `new` when neither. `of` = the GPS one's `of` if present else the visual one's.
  - `clusterEntries(entries, { radiusM = CLUSTER_M, simThreshold = SIM_DUP } = {})` → `clusterByLocation` first, then also union any two entries whose `vector` (Float32Array) cosine > `simThreshold`.

- [ ] **Step 1: Write the failing tests** (append to `test/dedup.test.mjs`)

```js
import { visualDuplicate, duplicateVerdict, clusterEntries, SIM_DUP } from "../src/recognize/dedup.js";

test("SIM_DUP is 0.93", () => assert.equal(SIM_DUP, 0.93));

test("visualDuplicate: strong similarity", () => {
  const r = visualDuplicate({ visual: { status: "ok", matches: [{ id: "c1", name_en: "C1", similarity: 0.96 }] } });
  assert.equal(r.duplicate, true);
  assert.equal(r.of.id, "c1");
});
test("visualDuplicate: weak similarity", () => {
  assert.equal(visualDuplicate({ visual: { status: "ok", matches: [{ similarity: 0.6 }] } }).duplicate, false);
});

test("duplicateVerdict: both signals → confirmed", () => {
  const v = duplicateVerdict({
    gps: { nearestCover: { id: "c1", name_en: "C1", dist_m: 6 } },
    visual: { status: "ok", matches: [{ id: "c1", name_en: "C1", similarity: 0.97 }] },
  });
  assert.equal(v.level, "confirmed");
  assert.equal(v.of.id, "c1");
  assert.equal(v.reasons.length, 2);
});
test("duplicateVerdict: gps only → likely", () => {
  assert.equal(duplicateVerdict({
    gps: { nearestCover: { id: "c1", name_en: "C1", dist_m: 6 } }, visual: null,
  }).level, "likely");
});
test("duplicateVerdict: neither → new", () => {
  assert.equal(duplicateVerdict({ gps: null, visual: null }).level, "new");
});

test("clusterEntries: merges two far-apart rows by embedding similarity", () => {
  const v = new Float32Array([1, 0, 0]);
  const near = new Float32Array([0.98, 0.02, 0]);
  const a = { lon: 139.7, lat: 35.68, vector: v };
  const b = { lon: 135.5, lat: 34.7, vector: near }; // 400 km away
  const out = clusterEntries([a, b]);
  assert.equal(out[0].clusterId, out[1].clusterId);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/dedup.test.mjs`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Implement** (append to `src/recognize/dedup.js`)

```js
export function visualDuplicate(analysis) {
  const m = analysis && analysis.visual && analysis.visual.status === "ok" && analysis.visual.matches[0];
  if (m && m.similarity > SIM_DUP) {
    return { duplicate: true, of: { id: m.id, name_en: m.name_en, similarity: m.similarity } };
  }
  return { duplicate: false, of: null };
}

export function duplicateVerdict(analysis) {
  const g = gpsDuplicate(analysis);
  const v = visualDuplicate(analysis);
  const reasons = [];
  if (g.duplicate) reasons.push(`${g.of.dist_m} m from ${g.of.name_en || g.of.id}`);
  if (v.duplicate) reasons.push(`${(v.of.similarity * 100).toFixed(0)}% visual match to ${v.of.name_en || v.of.id}`);
  let level = "new";
  if (g.duplicate && v.duplicate) level = "confirmed";
  else if (g.duplicate || v.duplicate) level = "likely";
  return { level, reasons, of: g.of || v.of };
}

function cos(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

export function clusterEntries(entries, { radiusM = CLUSTER_M, simThreshold = SIM_DUP } = {}) {
  clusterByLocation(entries, { radiusM });
  // second pass: merge clusters by embedding similarity
  const rep = {};
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const vi = entries[i].vector;
      const vj = entries[j].vector;
      if (vi && vj && vi.length === vj.length && cos(vi, vj) > simThreshold) {
        const to = entries[i].clusterId;
        const from = entries[j].clusterId;
        rep[from] = to;
      }
    }
  }
  const resolve = (c) => (rep[c] === undefined ? c : (rep[c] = resolve(rep[c])));
  entries.forEach((e) => { e.clusterId = resolve(e.clusterId); });
  return entries;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/dedup.test.mjs` → all pass. `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/recognize/dedup.js test/dedup.test.mjs
git commit -m "feat: dedup.js — visualDuplicate + duplicateVerdict + clusterEntries"
```

---

## Task 13: swap the form / batch / identify to the combined verdict

**Files:**
- Modify: `src/contribute/form.js`, `src/contribute/batch.js`, `src/identify/view.js`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `dedup.js#duplicateVerdict`, `dedup.js#clusterEntries`.
- Produces: behaviour only.

- [ ] **Step 1: Form**

In `src/contribute/form.js` `renderAnalysis(a)`, replace the Task-4 `gpsDuplicate(a)` block with:

```js
  const v = duplicateVerdict(a);
  if (v.level !== "new") {
    box.innerHTML +=
      `<div class="sig" style="color:#b45309">⚠️ ${esc(v.level)} duplicate` +
      (v.of ? ` of <a href="?id=${esc(v.of.id)}">${esc(v.of.name_en || v.of.id)}</a>` : "") +
      ` — ${esc(v.reasons.join("; "))}. Add it only if it is a different design.</div>`;
  }
```

Swap the import to `import { duplicateVerdict } from "../recognize/dedup.js";`.

- [ ] **Step 2: Batch**

In `src/contribute/batch.js`:
- pass `runVisual: true, keepVector: true` in the per-row `analyze()` call.
- store `row.vector = row.analysis.visual?.vector || null`.
- replace the Task-4 `clusterByLocation(...)` block with `clusterEntries(rows.map((r) => Object.assign(r, { lon: r.analysis?.gps?.lon ?? NaN, lat: r.analysis?.gps?.lat ?? NaN })))`; keep the same "first of each cluster kept, rest skipped with a reason" loop, but the reason now reads `same cover as row N (location and/or look)`.

- [ ] **Step 3: Identify tool**

In `src/identify/view.js` `render(a)`, add a prominent line above the signal cards when `duplicateVerdict(a).level !== "new"`:

```js
  const dv = duplicateVerdict(a);
  const dupLine = dv.level === "new" ? "" :
    `<div class="verdict" style="color:#b45309">Already on the map` +
    (dv.of ? `: <a href="?id=${esc(dv.of.id)}">${esc(dv.of.name_en || dv.of.id)}</a>` : "") +
    ` (${esc(dv.level)})</div>`;
```

Prepend `dupLine` to the result HTML. Import `duplicateVerdict`.

- [ ] **Step 4: Smoke + run**

`scripts/smoke.mjs` — add a pure check:

```js
import { duplicateVerdict } from "../src/recognize/dedup.js";
check("duplicateVerdict: confirmed on both signals",
  duplicateVerdict({
    gps: { nearestCover: { id: "x", name_en: "x", dist_m: 4 } },
    visual: { status: "ok", matches: [{ id: "x", similarity: 0.98 }] },
  }).level === "confirmed");
```

Run: `npm run lint && npm test && node scripts/smoke.mjs` — green.

- [ ] **Step 5: Commit + deploy checkpoint**

```bash
git add src/contribute/form.js src/contribute/batch.js src/identify/view.js scripts/smoke.mjs
git commit -m "feat: combined GPS + visual duplicate verdict in form, batch, identify"
```

Push; CI green; merge to `main`; deploy. **End of Phase 4.**

---

## Task 14: README + final verification

**Files:**
- Modify: `README.md`, `.gitignore` (confirm `.cache/`)

- [ ] **Step 1: README**

Add after the existing "Origin recognition" table:

```markdown
### Batch add + deduplication

`?tool=batch` (or the **Batch** button) takes several photos at once: each is
analysed, rows are editable inline, and you get one JSON array for
`data/personal/mine.json` plus a `.zip` of every WebP. Photos at (nearly) the
same spot, or that look near-identical, are flagged as duplicates and skipped
by default.

Deduplication combines GPS proximity (< 15 m) and **visual similarity**: a
DINOv2-small image encoder (Apache-2.0, ~23 MB, loaded lazily from the Hugging
Face CDN — nothing large is committed) embeds the photo and compares it against
`data/embeddings.bin`. Like the classifier, the visual library is empty until
contributed photos exist; `scripts/build_embeddings.py` + `.github/workflows/embed.yml`
regenerate it via PR. `models/embed-model.json` records the model, revision and
licence.
```

- [ ] **Step 2: Full local verification** — run each, record the result:

1. `npm run lint` → clean
2. `npm test` → all `test/*.test.mjs` pass (report count; expect ~49)
3. `node scripts/smoke.mjs` → every line `PASS`
4. `node scripts/test_geo_parity.mjs` → `geo parity OK`
5. `python3 scripts/validate.py` → `OK - …` (incl. `OK - 0 embeddings`)
6. `cd scripts && python3 -m unittest discover -p 'test_*.py'` → OK (incl. `test_build_embeddings`)
7. `python3 -c "import yaml; [yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/embed.yml','.github/workflows/train-model.yml','.github/workflows/deploy.yml','.github/workflows/data-refresh.yml']]"` → no error
8. Lazy-load audit — `grep -rn "from ['\"]https://" src/` and `grep -rnE "import .*(fflate|onnxruntime|dinov2|huggingface)" src/` → the only matches are dynamic `import(...)` calls or string constants in `src/config.js`; nothing in `index.html`.
9. `git grep -nE 'TODO|FIXME' src/ scripts/` → nothing new

- [ ] **Step 3: Commit + final deploy**

```bash
git add README.md .gitignore
git commit -m "docs: document batch add + visual-match deduplication"
```

Push; `ci.yml` green; merge to `main`; `deploy.yml` publishes; load
`https://sofianebeloucif.github.io/manhole-japan/?tool=batch`.

---

## Self-Review

**Spec coverage**

| Spec section | Task(s) |
| --- | --- |
| P1 batch panel, `?tool=batch`, sequential analyse, editable rows, keep/skip | 2 |
| `buildFeatureArray` (schema-valid array), `zipWebps` (lazy fflate), per-row + zip download | 1, 2 |
| P2 `dedup.js` `gpsDuplicate` + `clusterByLocation`, constants | 3 |
| P2 wiring: form warning (non-blocking), batch cluster-skip, `build_covers.py` proximity warning | 4 |
| P3 model: DINOv2-small, HF-CDN, `embed-model.json`, licence, cache fetcher | 5 |
| P3 `embed.js` (lazy ort, CLS token, L2-norm, ImageNet preprocess, injectable session) | 6 |
| P3 `visualmatch.js` (`loadEmbeddings` parse + null guards, `matchVisual` cosine) | 7 |
| P3 `visual` signal in `analyze()` (`runVisual`/`keepVector`, `no_library`/`unavailable`, never throws) + `fuse()` | 8 |
| P3 `build_embeddings.py` (gate path stdlib-only) + empty seed + `validate.py` integrity | 9 |
| P3 `embed.yml` (PR, never commits to main) | 10 |
| P3 "Find visual matches" in form + identify | 11 |
| P4 `visualDuplicate` / `duplicateVerdict` / `clusterEntries` | 12 |
| P4 swap form/batch/identify to `duplicateVerdict` + `clusterEntries` (batch keeps `keepVector`) | 13 |
| Cross-cutting: first-paint audit, README, licence note, full verification | 14 |
| No-backend, `analyze()` always resolves, schema-valid, plain commits | every task's Global Constraints |

Every spec section maps to a task.

**Placeholder scan:** no "TBD/TODO/handle edge cases/similar to Task N". The
`build_covers.py` proximity-warning step (Task 4 Step 3) describes a helper the
implementer writes (`_haversine_m`, `_existing_near`) with the exact call shape
and the "warning only, never exit" rule stated — acceptable, it is a 6-line
helper in a file whose surrounding code the implementer is already editing.
`fuse()` edits (Task 8 Step 3) say "adjust to the existing variable names" —
the shipped `fuse()` uses `prefecture_en` / `level` / `basis`, which the code
block already uses; this is a real instruction, not a placeholder.

**Type consistency:** `analyze(file, opts, deps)` / `fuse(signals)` signatures
match across Tasks 8, 11, 13. The `visual` signal shape
(`{status, matches:[{id,name_en,prefecture_en,similarity}], vector, confidence}`)
is produced in Task 8 and consumed identically in `fuse()` (Task 8),
`visualDuplicate` (Task 12), `renderAnalysis` (Task 11/13), and `view.js render`
(Task 11/13). `loadEmbeddings` → `{dim, ids, vectors}` (Task 7) is exactly what
`matchVisual` (Task 7) and `analyze()` (Task 8) expect. `clusterByLocation` adds
`clusterId` (Task 3); `clusterEntries` (Task 12) reads and rewrites the same
field. `duplicateVerdict` → `{level, reasons, of}` (Task 12) is consumed with
those keys in Task 13. `DUP_M`/`CLUSTER_M`/`SIM_DUP` are defined once in Task 3 /
Task 12 and imported elsewhere. `buildFeatureArray(entries)` takes the same
`input` object shape `buildFeature` already takes (Task 1), and Task 2 builds
exactly that shape per row.
