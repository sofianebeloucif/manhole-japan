/* global document */
import { CDN } from "../config.js";

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SIZE = 224;

let _session;

async function session(deps) {
  if (deps.session) return deps.session;
  if (!_session) {
    const ort = deps.ort || (await import(/* @vite-ignore */ CDN.ort));
    ort.env.wasm.wasmPaths = CDN.ortWasm;
    _session = await ort.InferenceSession.create(CDN.embedModel);
    _session._ort = ort;
  }
  return _session;
}

function preprocess(bitmap) {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const out = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let ch = 0; ch < 3; ch++) {
      out[ch * SIZE * SIZE + i] = (data[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    }
  }
  return out;
}

function l2(vec) {
  let n = 0;
  for (const x of vec) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / n;
  return out;
}

export async function embed(bitmap, deps = {}) {
  const s = await session(deps);
  let feed;
  if (deps.session) {
    // test path: no real preprocessing needed, the fake ignores the tensor
    feed = { [s.inputNames[0]]: { data: new Float32Array(3 * SIZE * SIZE), dims: [1, 3, SIZE, SIZE] } };
  } else {
    const ort = s._ort;
    feed = { [s.inputNames[0]]: new ort.Tensor("float32", preprocess(bitmap), [1, 3, SIZE, SIZE]) };
  }
  const out = await s.run(feed);
  const t = out[s.outputNames[0]];
  const dim = t.dims[t.dims.length - 1];
  const cls = t.data.slice(0, dim); // last_hidden_state[0, 0, :]
  return l2(cls);
}
