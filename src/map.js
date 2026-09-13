import { BASEMAPS, JAPAN_BOUNDS, MAP_MAX_BOUNDS, MAP_MIN_ZOOM, CATEGORIES } from "./config.js";

const EMPTY = { type: "FeatureCollection", features: [] };
const catMatch = CATEGORIES.flatMap((c) => [c.id, c.color]);
// Desktop reserves a left gutter for the docked sidebar. Under the 640px
// breakpoint (style.css) the sidebar sits on TOP of the map instead, so a
// 360px left pad would leave almost nothing to fit into on a phone-width
// viewport, so pad the top a bit for the always-visible toggle button instead.
const PAD_DESKTOP = { top: 40, right: 40, bottom: 40, left: 360 };
const PAD_MOBILE = { top: 90, right: 20, bottom: 20, left: 20 };
const pad = () =>
  typeof window !== "undefined" && window.innerWidth <= 640 ? PAD_MOBILE : PAD_DESKTOP;

export function createMap(theme = "light") {
  const map = new maplibregl.Map({
    container: "map",
    // Start on the right style from the very first paint. Creating with
    // "light" and swapping to "dark" right after boot (as this used to do)
    // races map.setStyle()'s async source teardown against the initial
    // setCovers()/setPrefectures() calls. On a system already in dark
    // mode, the covers/prefectures sources could still be mid-teardown
    // when setData() ran, silently dropping the data (setSource()?.setData
    // no-ops on a missing source, no error). Avoid the swap entirely for
    // the common case; setBasemap() below still handles a later manual toggle.
    style: BASEMAPS[theme] || BASEMAPS.light,
    bounds: JAPAN_BOUNDS,
    fitBoundsOptions: { padding: pad() },
    attributionControl: { compact: true },
    // Nothing here to see outside Japan, so don't let panning or zooming
    // out reach the rest of the world.
    maxBounds: MAP_MAX_BOUNDS,
    minZoom: MAP_MIN_ZOOM,
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
      map.fitBounds(JAPAN_BOUNDS, { padding: pad() });
    },
    flyToFeature(f) {
      map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 13), speed: 1.4 });
    },
    fitFeatures(features) {
      if (!features.length) return;
      const b = new maplibregl.LngLatBounds();
      for (const f of features) b.extend(f.geometry.coordinates);
      const p = pad();
      map.fitBounds(b, { padding: { ...p, left: p.left + 20 }, maxZoom: 12 });
    },
    setBasemap(theme) {
      map.setStyle(BASEMAPS[theme] || BASEMAPS.light);
      // "styledata" fires repeatedly while a style loads (once per source/
      // tile event, not just once for the whole style) and can fire before
      // the new style is actually ready to accept addSource()/addLayer() -
      // "style.load" is maplibre's dedicated single-fire event for "the new
      // style is fully loaded", the reliable one to re-add sources on.
      map.once("style.load", () => {
        if (!map.getSource("covers")) addSourcesAndLayers();
      });
    },
  };
}
