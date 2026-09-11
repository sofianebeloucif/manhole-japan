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
