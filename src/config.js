export const DATA_URL = "data/covers.geojson";
export const PREFECTURES_URL = "data/prefectures.geojson";

export const BASEMAPS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export const JAPAN_BOUNDS = [[122.0, 24.0], [154.0, 46.5]];

export const CATEGORIES = [
  { id: "pokefuta", label: "Poké Lids", color: "#3b82f6" },
  { id: "manhole_card", label: "Manhole cards", color: "#f59e0b" },
  { id: "personal", label: "My finds", color: "#16a34a" },
  { id: "osm", label: "Other (OSM)", color: "#8957e5" },
];

export const CATEGORY_COLOR = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.color]),
);

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
