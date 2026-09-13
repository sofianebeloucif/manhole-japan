#!/usr/bin/env python3
"""Download the pinned DINOv2-small ONNX into .cache/ for offline embedding.

Never commits anything. build_embeddings.py imports model_path().
"""
from __future__ import annotations

import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
META = json.loads((ROOT / "models" / "embed-model.json").read_text())
CACHE = ROOT / ".cache"
DEST = CACHE / "embed-model.onnx"


def model_path() -> pathlib.Path:
    if DEST.exists() and DEST.stat().st_size > 1_000_000:
        return DEST
    CACHE.mkdir(exist_ok=True)
    url = META["source"]
    print(f"Downloading embedding model ({url}) …", file=sys.stderr)
    with urllib.request.urlopen(url) as r, open(DEST, "wb") as f:  # noqa: S310
        f.write(r.read())
    if DEST.stat().st_size < 1_000_000:
        DEST.unlink(missing_ok=True)
        raise SystemExit("download too small - revision may have moved")
    return DEST


if __name__ == "__main__":
    print(model_path())
