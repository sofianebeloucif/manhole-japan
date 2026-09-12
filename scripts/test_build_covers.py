import unittest

from build_covers import dedupe


def feature(id_, lon, lat, category="personal"):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"id": id_, "category": category},
    }


class DedupeTests(unittest.TestCase):
    def test_two_personal_entries_at_the_same_approx_coordinate_both_survive(self):
        # Several personal designs intentionally share one city-center
        # coordinate when the exact spot is unknown -- they must not be
        # collapsed into a single point.
        a = feature("personal-saga-albert", 130.3009, 33.2635)
        b = feature("personal-saga-aisha", 130.3009, 33.2635)
        out = dedupe([a, b])
        self.assertEqual({f["properties"]["id"] for f in out}, {"personal-saga-albert", "personal-saga-aisha"})

    def test_personal_entry_replaces_a_non_personal_one_at_the_same_spot(self):
        # The same physical cover imported from OSM and also photographed:
        # keep the personal entry (it carries a photo), drop the OSM one.
        osm = feature("pokefuta-x", 130.3009, 33.2635, category="pokefuta")
        personal = feature("personal-saga-albert", 130.3009, 33.2635)
        out = dedupe([osm, personal])
        self.assertEqual([f["properties"]["id"] for f in out], ["personal-saga-albert"])

    def test_two_non_personal_entries_at_the_same_spot_collapse_to_one(self):
        a = feature("pokefuta-a", 130.3009, 33.2635, category="pokefuta")
        b = feature("pokefuta-b", 130.3009, 33.2635, category="pokefuta")
        out = dedupe([a, b])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["properties"]["id"], "pokefuta-a")

    def test_distinct_coordinates_are_all_kept(self):
        a = feature("personal-a", 130.0, 33.0)
        b = feature("personal-b", 131.0, 34.0)
        out = dedupe([a, b])
        self.assertEqual(len(out), 2)


if __name__ == "__main__":
    unittest.main()
