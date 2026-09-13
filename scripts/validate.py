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
        print("data/covers.geojson missing, run scripts/build_covers.py", file=sys.stderr)
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

    gaz = ROOT / "data" / "municipalities.json"
    if gaz.exists():
        rows = json.loads(gaz.read_text(encoding="utf-8"))
        if not isinstance(rows, list) or len(rows) < 1500:
            print("municipalities.json: expected a list of >= 1500 rows", file=sys.stderr)
            return 1
        need = {"code", "name_ja", "name_kana", "name_en",
                "prefecture_en", "prefecture_ja", "lon", "lat"}
        for r in rows[:50]:
            if set(r) != need:
                print(f"municipalities.json: bad row keys {sorted(r)}", file=sys.stderr)
                return 1
            if not (122 <= r["lon"] <= 154 and 20 <= r["lat"] <= 46):
                print(f"municipalities.json: coord out of range {r['code']}", file=sys.stderr)
                return 1
        print(f"OK: {len(rows)} municipalities in gazetteer")

    meta_p = ROOT / "models" / "meta.json"
    if meta_p.exists():
        m = json.loads(meta_p.read_text(encoding="utf-8"))
        need = {"n_samples", "trained_at", "classes", "val_accuracy", "input_size", "min_samples"}
        if set(m) != need:
            print(f"models/meta.json: bad keys {sorted(m)}", file=sys.stderr)
            return 1

    idx_p = ROOT / "data" / "embeddings-index.json"
    if idx_p.exists():
        idx = json.loads(idx_p.read_text(encoding="utf-8"))
        cover_ids = {f["properties"]["id"] for f in fc["features"]}
        # personal ids may not be in covers.geojson until build_covers runs; allow either
        personal_ids = set()
        for jf in (ROOT / "data" / "personal").glob("*.json"):
            if jf.name.startswith("_"):
                continue
            entries = json.loads(jf.read_text(encoding="utf-8"))
            for e in entries if isinstance(entries, list) else [entries]:
                personal_ids.add(e["properties"]["id"])
        unknown = [i for i in idx["ids"] if i not in cover_ids and i not in personal_ids]
        if unknown:
            print(f"embeddings-index: unknown ids {unknown[:5]}", file=sys.stderr)
            return 1
        bin_p = ROOT / "data" / "embeddings.bin"
        if not bin_p.exists():
            print("embeddings.bin: missing but embeddings-index.json exists", file=sys.stderr)
            return 1
        want = len(idx["ids"]) * idx["dim"] * 4
        got = bin_p.stat().st_size
        if got != want:
            print(f"embeddings.bin: {got} bytes, expected {want}", file=sys.stderr)
            return 1
        print(f"OK: {len(idx['ids'])} embeddings")

    print(f"OK: {len(fc['features'])} features, {fc['metadata']['prefectures']} prefectures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
