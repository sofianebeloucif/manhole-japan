import { CDN } from "../config.js";

async function getExifr(deps) {
  if (deps.exifr) {
    // Handle namespace import `import * as exifr`
    return deps.exifr.default || deps.exifr;
  }
  return import(/* @vite-ignore */ CDN.exifr);
}

export async function readGps(input, deps = {}) {
  try {
    const exifr = await getExifr(deps);
    const g = await exifr.gps(input);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) {
      return { lat: g.latitude, lon: g.longitude };
    }
  } catch {
    /* no EXIF / parse failure → treat as no GPS */
  }
  return null;
}
