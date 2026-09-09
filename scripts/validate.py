#!/usr/bin/env python3
"""CI gate: validate data/covers.geojson and check referenced photos.

Exit 0 on success, non-zero with a message otherwise.
"""
from __future__ import annotations

import json
import pathlib
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "scripts" / "schema.json").read_text(encoding="utf-8"))


def main() -> int:
    path = ROOT / "data" / "covers.geojson"
    if not path.exists():
        print("data/covers.geojson missing - run scripts/build_covers.py", file=sys.stderr)
        return 1
    fc = json.loads(path.read_text(encoding="utf-8"))

    if fc.get("type") != "FeatureCollection" or not isinstance(fc.get("features"), list):
        print("not a FeatureCollection", file=sys.stderr)
        return 1

    problems = 0
    seen_ids: set[str] = set()
    for f in fc["features"]:
        pid = f.get("properties", {}).get("id", "<no id>")
        try:
            jsonschema.validate(f, SCHEMA)
        except jsonschema.ValidationError as e:
            problems += 1
            print(f"INVALID {pid}: {e.message}", file=sys.stderr)
            continue
        if pid in seen_ids:
            problems += 1
            print(f"DUPLICATE id: {pid}", file=sys.stderr)
        seen_ids.add(pid)
        for key in ("photo", "photo_thumb"):
            rel = f["properties"].get(key)
            if rel is None:
                continue
            if not rel.endswith(".webp"):
                problems += 1
                print(f"{pid}: {key} must be a .webp file ({rel})", file=sys.stderr)
            if not (ROOT / rel).exists():
                problems += 1
                print(f"{pid}: {key} file not found ({rel})", file=sys.stderr)

    if problems:
        print(f"\n{problems} problem(s) found", file=sys.stderr)
        return 1
    print(f"OK - {len(fc['features'])} features, {fc['metadata']['prefectures']} prefectures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
