import { BASEMAPS, JAPAN_BOUNDS, CATEGORIES } from "./config.js";

const EMPTY = { type: "FeatureCollection", features: [] };
const catMatch = CATEGORIES.flatMap((c) => [c.id, c.color]);
const PAD = { top: 40, right: 40, bottom: 40, left: 360 };

export function createMap() {
  const map = new maplibregl.Map({
    container: "map",
    style: BASEMAPS.light,
    bounds: JAPAN_BOUNDS,
    fitBoundsOptions: { padding: PAD },
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "bottom-right");

  const state = { covers: EMPTY, prefs: EMPTY, selectedId: "", pref: "" };
  const listeners = { select: [] };
  const emit = (name, arg) => listeners[name].forEach((fn) => fn(arg));

  const radius = () => ["case", ["==", ["get", "id"], state.selectedId], 9, 6];
  const stroke = () => ["case", ["==", ["get", "id"], state.selectedId], 3, 1.5];

  function addSourcesAndLayers() {
    map.addSource("prefectures", { type: "geojson", data: state.prefs });
    map.addSource("covers", {
      type: "geojson",
      data: state.covers,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 11,
    });

    map.addLayer({
      id: "pref-fill",
      type: "fill",
      source: "prefectures",
      paint: {
        "fill-color": "#e60012",
        "fill-opacity": ["case", ["==", ["get", "pref_en"], state.pref], state.pref ? 0.08 : 0, 0],
      },
    });
    map.addLayer({
      id: "pref-line",
      type: "line",
      source: "prefectures",
      paint: { "line-color": "#8b95a1", "line-width": 0.5, "line-opacity": 0.35 },
    });

    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "covers",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#3b82f6",
        "circle-opacity": 0.85,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 30, 26, 80, 34],
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.55)",
      },
    });
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "covers",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
      },
      paint: { "text-color": "#ffffff" },
    });

    map.addLayer({
      id: "points",
      type: "circle",
      source: "covers",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["match", ["get", "category"], ...catMatch, "#3b82f6"],
        "circle-radius": radius(),
        "circle-stroke-width": stroke(),
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  function bindEvents() {
    map.on("click", "clusters", (e) => {
      const f = e.features[0];
      map
        .getSource("covers")
        .getClusterExpansionZoom(f.properties.cluster_id)
        .then((z) => map.easeTo({ center: f.geometry.coordinates, zoom: z }));
    });
    map.on("click", "points", (e) => emit("select", e.features[0]));
    for (const l of ["clusters", "points"]) {
      map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
    }
  }

  const ready = new Promise((res) =>
    map.on("load", () => {
      addSourcesAndLayers();
      bindEvents();
      res();
    }),
  );

  return {
    map,
    ready,
    on(name, fn) {
      listeners[name].push(fn);
    },
    setCovers(fc) {
      state.covers = fc;
      map.getSource("covers")?.setData(fc);
    },
    setPrefectures(fc) {
      state.prefs = fc;
      map.getSource("prefectures")?.setData(fc);
    },
    setSelected(id) {
      state.selectedId = id || "";
      if (!map.getLayer("points")) return;
      map.setPaintProperty("points", "circle-radius", radius());
      map.setPaintProperty("points", "circle-stroke-width", stroke());
    },
    highlightPrefecture(name) {
      state.pref = name || "";
      if (!map.getLayer("pref-fill")) return;
      map.setPaintProperty("pref-fill", "fill-opacity", [
        "case", ["==", ["get", "pref_en"], state.pref], state.pref ? 0.08 : 0, 0,
      ]);
    },
    fitJapan() {
      map.fitBounds(JAPAN_BOUNDS, { padding: PAD });
    },
    flyToFeature(f) {
      map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 13), speed: 1.4 });
    },
    fitFeatures(features) {
      if (!features.length) return;
      const b = new maplibregl.LngLatBounds();
      for (const f of features) b.extend(f.geometry.coordinates);
      map.fitBounds(b, { padding: { ...PAD, left: 380 }, maxZoom: 12 });
    },
    setBasemap(theme) {
      map.setStyle(BASEMAPS[theme] || BASEMAPS.light);
      map.once("styledata", () => {
        if (!map.getSource("covers")) addSourcesAndLayers();
      });
    },
  };
}
