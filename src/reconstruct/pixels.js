// src/reconstruct/pixels.js: pure pixel-math for the "Enhance relief" and
// "3D relief view" features. No canvas/DOM here on purpose, so this is
// unit-testable without a browser; src/reconstruct/view.js wraps these
// around real <canvas> calls (getImageData/putImageData, and a
// hardware-accelerated CSS blur for the unsharp mask's low-pass pass,
// rather than reimplementing a blur by hand here).
//
// Neither function invents anything not already in the source pixels: the
// normal map is a direct encoding of the photo's own local brightness
// gradients (cast-iron relief casts real shadows, which is exactly the
// signal a "photo to bump map" trick reads), and the unsharp mask only
// amplifies contrast the photo already has. This is honest image
// processing, not generative reconstruction: there is no model claiming
// to know what an illegible part of the design "should" look like.

const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

function luminanceAt(data, w, h, x, y) {
  x = x < 0 ? 0 : x >= w ? w - 1 : x;
  y = y < 0 ? 0 : y >= h ? h - 1 : y;
  const i = (y * w + x) * 4;
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

function sobelAt(data, w, h, x, y) {
  let gx = 0;
  let gy = 0;
  let k = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const l = luminanceAt(data, w, h, x + dx, y + dy);
      gx += l * SOBEL_X[k];
      gy += l * SOBEL_Y[k];
      k++;
    }
  }
  return [gx, gy];
}

/**
 * Builds a tangent-space normal map (RGBA, same size as the input) by
 * treating the photo's luminance as a height field and taking its Sobel
 * gradient. `strength` exaggerates the fake relief (cast-iron covers only
 * have a few millimetres of real depth, so a strength of 1 looks almost
 * flat when lit).
 */
export function buildNormalMap(imageData, strength = 2.2) {
  const { data, width: w, height: h } = imageData;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [gx, gy] = sobelAt(data, w, h, x, y);
      // A brighter neighbour reads as "the surface tilts up toward it", so
      // the outward normal tilts away from increasing brightness.
      let nx = (-gx * strength) / 255;
      let ny = (-gy * strength) / 255;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Classic unsharp mask: original + amount * (original - blurred), per RGB
 * channel, clamped to 0..255 by the Uint8ClampedArray itself. `blurred`
 * must already be a low-pass (e.g. Gaussian-blurred) version of the same
 * image at the same dimensions.
 */
export function unsharpMask(original, blurred, amount = 1.4) {
  const a = original.data;
  const b = blurred.data;
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length; i += 4) {
    out[i] = a[i] + amount * (a[i] - b[i]);
    out[i + 1] = a[i + 1] + amount * (a[i + 1] - b[i + 1]);
    out[i + 2] = a[i + 2] + amount * (a[i + 2] - b[i + 2]);
    out[i + 3] = a[i + 3];
  }
  return { data: out, width: original.width, height: original.height };
}
