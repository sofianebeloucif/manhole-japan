import { haversine } from "../geo.js";

export const DUP_M = 15;
export const CLUSTER_M = 20;
export const SIM_DUP = 0.93;

export function gpsDuplicate(analysis) {
  const nc = analysis && analysis.gps && analysis.gps.nearestCover;
  if (nc && nc.dist_m < DUP_M) {
    return { duplicate: true, of: { id: nc.id, name_en: nc.name_en, dist_m: nc.dist_m } };
  }
  return { duplicate: false, of: null };
}

export function clusterByLocation(entries, { radiusM = CLUSTER_M } = {}) {
  const parent = entries.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { parent[find(i)] = find(j); };
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    if (!Number.isFinite(a.lon) || !Number.isFinite(a.lat)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (!Number.isFinite(b.lon) || !Number.isFinite(b.lat)) continue;
      if (haversine([a.lon, a.lat], [b.lon, b.lat]) < radiusM) union(i, j);
    }
  }
  entries.forEach((e, i) => { e.clusterId = find(i); });
  return entries;
}

export function visualDuplicate(analysis) {
  const m = analysis && analysis.visual && analysis.visual.status === "ok" && analysis.visual.matches[0];
  if (m && m.similarity > SIM_DUP) {
    return { duplicate: true, of: { id: m.id, name_en: m.name_en, similarity: m.similarity } };
  }
  return { duplicate: false, of: null };
}

export function duplicateVerdict(analysis) {
  const g = gpsDuplicate(analysis);
  const v = visualDuplicate(analysis);
  const reasons = [];
  if (g.duplicate) reasons.push(`${g.of.dist_m} m from ${g.of.name_en || g.of.id}`);
  if (v.duplicate) reasons.push(`${(v.of.similarity * 100).toFixed(0)}% visual match to ${v.of.name_en || v.of.id}`);
  let level = "new";
  if (g.duplicate && v.duplicate) level = "confirmed";
  else if (g.duplicate || v.duplicate) level = "likely";
  return { level, reasons, of: g.of || v.of };
}

function cos(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

export function clusterEntries(entries, { radiusM = CLUSTER_M, simThreshold = SIM_DUP } = {}) {
  clusterByLocation(entries, { radiusM });
  // second pass: merge clusters by embedding similarity
  const rep = {};
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const vi = entries[i].vector;
      const vj = entries[j].vector;
      if (vi && vj && vi.length === vj.length && cos(vi, vj) > simThreshold) {
        const to = entries[i].clusterId;
        const from = entries[j].clusterId;
        rep[from] = to;
      }
    }
  }
  const resolve = (c) => (rep[c] === undefined ? c : (rep[c] = resolve(rep[c])));
  entries.forEach((e) => { e.clusterId = resolve(e.clusterId); });
  return entries;
}
