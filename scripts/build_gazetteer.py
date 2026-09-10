#!/usr/bin/env python3
"""Build data/municipalities.json from a public municipality dataset.

Source: geolonia/japanese-addresses  latest.csv
  https://raw.githubusercontent.com/geolonia/japanese-addresses/master/data/latest.csv

It is an address-level CSV (one row per neighbourhood block). Header row:
  都道府県コード,都道府県名,都道府県名カナ,都道府県名ローマ字,市区町村コード,市区町村名,
  市区町村名カナ,市区町村名ローマ字,大字町丁目名,大字町丁目名カナ,大字町丁目名ローマ字,
  小字・通称名,緯度,経度

We keep one point per municipality (its first-listed neighbourhood's coords as a
rough centroid). The romaji column (市区町村名ローマ字) is used verbatim for name_en.

Licence: see the geolonia/japanese-addresses repository. The attribution line is
recorded in README (Task 16).
"""
from __future__ import annotations

import csv
import io
import json
import pathlib
import sys

import requests

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "municipalities.json"
SRC = "https://raw.githubusercontent.com/geolonia/japanese-addresses/master/data/latest.csv"

PREF_EN = {
    "北海道": "Hokkaido", "青森県": "Aomori", "岩手県": "Iwate", "宮城県": "Miyagi",
    "秋田県": "Akita", "山形県": "Yamagata", "福島県": "Fukushima", "茨城県": "Ibaraki",
    "栃木県": "Tochigi", "群馬県": "Gunma", "埼玉県": "Saitama", "千葉県": "Chiba",
    "東京都": "Tokyo", "神奈川県": "Kanagawa", "新潟県": "Niigata", "富山県": "Toyama",
    "石川県": "Ishikawa", "福井県": "Fukui", "山梨県": "Yamanashi", "長野県": "Nagano",
    "岐阜県": "Gifu", "静岡県": "Shizuoka", "愛知県": "Aichi", "三重県": "Mie",
    "滋賀県": "Shiga", "京都府": "Kyoto", "大阪府": "Osaka", "兵庫県": "Hyogo",
    "奈良県": "Nara", "和歌山県": "Wakayama", "鳥取県": "Tottori", "島根県": "Shimane",
    "岡山県": "Okayama", "広島県": "Hiroshima", "山口県": "Yamaguchi", "徳島県": "Tokushima",
    "香川県": "Kagawa", "愛媛県": "Ehime", "高知県": "Kochi", "福岡県": "Fukuoka",
    "佐賀県": "Saga", "長崎県": "Nagasaki", "熊本県": "Kumamoto", "大分県": "Oita",
    "宮崎県": "Miyazaki", "鹿児島県": "Kagoshima", "沖縄県": "Okinawa",
}


def _records_from_csv(text: str):
    """Yield intermediate dicts from the geolonia latest.csv text.

    Shape: {code, pref_ja, pref_en, city_ja, city_kana, city_romaji, lon, lat}.
    Rows missing prefecture/municipality or with unparseable lat/lon are skipped.
    """
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        pref_ja = (row.get("都道府県名") or "").strip()
        city_ja = (row.get("市区町村名") or "").strip()
        if not pref_ja or not city_ja:
            continue
        try:
            lat = float(row.get("緯度"))
            lon = float(row.get("経度"))
        except (TypeError, ValueError):
            continue
        yield {
            "code": (row.get("市区町村コード") or "").strip(),
            "pref_ja": pref_ja,
            "pref_en": PREF_EN.get(pref_ja, pref_ja),
            "city_ja": city_ja,
            "city_kana": (row.get("市区町村名カナ") or "").strip(),
            "city_romaji": (row.get("市区町村名ローマ字") or "").strip(),
            "lon": lon,
            "lat": lat,
        }


def rows_from_records(records) -> list[dict]:
    """Dedupe by (code, city_ja) keeping the first occurrence, then shape + sort.

    Final row: {code, name_ja, name_kana, name_en, prefecture_en,
    prefecture_ja, lon, lat}, sorted by (code, name_ja).
    """
    seen: dict[tuple[str, str], dict] = {}
    for r in records:
        key = (r["code"], r["city_ja"])
        if key in seen:
            continue
        seen[key] = {
            "code": r["code"],
            "name_ja": r["city_ja"],
            "name_kana": r["city_kana"],
            "name_en": r["city_romaji"],
            "prefecture_en": r["pref_en"],
            "prefecture_ja": r["pref_ja"],
            "lon": float(r["lon"]),
            "lat": float(r["lat"]),
        }
    return sorted(seen.values(), key=lambda x: (x["code"], x["name_ja"]))


def main() -> None:
    print(f"Fetching {SRC}")
    resp = requests.get(SRC, timeout=180)
    resp.raise_for_status()
    print(f"downloaded {len(resp.content):,} bytes")
    rows = rows_from_records(_records_from_csv(resp.text))
    if len(rows) < 1500:
        sys.exit(f"only {len(rows)} municipalities - source format likely changed")
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} municipalities -> {OUT}")


if __name__ == "__main__":
    main()
