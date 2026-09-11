import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent


class GateTest(unittest.TestCase):
    def test_no_photos_writes_empty_index_exit0(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            (tmp / "data" / "personal").mkdir(parents=True)
            (tmp / "data" / "personal" / "mine.json").write_text("[]")
            r = subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "build_embeddings.py")],
                cwd=tmp, capture_output=True, text=True,
            )
            self.assertEqual(r.returncode, 0, r.stderr)
            idx = json.loads((tmp / "data" / "embeddings-index.json").read_text())
            self.assertEqual(idx["ids"], [])
            self.assertEqual(idx["dim"], 384)
            self.assertEqual((tmp / "data" / "embeddings.bin").stat().st_size, 0)


if __name__ == "__main__":
    unittest.main()
