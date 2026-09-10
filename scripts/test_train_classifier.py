import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


class GateTest(unittest.TestCase):
    def test_below_min_samples_only_updates_meta(self):
        root = pathlib.Path(__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            (tmp / "data" / "personal").mkdir(parents=True)
            (tmp / "assets" / "photos").mkdir(parents=True)
            (tmp / "models").mkdir()
            (tmp / "models" / "meta.json").write_text(json.dumps({
                "n_samples": 0, "trained_at": None, "classes": [],
                "val_accuracy": None, "input_size": 224, "min_samples": 50,
            }))
            for i in range(3):
                (tmp / "assets" / "photos" / f"p{i}.webp").write_bytes(b"x")
                (tmp / "data" / "personal" / f"p{i}.json").write_text(json.dumps([{
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [139.7, 35.68]},
                    "properties": {"id": f"personal-x-{i}", "name_en": "x",
                                   "prefecture_en": "Tokyo", "category": "personal",
                                   "themes": [], "source": "personal",
                                   "source_url": "u", "visited": True,
                                   "photo": f"assets/photos/p{i}.webp"},
                }]))
            r = subprocess.run(
                [sys.executable, str(root / "scripts" / "train_classifier.py")],
                cwd=tmp, capture_output=True, text=True,
            )
            self.assertEqual(r.returncode, 0, r.stderr)
            meta = json.loads((tmp / "models" / "meta.json").read_text())
            self.assertEqual(meta["n_samples"], 3)
            self.assertFalse((tmp / "models" / "prefecture-clf.onnx").exists())


if __name__ == "__main__":
    unittest.main()
