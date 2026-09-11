#!/usr/bin/env python3
"""data/personal/*.json (photo + id) -> data/embeddings.bin + data/embeddings-index.json.

Heavy deps (onnxruntime, numpy, Pillow) are imported only when there is work to
do, so the zero-photos gate path runs with the stdlib.
"""
from __future__ import annotations

import json
import pathlib
import struct
import sys

ROOT = pathlib.Path.cwd()
DIM = json.loads((pathlib.Path(__file__).resolve().parent.parent / "models" / "embed-model.json").read_text())["dim"]
OUT_BIN = ROOT / "data" / "embeddings.bin"
OUT_IDX = ROOT / "data" / "embeddings-index.json"


def collect_photos():
    out = []
    for jf in sorted((ROOT / "data" / "personal").glob("*.json")):
        if jf.name.startswith("_"):
            continue
        entries = json.loads(jf.read_text(encoding="utf-8"))
        for e in entries if isinstance(entries, list) else [entries]:
            p = e.get("properties", {})
            photo, cid = p.get("photo"), p.get("id")
            if not photo or not cid:
                continue
            path = ROOT / photo
            if path.exists():
                out.append((path, cid))
    return sorted(out, key=lambda t: t[1])


def _write(ids, vectors):
    OUT_IDX.write_text(json.dumps({"dim": DIM, "ids": ids}, ensure_ascii=False), encoding="utf-8")
    with open(OUT_BIN, "wb") as f:
        for v in vectors:
            f.write(struct.pack(f"<{DIM}f", *v))


def main() -> None:
    photos = collect_photos()
    if not photos:
        _write([], [])
        print("no contributed photos — wrote empty embeddings index", file=sys.stderr)
        return

    import numpy as np
    import onnxruntime as ort
    from PIL import Image
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from fetch_embed_model import model_path

    sess = ort.InferenceSession(str(model_path()), providers=["CPUExecutionProvider"])
    mean = np.array([0.485, 0.456, 0.406], dtype="float32")
    std = np.array([0.229, 0.224, 0.225], dtype="float32")
    iname = sess.get_inputs()[0].name
    oname = sess.get_outputs()[0].name

    ids, vecs = [], []
    for path, cid in photos:
        img = Image.open(path).convert("RGB").resize((224, 224))
        arr = (np.asarray(img, dtype="float32") / 255.0 - mean) / std
        arr = arr.transpose(2, 0, 1)[None]
        out = sess.run([oname], {iname: arr})[0]
        cls = out[0, 0, :].astype("float32")
        cls /= (np.linalg.norm(cls) or 1.0)
        ids.append(cid)
        vecs.append(cls.tolist())
        print(f"  embedded {cid}", file=sys.stderr)

    _write(ids, vecs)
    print(f"wrote {len(ids)} embeddings ({DIM}-d) -> data/embeddings.bin", file=sys.stderr)


if __name__ == "__main__":
    main()
