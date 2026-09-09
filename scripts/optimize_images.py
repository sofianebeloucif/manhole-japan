#!/usr/bin/env python3
"""Turn raw photos into web assets.

    assets/photos/_raw/<slug>.{jpg,jpeg,png}
      -> assets/photos/<slug>.webp        (max 1200px, quality 82)
      -> assets/photos/<slug>.thumb.webp  (max 320px,  quality 78)

Reference <slug>.webp / <slug>.thumb.webp from data/personal/*.json.
EXIF (including GPS) is dropped on the way out.
"""
from __future__ import annotations

import pathlib

from PIL import Image, ImageOps

PHOTOS = pathlib.Path(__file__).resolve().parent.parent / "assets" / "photos"
RAW = PHOTOS / "_raw"
FULL_MAX = 1200
THUMB_MAX = 320


def convert(src: pathlib.Path) -> None:
    slug = src.stem.lower()
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        full = im.copy()
        full.thumbnail((FULL_MAX, FULL_MAX), Image.LANCZOS)
        full.save(PHOTOS / f"{slug}.webp", "WEBP", quality=82, method=6)
        thumb = im.copy()
        thumb.thumbnail((THUMB_MAX, THUMB_MAX), Image.LANCZOS)
        thumb.save(PHOTOS / f"{slug}.thumb.webp", "WEBP", quality=78, method=6)
    print(f"{src.name} -> {slug}.webp + {slug}.thumb.webp")


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    sources = sorted(
        p for p in RAW.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    if not sources:
        print(f"no raw images in {RAW.relative_to(PHOTOS.parents[1])}")
        return
    for src in sources:
        convert(src)


if __name__ == "__main__":
    main()
