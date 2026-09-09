"""Tiny geo helpers: point-in-polygon prefecture lookup, no external deps."""
from __future__ import annotations

import json
import pathlib

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"


def _point_in_ring(x: float, y: float, ring: list) -> bool:
    """Ray-casting test for a single linear ring ([[lon, lat], ...])."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_polygon(x: float, y: float, polygon: list) -> bool:
    """polygon = [outer_ring, hole1, hole2, ...]."""
    if not polygon or not _point_in_ring(x, y, polygon[0]):
        return False
    for hole in polygon[1:]:
        if _point_in_ring(x, y, hole):
            return False
    return True


class Prefectures:
    def __init__(self, path: pathlib.Path | None = None):
        path = path or DATA / "prefectures.geojson"
        fc = json.loads(path.read_text(encoding="utf-8"))
        # (en, ja, bbox, [polygons]) per feature
        self.features = []
        for feat in fc["features"]:
            p = feat["properties"]
            geom = feat["geometry"]
            polys = (
                geom["coordinates"]
                if geom["type"] == "MultiPolygon"
                else [geom["coordinates"]]
            )
            xs = [pt[0] for poly in polys for ring in poly for pt in ring]
            ys = [pt[1] for poly in polys for ring in poly for pt in ring]
            self.features.append(
                {
                    "en": p["pref_en"],
                    "ja": p["pref_ja"],
                    "bbox": (min(xs), min(ys), max(xs), max(ys)),
                    "polys": polys,
                }
            )

    def lookup(self, lon: float, lat: float):
        """Return (pref_en, pref_ja) or (None, None)."""
        for f in self.features:
            minx, miny, maxx, maxy = f["bbox"]
            if not (minx <= lon <= maxx and miny <= lat <= maxy):
                continue
            for poly in f["polys"]:
                if _point_in_polygon(lon, lat, poly):
                    return f["en"], f["ja"]
        return None, None

    def nearest(self, lon: float, lat: float):
        """Prefecture whose boundary vertex is closest to the point.

        Fallback for coastal / island points that fall just outside the
        simplified polygons.
        """
        best = None
        best_d2 = float("inf")
        for f in self.features:
            for poly in f["polys"]:
                for ring in poly:
                    for x, y in ring:
                        d2 = (x - lon) ** 2 + (y - lat) ** 2
                        if d2 < best_d2:
                            best_d2 = d2
                            best = f
        return (best["en"], best["ja"]) if best else (None, None)

    def resolve(self, lon: float, lat: float):
        """lookup() with a nearest() fallback. Always returns a prefecture."""
        en, ja = self.lookup(lon, lat)
        if en:
            return en, ja, True
        en, ja = self.nearest(lon, lat)
        return en, ja, False
