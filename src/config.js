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
