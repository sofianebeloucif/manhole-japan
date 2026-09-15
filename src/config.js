export const DATA_URL = "data/covers.geojson";
export const PREFECTURES_URL = "data/prefectures.geojson";

export const BASEMAPS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export const JAPAN_BOUNDS = [[122.0, 24.0], [154.0, 46.5]];
// Hard pan/zoom limits so the map never scrolls out to the rest of the
// world. Padded wider than JAPAN_BOUNDS (which is just the fitBounds
// target) so panning to the edges of the country doesn't feel clipped.
export const MAP_MAX_BOUNDS = [[105.0, 12.0], [170.0, 58.0]];
export const MAP_MIN_ZOOM = 4;

// Only the categories actually present in data/covers.geojson today.
// scripts/schema.json still allows "manhole_card" and "osm" for the
// roadmap items in README.md (GKP manhole cards, OSM enrichment); add
// them back here once real data for either one exists, so the filter
// chips never offer a category with nothing behind it.
export const CATEGORIES = [
  { id: "pokefuta", label: "Poké Lids", color: "#3b82f6" },
  { id: "personal", label: "My finds", color: "#16a34a" },
  { id: "commons", label: "Community photos", color: "#f59e0b" },
];

export const CATEGORY_COLOR = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.color]),
);

export const CDN = {
  // resolve the newest working versions at implementation time; pin exact.
  exifr: "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs",
  // esm.sh, not jsdelivr: this package's dist file has bare-specifier
  // imports (js-yaml, clipper-lib, @techstark/opencv-js) that only resolve
  // via a bundler/node_modules, so a raw browser import() of the jsdelivr
  // file throws immediately. esm.sh rewrites those into resolvable URLs.
  paddleocrJs: "https://esm.sh/@paddleocr/paddleocr-js@0.4.2",
  ort: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.mjs",
  ortWasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/",
  fflate: "https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js",
  embedModel: "https://huggingface.co/Xenova/dinov2-small/resolve/c2bb04a51fab207c420665f1946016107bffc701/onnx/model_quantized.onnx",
};
export const MUNICIPALITIES_URL = "data/municipalities.json";
export const UNCLASSIFIED_URL = "data/unclassified.json";
export const MODEL_META_URL = "models/meta.json";
export const MODEL_ONNX_URL = "models/prefecture-clf.onnx";
export const EMBEDDINGS_URL = "data/embeddings.bin";
export const EMBEDDINGS_INDEX_URL = "data/embeddings-index.json";
