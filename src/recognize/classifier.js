import { MODEL_META_URL, MODEL_ONNX_URL, CDN } from "../config.js";

let _meta;
let _session;

export async function loadMeta(injected) {
  if (injected && "meta" in injected) return injected.meta;
  if (_meta === undefined) {
    try { _meta = await fetch(MODEL_META_URL).then((r) => (r.ok ? r.json() : null)); }
    catch { _meta = null; }
  }
  return _meta;
}

function preprocess(bitmap, size) {
  /* global document */
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(bitmap, 0, 0, size, size);
  const { data } = c.getContext("2d").getImageData(0, 0, size, size);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const out = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) {
    for (let ch = 0; ch < 3; ch++) {
      out[ch * size * size + i] = (data[i * 4 + ch] / 255 - mean[ch]) / std[ch];
    }
  }
  return out;
}

function softmax(arr) {
  const m = Math.max(...arr);
  const ex = arr.map((v) => Math.exp(v - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

export async function classify(bitmap, deps = {}, injected = {}) {
  const meta = await loadMeta(injected);
  if (!meta) return { status: "unavailable", predictions: [] };
  if (!meta.n_samples || meta.n_samples < meta.min_samples || !meta.classes.length) {
    return { status: "insufficient_data", have: meta.n_samples || 0, need: meta.min_samples, predictions: [] };
  }
  if (!bitmap) return { status: "unavailable", predictions: [] };
  try {
    const ort = injected.ort || deps.ort || (await import(/* @vite-ignore */ CDN.ort));
    ort.env.wasm.wasmPaths = CDN.ortWasm;
    if (!_session) _session = await ort.InferenceSession.create(MODEL_ONNX_URL);
    const size = meta.input_size || 224;
    const input = new ort.Tensor("float32", preprocess(bitmap, size), [1, 3, size, size]);
    const out = await _session.run({ [_session.inputNames[0]]: input });
    const logits = Array.from(out[_session.outputNames[0]].data);
    const probs = softmax(logits);
    const top = probs
      .map((prob, i) => ({ prefecture_en: meta.classes[i], prob }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 3);
    return { status: "ok", predictions: top };
  } catch {
    return { status: "unavailable", predictions: [] };
  }
}
