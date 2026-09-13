#!/usr/bin/env python3
"""Normalise every source in data/sources/ + data/personal/ into data/covers.geojson.

- assigns prefecture from coordinates (point-in-polygon against data/prefectures.geojson)
- parses Pokemon names out of "Poke Lids (A & B)" into `themes`
- de-duplicates: two non-personal (OSM) points at ~the same spot collapse to
  one; a personal entry replaces a non-personal one at the same spot (the
  same physical cover, imported and also photographed) but never collapses
  against another personal entry, since many intentionally share an
  approximate city-center coordinate, one per distinct design, when the
  exact spot is unknown
- validates every feature against scripts/schema.json
"""
from __future__ import annotations

import json
import math
import pathlib
import re
import sys

import jsonschema

from lib_geo import Prefectures

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCHEMA = json.loads((ROOT / "scripts" / "schema.json").read_text(encoding="utf-8"))

_POKE_RE = re.compile(r"(?:Poke|Poké)\s*Lids?\s*\((.+?)\)\s*$", re.I)
_SPLIT_RE = re.compile(r"\s*(?:&|＆|・|,|/|\band\b)\s*")


def poke_names(name_en: str | None) -> list[str]:
    if not name_en:
        return []
    m = _POKE_RE.search(name_en)
    if not m:
        return []
    return [p.strip() for p in _SPLIT_RE.split(m.group(1)) if p.strip()]


def osm_coords(el: dict) -> tuple[float, float] | None:
    if el.get("type") == "node":
        return el.get("lon"), el.get("lat")
    c = el.get("center") or {}
    if "lon" in c and "lat" in c:
        return c["lon"], c["lat"]
    return None


def from_osm_pokefuta(payload: dict, prefs: Prefectures) -> list[dict]:
    out = []
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        coords = osm_coords(el)
        if not coords or None in coords:
            continue
        lon, lat = coords
        name_en = tags.get("name:en") or tags.get("alt_name:en")
        if not name_en:
            jp = tags.get("name", "")
            name_en = "Poke Lids" if "ポケふた" in jp else jp or "Poke Lids"
        pref_en, pref_ja, exact = prefs.resolve(lon, lat)
        if not exact:
            print(f"  ~ OSM {el['type']}/{el['id']} ({lat:.4f},{lon:.4f}) snapped to nearest: {pref_en}", file=sys.stderr)
        out.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                "properties": {
                    "id": f"pokefuta-osm-{el['id']}",
                    "name_en": name_en,
                    "name_ja": tags.get("name") or tags.get("name:ja"),
                    "prefecture_en": pref_en,
                    "prefecture_ja": pref_ja,
                    "municipality": tags.get("addr:city") or tags.get("operator") or None,
                    "category": "pokefuta",
                    "themes": poke_names(name_en),
                    "photo": None,
                    "photo_thumb": None,
                    "photo_credit": None,
                    "photo_license": None,
                    "installed": tags.get("start_date"),
                    "source": "OpenStreetMap",
                    "source_url": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
                    "visited": False,
                },
            }
        )
    return out


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Equirectangular-approximation distance in metres. Good enough for <1 km gaps."""
    r = 6371000.0
    lat_rad = math.radians((lat1 + lat2) / 2)
    dx = math.radians(lon2 - lon1) * math.cos(lat_rad)
    dy = math.radians(lat2 - lat1)
    return r * math.hypot(dx, dy)


def load_personal(prefs: Prefectures, existing: list[dict] | None = None) -> list[dict]:
    existing = existing or []
    out = []
    for path in sorted((DATA / "personal").glob("*.json")):
        if path.name.startswith("_"):
            continue
        entries = json.loads(path.read_text(encoding="utf-8"))
        for e in entries if isinstance(entries, list) else [entries]:
            lon, lat = e["geometry"]["coordinates"]
            p = e["properties"]
            p.setdefault("category", "personal")
            p.setdefault("source", "personal")
            p.setdefault("source_url", "https://github.com/sofianebeloucif/manhole-japan")
            p.setdefault("themes", [])
            p.setdefault("visited", True)
            for k in ("name_ja", "municipality", "photo", "photo_thumb",
                      "photo_credit", "photo_license", "installed", "prefecture_ja"):
                p.setdefault(k, None)
            if not p.get("prefecture_en"):
                p["prefecture_en"], p["prefecture_ja"], _ = prefs.resolve(lon, lat)
            for prev in existing + out:
                plon, plat = prev["geometry"]["coordinates"]
                if _haversine_m(lon, lat, plon, plat) < 15:
                    print(f"  ~ {p.get('id', '?')} is <15 m from an existing cover, possible duplicate", file=sys.stderr)
                    break
            out.append(e)
    return out


def dedupe(features: list[dict]) -> list[dict]:
    """Collapse coordinate collisions between two non-personal (OSM) points,
    and let a personal entry replace a non-personal one at the same spot.
    Two personal entries never dedupe against each other purely by
    coordinate: personal entries are appended last on purpose, so this still
    prefers a personal photo over a plain OSM import of the same cover."""
    by_coord: dict[tuple, dict] = {}
    out: list[dict] = []
    for f in features:
        lon, lat = f["geometry"]["coordinates"]
        key = (round(lon, 5), round(lat, 5))
        if f["properties"].get("category") == "personal":
            prev = by_coord.get(key)
            if prev is not None and prev["properties"].get("category") != "personal":
                out.remove(prev)
            by_coord[key] = f
            out.append(f)
        else:
            if key in by_coord:
                continue
            by_coord[key] = f
            out.append(f)
    return out


def main() -> None:
    prefs = Prefectures()
    features: list[dict] = []

    fetched_at = None
    pf = DATA / "sources" / "pokefuta_osm.json"
    if pf.exists():
        payload = json.loads(pf.read_text(encoding="utf-8"))
        fetched_at = payload.get("fetched_at")
        features += from_osm_pokefuta(payload, prefs)
    else:
        print("  (no data/sources/pokefuta_osm.json, run fetch_pokefuta.py first)", file=sys.stderr)

    features += load_personal(prefs, features)
    features = dedupe(features)
    features.sort(key=lambda f: (f["properties"]["prefecture_en"], f["properties"]["id"]))

    errors = 0
    for f in features:
        try:
            jsonschema.validate(f, SCHEMA)
        except jsonschema.ValidationError as e:
            errors += 1
            print(f"  INVALID {f['properties'].get('id')}: {e.message}", file=sys.stderr)
    if errors:
        raise SystemExit(f"{errors} feature(s) failed schema validation")

    prefectures = sorted({f["properties"]["prefecture_en"] for f in features})
    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "sources_fetched_at": fetched_at,
            "count": len(features),
            "prefectures": len(prefectures),
            "by_category": _counts(features, "category"),
            "attribution": [
                "Pokefuta locations (c) OpenStreetMap contributors (ODbL)",
                "Personal observations (c) Sofiane Beloucif",
            ],
            "disclaimer": "Fan project. Not affiliated with The Pokemon Company, Nintendo, or GKP.",
        },
        "features": features,
    }
    out = DATA / "covers.geojson"
    out.write_text(json.dumps(fc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {len(features)} covers across {len(prefectures)} prefectures -> {out.relative_to(ROOT)}")
    print(f"  by category: {fc['metadata']['by_category']}")


def _counts(features: list[dict], key: str) -> dict:
    out: dict[str, int] = {}
    for f in features:
        out[f["properties"][key]] = out.get(f["properties"][key], 0) + 1
    return dict(sorted(out.items()))


if __name__ == "__main__":
    main()
