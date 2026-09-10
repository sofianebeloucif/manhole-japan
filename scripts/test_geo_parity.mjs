import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolvePrefecture } from "../src/geo.js";

const prefFC = JSON.parse(readFileSync(new URL("../data/prefectures.geojson", import.meta.url)));

// [lon, lat] samples: city centres + a few coastal/edge points
const samples = [
  [139.7454, 35.6586], // Tokyo Tower
  [135.4959, 34.7025], // Osaka Station
  [141.3469, 43.0686], // Sapporo
  [127.6809, 26.2124], // Naha
  [130.4017, 33.5904], // Fukuoka
  [136.8816, 35.1709], // Nagoya
  [142.19, 27.09],     // Ogasawara (island, snaps)
  [130.93, 33.935],    // Kitakyushu coast (snaps)
];

const py = `
import json, sys
sys.path.insert(0, "scripts")
from lib_geo import Prefectures
p = Prefectures()
out = [list(p.resolve(lon, lat))[:2] for lon, lat in json.load(sys.stdin)]
print(json.dumps(out))
`;
const pyOut = JSON.parse(
  execFileSync("python3", ["-c", py], { input: JSON.stringify(samples) }).toString(),
);

let failures = 0;
samples.forEach(([lon, lat], i) => {
  const js = resolvePrefecture(lon, lat, prefFC);
  const [pyEn] = pyOut[i];
  if (js.prefecture_en !== pyEn) {
    failures++;
    console.error(`MISMATCH @ ${lat},${lon}: js=${js.prefecture_en} py=${pyEn}`);
  }
});
if (failures) {
  console.error(`${failures} parity mismatch(es)`);
  process.exit(1);
}
console.log(`geo parity OK (${samples.length} points)`);
