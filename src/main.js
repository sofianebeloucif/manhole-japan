import { DATA_URL, PREFECTURES_URL } from "./config.js";
import { createMap } from "./map.js";
import * as filters from "./filters.js";
import * as stats from "./stats.js";
import * as panel from "./panel.js";
import * as url from "./urlState.js";
import { openContribute } from "./contribute/form.js";
import { openBatch } from "./contribute/batch.js";
import { openIdentify, bindMap as bindIdentifyMap } from "./identify/view.js";

const fc = (features) => ({ type: "FeatureCollection", features });

let ALL = [];
let byId = new Map();
const view = createMap();

// ---- theme -------------------------------------------------------------
const themeToggle = document.getElementById("theme-toggle");
function initialTheme() {
  try {
    const saved = localStorage.getItem("mj-theme");
    if (saved) return saved;
  } catch {}
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("mj-theme", t);
  } catch {}
  view.ready.then(() => view.setBasemap(t));
}
let theme = initialTheme();
document.documentElement.dataset.theme = theme;
themeToggle.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme(theme);
});

// ---- sidebar collapse (mobile) --------------------------------------
const sidebar = document.getElementById("sidebar");
document.getElementById("sidebar-toggle").addEventListener("click", () => {
  sidebar.classList.remove("collapsed");
});

// ---- contribute panel ---------------------------------------------------
document.getElementById("add-cover").addEventListener("click", openContribute);

// ---- batch add covers -------------------------------------------------
document.getElementById("batch-open").addEventListener("click", openBatch);
if (new URLSearchParams(location.search).get("tool") === "batch") openBatch();

// ---- identify a cover -------------------------------------------------
bindIdentifyMap(view);
if (new URLSearchParams(location.search).get("tool") === "identify") openIdentify();

// ---- render loop --------------------------------------------------------
function refresh({ fit = false } = {}) {
  const state = filters.getState();
  const shown = filters.apply(ALL, state);
  view.setCovers(fc(shown));
  view.highlightPrefecture(state.pref);
  stats.render(shown, {
    activePref: state.pref,
    onPrefClick: (name) => {
      filters.setState({ ...state, pref: name });
      selected = "";
      panel.close();
      refresh({ fit: true });
      syncUrl();
    },
  });
  if (fit) view.fitFeatures(shown);
}

// ---- selection -------------------------------------------------------
let selected = "";
function select(id, { fly = false } = {}) {
  selected = id || "";
  view.setSelected(selected);
  const f = byId.get(selected);
  if (f) {
    panel.show(f, {
      onTheme: (t) => {
        filters.setState({ ...filters.getState(), q: t, pref: "" });
        selected = "";
        panel.close();
        refresh({ fit: true });
        syncUrl();
      },
    });
    if (fly) view.flyToFeature(f);
  } else {
    panel.close();
  }
}
view.on("select", (feature) => {
  select(feature.properties.id);
  syncUrl();
});
panel.onClose(() => {
  if (!selected) return;
  selected = "";
  view.setSelected("");
  syncUrl();
});

// ---- url sync -------------------------------------------------------
function syncUrl({ replace = false } = {}) {
  const s = filters.getState();
  url.write({ q: s.q, pref: s.pref, cat: s.cat, id: selected }, { replace });
}
function applyFromUrl(st, { fit }) {
  filters.setState({ q: st.q, pref: st.pref, cat: st.cat });
  refresh({ fit });
  if (st.id && byId.has(st.id)) select(st.id, { fly: true });
  else {
    selected = "";
    view.setSelected("");
    panel.close();
  }
}
url.onPopState((st) => applyFromUrl(st, { fit: false }));

filters.onChange(() => {
  selected = "";
  panel.close();
  refresh({ fit: true });
  syncUrl();
});

// ---- boot -------------------------------------------------------------
Promise.all([
  fetch(DATA_URL).then((r) => r.json()),
  fetch(PREFECTURES_URL).then((r) => r.json()),
  view.ready,
]).then(([covers, prefs]) => {
  ALL = covers.features;
  byId = new Map(ALL.map((f) => [f.properties.id, f]));
  view.setPrefectures(prefs);
  filters.populatePrefectures(ALL);
  if (theme === "dark") view.setBasemap("dark");
  applyFromUrl(url.read(), { fit: true });
  syncUrl({ replace: true });
});
