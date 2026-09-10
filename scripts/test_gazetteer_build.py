import unittest

from build_gazetteer import _records_from_csv, rows_from_records

SAMPLE = [
    {"code": "13104", "pref_ja": "東京都", "pref_en": "Tokyo",
     "city_ja": "新宿区", "city_kana": "シンジュクク", "city_romaji": "SHINJUKU KU",
     "lon": 139.7036, "lat": 35.6938},
    {"code": "13104", "pref_ja": "東京都", "pref_en": "Tokyo",
     "city_ja": "新宿区", "city_kana": "シンジュクク", "city_romaji": "SHINJUKU KU",
     "lon": 139.7036, "lat": 35.6938},
    {"code": "26100", "pref_ja": "京都府", "pref_en": "Kyoto",
     "city_ja": "京都市", "city_kana": "キョウトシ", "city_romaji": "KYOTO SHI",
     "lon": 135.7681, "lat": 35.0116},
]

CSV_TEXT = (
    '"都道府県コード","都道府県名","都道府県名カナ","都道府県名ローマ字",'
    '"市区町村コード","市区町村名","市区町村名カナ","市区町村名ローマ字",'
    '"大字町丁目名","大字町丁目名カナ","大字町丁目名ローマ字","小字・通称名","緯度","経度"\n'
    '"01","北海道","ホッカイドウ","HOKKAIDO","01101","札幌市中央区","サッポロシチュウオウク",'
    '"SAPPORO SHI CHUO KU","旭ケ丘一丁目","アサヒガオカ 1","ASAHIGAOKA 1",,43.04223,141.319722\n'
    '"26","京都府","キョウトフ","KYOTO FU","26100","京都市","キョウトシ",'
    '"KYOTO SHI","上京区","カミギョウク","KAMIGYO KU",,35.0296,135.7557\n'
)


class T(unittest.TestCase):
    def test_dedupe_and_shape(self):
        rows = rows_from_records(SAMPLE)
        self.assertEqual(len(rows), 2)
        r = [x for x in rows if x["code"] == "13104"][0]
        self.assertEqual(r["name_ja"], "新宿区")
        self.assertEqual(r["name_en"], "SHINJUKU KU")
        self.assertEqual(r["prefecture_en"], "Tokyo")
        self.assertIsInstance(r["lon"], float)
        self.assertEqual(set(r), {
            "code", "name_ja", "name_kana", "name_en",
            "prefecture_en", "prefecture_ja", "lon", "lat",
        })

    def test_sorted_by_code(self):
        rows = rows_from_records(SAMPLE)
        self.assertEqual([r["code"] for r in rows], ["13104", "26100"])

    def test_records_from_csv_parses_real_headers(self):
        recs = list(_records_from_csv(CSV_TEXT))
        self.assertEqual(len(recs), 2)
        sapporo, kyoto = recs
        self.assertEqual(sapporo["code"], "01101")
        self.assertEqual(sapporo["pref_ja"], "北海道")
        self.assertEqual(sapporo["pref_en"], "Hokkaido")
        self.assertEqual(sapporo["city_ja"], "札幌市中央区")
        self.assertEqual(sapporo["city_kana"], "サッポロシチュウオウク")
        self.assertEqual(sapporo["city_romaji"], "SAPPORO SHI CHUO KU")
        self.assertAlmostEqual(sapporo["lat"], 43.04223)
        self.assertAlmostEqual(sapporo["lon"], 141.319722)
        self.assertEqual(kyoto["city_ja"], "京都市")
        self.assertEqual(kyoto["city_romaji"], "KYOTO SHI")


if __name__ == "__main__":
    unittest.main()
