#!/usr/bin/env python3
"""Fetch Poke Lid (Pokefuta) manhole covers in Japan from OpenStreetMap via Overpass.

Output: data/sources/pokefuta_osm.json  (raw Overpass elements + fetch metadata)

OSM data is ODbL: "(c) OpenStreetMap contributors". Redistributable with attribution.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import sys

import requests

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "sources" / "pokefuta_osm.json"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Japan bounding box (S, W, N, E). Poke Lids are tagged man_made=manhole with a
# "Poke Lids (...)" english name or a "ポケふた" japanese name.
QUERY = r"""
[out:json][timeout:240];
(
  nwr["man_made"="manhole"]["name:en"~"Pok. Lids|Poke Lids",i](24,122,46,146);
  nwr["man_made"="manhole"]["name"~"ポケふた"](24,122,46,146);
  nwr["man_made"="manhole"]["alt_name:en"~"Pok.mon Manhole",i](24,122,46,146);
);
out center tags;
"""


def fetch() -> dict:
    last_err = None
    for url in ENDPOINTS:
        try:
            r = requests.post(
                url,
                data={"data": QUERY},
                headers={"User-Agent": "manhole-japan/1.0 (+https://github.com/sofianebeloucif/manhole-japan)"},
                timeout=300,
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"  {url} failed: {e}", file=sys.stderr)
    raise SystemExit(f"all Overpass endpoints failed: {last_err}")


def main() -> None:
    print("Querying Overpass for Poke Lids...")
    data = fetch()
    elements = [e for e in data.get("elements", []) if e.get("tags")]
    payload = {
        "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": "OpenStreetMap via Overpass",
        "license": "ODbL 1.0",
        "attribution": "(c) OpenStreetMap contributors",
        "count": len(elements),
        "elements": elements,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(elements)} elements -> {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
