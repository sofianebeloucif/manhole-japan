import { CDN } from "../config.js";

const REPO = "https://github.com/sofianebeloucif/manhole-japan";
const orNull = (v) => (v === undefined || v === "" ? null : v);

export function buildFeature(input) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(input.lon), Number(input.lat)] },
    properties: {
      id: input.slug,
      name_en: input.name_en,
      name_ja: orNull(input.name_ja),
      prefecture_en: orNull(input.prefecture_en),
      prefecture_ja: null,
      municipality: orNull(input.municipality),
      category: "personal",
      themes: input.themes || [],
      photo: `assets/photos/${input.slug}.webp`,
      photo_thumb: `assets/photos/${input.slug}.thumb.webp`,
      photo_credit: orNull(input.photo_credit),
      photo_license: orNull(input.photo_license),
      installed: orNull(input.installed),
      source: "personal",
      source_url: REPO,
      visited: true,
    },
  };
}

export function photoCreditsRow(input) {
  const credit = input.photo_credit || "";
  const lic = input.photo_license || "";
  return `| ${input.slug}.webp | ${input.name_en} | ${credit} | ${lic} | own photo |`;
}

export function prSteps(slug) {
  return [
    "To publish this cover:",
    `1. Add \`assets/photos/${slug}.webp\` and \`assets/photos/${slug}.thumb.webp\` (the two files just downloaded).`,
    "2. Append the JSON above to the array in `data/personal/mine.json` (create the file as `[ ... ]` if it does not exist).",
    "3. Add the row above to `PHOTO_CREDITS.md`.",
    "4. Run `npm run data` then `npm run lint`.",
    `5. Open a pull request. Upload files at ${REPO}/upload/main/assets/photos`,
  ].join("\n");
}

/* globals URL, document, Blob, Uint8Array */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function buildFeatureArray(entries) {
  return JSON.stringify(entries.map(buildFeature), null, 2);
}

export async function zipWebps(files, deps = {}) {
  const fflate = deps.fflate || (await import(/* @vite-ignore */ CDN.fflate));
  const zipInput = {};
  for (const f of files) {
    zipInput[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  }
  return new Promise((resolve, reject) =>
    fflate.zip(zipInput, { level: 6 }, (err, data) =>
      err ? reject(err) : resolve(new Blob([data], { type: "application/zip" })),
    ),
  );
}
