// URL <-> filter/selection state. Keeps the page shareable and reloadable.

const KEYS = ["q", "pref", "cat", "id"];

export function read() {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get("q") || "",
    pref: p.get("pref") || "",
    cat: p.get("cat") ? p.get("cat").split(",").filter(Boolean) : null,
    id: p.get("id") || "",
  };
}

export function write(state, { replace = false } = {}) {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.pref) p.set("pref", state.pref);
  if (state.cat && state.cat.length) p.set("cat", state.cat.join(","));
  if (state.id) p.set("id", state.id);
  const qs = p.toString();
  const url = qs ? `${location.pathname}?${qs}` : location.pathname;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

export function onPopState(handler) {
  addEventListener("popstate", () => handler(read()));
}

export { KEYS };
