import { CATEGORIES } from "./config.js";

const qEl = document.getElementById("q");
const prefEl = document.getElementById("prefecture");
const catsEl = document.getElementById("categories");
const resetEl = document.getElementById("reset");

let changeHandler = () => {};
const allCatIds = CATEGORIES.map((c) => c.id);

// ---- build category chips -------------------------------------------------
for (const c of CATEGORIES) {
  const label = document.createElement("label");
  label.className = "chip";
  label.style.color = c.color;
  label.innerHTML =
    `<input type="checkbox" value="${c.id}" checked>` +
    `<span class="dot" style="background:${c.color}"></span>` +
    `<span>${c.label}</span>`;
  catsEl.append(label);
}

// ---- state <-> UI -------------------------------------------------------
export function getState() {
  const cats = [...catsEl.querySelectorAll("input:checked")].map((i) => i.value);
  return {
    q: qEl.value.trim(),
    pref: prefEl.value,
    cat: cats.length === allCatIds.length ? null : cats,
  };
}

export function setState(s = {}) {
  qEl.value = s.q || "";
  prefEl.value = s.pref || "";
  const active = s.cat && s.cat.length ? new Set(s.cat) : new Set(allCatIds);
  catsEl.querySelectorAll("input").forEach((i) => (i.checked = active.has(i.value)));
  reflectReset();
}

export function populatePrefectures(features) {
  const names = [...new Set(features.map((f) => f.properties.prefecture_en))].sort();
  const current = prefEl.value;
  prefEl.length = 1;
  for (const n of names) {
    const o = document.createElement("option");
    o.value = o.textContent = n;
    prefEl.append(o);
  }
  prefEl.value = names.includes(current) ? current : "";
}

export function onChange(fn) {
  changeHandler = fn;
}

function reflectReset() {
  const s = getState();
  resetEl.hidden = !s.q && !s.pref && !s.cat;
}

function fire() {
  reflectReset();
  changeHandler(getState());
}

let t;
qEl.addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(fire, 160);
});
prefEl.addEventListener("change", fire);
catsEl.addEventListener("change", fire);
resetEl.addEventListener("click", () => {
  setState({});
  fire();
});

// ---- pure predicate --------------------------------------------------
export function apply(features, state) {
  const q = state.q ? state.q.toLowerCase() : "";
  const cats = state.cat ? new Set(state.cat) : null;
  return features.filter((f) => {
    const p = f.properties;
    if (state.pref && p.prefecture_en !== state.pref) return false;
    if (cats && !cats.has(p.category)) return false;
    if (q) {
      const hay = [
        p.name_en, p.name_ja, p.municipality, p.prefecture_en,
        ...(p.themes || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
