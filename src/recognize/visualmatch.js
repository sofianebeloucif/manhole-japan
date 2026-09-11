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
