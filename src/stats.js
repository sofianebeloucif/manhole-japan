import { CATEGORY_COLOR } from "./config.js";

const statsEl = document.getElementById("stats");
const barsEl = document.getElementById("prefbars");
const scopeNote = document.getElementById("scope-note");

function uniq(features, key) {
  const s = new Set();
  for (const f of features) {
    const v = f.properties[key];
    if (v) s.add(v);
  }
  return s;
}

export function render(features, { activePref = "", onPrefClick } = {}) {
  const prefs = uniq(features, "prefecture_en");
  const themes = new Set();
  for (const f of features) for (const t of f.properties.themes || []) themes.add(t);

  statsEl.innerHTML = "";
  for (const [n, label] of [
    [features.length, "covers"],
    [prefs.size, "prefectures"],
    [themes.size, "designs"],
  ]) {
    const d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = `<b>${n}</b><span>${label}</span>`;
    statsEl.append(d);
  }

  // per-prefecture counts, biggest first
  const counts = new Map();
  for (const f of features) {
    const p = f.properties.prefecture_en;
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const max = rows.length ? rows[0][1] : 1;
  const catColor = features[0] ? CATEGORY_COLOR[mode(features, "category")] : "#3b82f6";

  barsEl.innerHTML = "";
  for (const [name, n] of rows) {
    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    if (name === activePref) row.setAttribute("aria-current", "true");
    row.innerHTML =
      `<span class="name" title="${name}">${name}</span>` +
      `<span class="track" style="width:${Math.max(6, (n / max) * 100)}%;background:${catColor}"></span>` +
      `<span class="num">${n}</span>`;
    const go = () => onPrefClick && onPrefClick(name === activePref ? "" : name);
    row.addEventListener("click", go);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
    barsEl.append(row);
  }

  scopeNote.textContent = activePref ? `Showing ${activePref}.` : "";
}

function mode(features, key) {
  const c = new Map();
  for (const f of features) {
    const v = f.properties[key];
    c.set(v, (c.get(v) || 0) + 1);
  }
  let best = null;
  let n = -1;
  for (const [k, v] of c) if (v > n) ((best = k), (n = v));
  return best;
}
