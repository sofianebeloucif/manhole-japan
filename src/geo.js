// Pure geometry helpers. Behaviour must match scripts/lib_geo.py.

export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(lon, lat, polygon) {
  if (!polygon.length || !pointInRing(lon, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lon, lat, polygon[h])) return false;
  }
  return true;
}

export function pointInMultiPolygon(lon, lat, multiPolygon) {
  return multiPolygon.some((poly) => pointInPolygon(lon, lat, poly));
}

function polys(geom) {
  return geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
}

function bbox(geom) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const poly of polys(geom)) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  return [minx, miny, maxx, maxy];
}

export function resolvePrefecture(lon, lat, prefFC) {
  for (const f of prefFC.features) {
    const [minx, miny, maxx, maxy] = bbox(f.geometry);
    if (lon < minx || lon > maxx || lat < miny || lat > maxy) continue;
    if (pointInMultiPolygon(lon, lat, polys(f.geometry))) {
      return { prefecture_en: f.properties.pref_en, prefecture_ja: f.properties.pref_ja, exact: true };
    }
  }
  let best = null;
  let bestD2 = Infinity;
  for (const f of prefFC.features) {
    for (const poly of polys(f.geometry)) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          const d2 = (x - lon) ** 2 + (y - lat) ** 2;
          if (d2 < bestD2) { bestD2 = d2; best = f; }
        }
      }
    }
  }
  return best
    ? { prefecture_en: best.properties.pref_en, prefecture_ja: best.properties.pref_ja, exact: false }
    : { prefecture_en: null, prefecture_ja: null, exact: false };
}

export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestCover(lon, lat, coversFC) {
  let best = null;
  let bestD = Infinity;
  for (const f of coversFC.features) {
    const d = haversine([lon, lat], f.geometry.coordinates);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best ? { feature: best, dist_m: Math.round(bestD) } : null;
}
