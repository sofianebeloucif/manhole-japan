/* global document, Image, ImageData, requestAnimationFrame, cancelAnimationFrame */
// src/reconstruct/view.js: the "Enhance relief" / "3D relief view" overlay,
// opened from the lightbox. Two honest, classical-image-processing effects
// on the real photo pixels. No generative model, nothing invented:
//
// - Enhanced relief: an unsharp mask (src/reconstruct/pixels.js) boosts
//   local contrast so a worn or low-contrast cast design reads more
//   clearly. It's still exactly the photo's own pixels.
// - 3D relief view: cast-iron relief casts real shadows, which is exactly
//   the signal a classic "photo to bump map" trick reads. A Sobel-derived
//   normal map (same module) is applied to a flat disc in Three.js, lit by
//   a light that follows the mouse, so the existing shading in the photo
//   becomes an interactive relief instead of a flat picture. This is a
//   stylised lighting effect, not a scanned or measured 3D model.
import { buildNormalMap, unsharpMask } from "./pixels.js";
import { CDN } from "../config.js";

const $ = (id) => document.getElementById(id);
const MAX_DIM = 900; // plenty of detail for the effect, cheap enough to stay smooth

let threeState = null; // set while the 3D tab is open; torn down on close

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function drawToCanvas(img, blurPx = 0) {
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (blurPx) ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function toImageData({ data, width, height }) {
  return new ImageData(data, width, height);
}

async function loadSourceCanvas(src) {
  const img = await loadImage(src);
  return drawToCanvas(img);
}

function computeEnhancedCanvas(sourceCanvas) {
  const blurredCanvas = document.createElement("canvas");
  blurredCanvas.width = sourceCanvas.width;
  blurredCanvas.height = sourceCanvas.height;
  const bctx = blurredCanvas.getContext("2d");
  bctx.filter = "blur(6px)";
  bctx.drawImage(sourceCanvas, 0, 0);

  const sctx = sourceCanvas.getContext("2d");
  const original = sctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const blurred = bctx.getImageData(0, 0, blurredCanvas.width, blurredCanvas.height);
  const enhanced = unsharpMask(original, blurred, 1.4);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = sourceCanvas.width;
  outCanvas.height = sourceCanvas.height;
  outCanvas.getContext("2d").putImageData(toImageData(enhanced), 0, 0);
  return outCanvas;
}

function paintInto(targetCanvasEl, sourceCanvas) {
  targetCanvasEl.width = sourceCanvas.width;
  targetCanvasEl.height = sourceCanvas.height;
  targetCanvasEl.getContext("2d").drawImage(sourceCanvas, 0, 0);
}

async function showEnhancedTab(src) {
  const view = $("recon-enhanced-view");
  view.dataset.state = "loading";
  try {
    const sourceCanvas = await loadSourceCanvas(src);
    const enhancedCanvas = computeEnhancedCanvas(sourceCanvas);
    paintInto($("recon-original-canvas"), sourceCanvas);
    paintInto($("recon-enhanced-canvas"), enhancedCanvas);
    view.dataset.state = "ready";
  } catch {
    view.dataset.state = "error";
  }
}

async function build3DScene(src, canvasEl) {
  const THREE = await import(/* @vite-ignore */ CDN.three);
  const sourceCanvas = await loadSourceCanvas(src);
  const enhancedCanvas = computeEnhancedCanvas(sourceCanvas);
  const ctx = enhancedCanvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, enhancedCanvas.width, enhancedCanvas.height);
  const normalMap = buildNormalMap(imageData);
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = normalMap.width;
  normalCanvas.height = normalMap.height;
  normalCanvas.getContext("2d").putImageData(toImageData(normalMap), 0, 0);

  const width = canvasEl.clientWidth || 600;
  const height = canvasEl.clientHeight || 600;
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  // A flat plane sized to the photo's own aspect ratio, viewed through an
  // orthographic camera: no perspective foreshortening, and critically no
  // UV distortion. A CircleGeometry's default UV unwrap pinches the whole
  // rectangular photo (background pavement included) into the disc shape,
  // visibly warping it -- a plain plane just shows the photo as it is.
  const imgAspect = enhancedCanvas.width / enhancedCanvas.height;
  const planeW = imgAspect >= 1 ? 2 : 2 * imgAspect;
  const planeH = imgAspect >= 1 ? 2 / imgAspect : 2;
  const pad = 1.08; // a little headroom so the plane never touches the frame edge
  const camera = new THREE.OrthographicCamera(
    (-planeW / 2) * pad, (planeW / 2) * pad,
    (planeH / 2) * pad, (-planeH / 2) * pad,
    0.1, 10,
  );
  camera.position.set(0, 0, 2);

  const colorTexture = new THREE.CanvasTexture(enhancedCanvas);
  const normalTexture = new THREE.CanvasTexture(normalCanvas);
  const material = new THREE.MeshStandardMaterial({
    map: colorTexture,
    normalMap: normalTexture,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 0.85,
    metalness: 0.15,
  });
  const geometry = new THREE.PlaneGeometry(planeW, planeH);
  const plane = new THREE.Mesh(geometry, material);
  scene.add(plane);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const light = new THREE.PointLight(0xfff4e0, 2.2, 6);
  light.position.set(0, 0, 1.4);
  scene.add(light);

  function onPointerMove(e) {
    const rect = canvasEl.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    light.position.set(x * 1.3, y * 1.3, 1.1);
  }
  canvasEl.addEventListener("pointermove", onPointerMove);

  let raf;
  function tick() {
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      canvasEl.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      colorTexture.dispose();
      normalTexture.dispose();
    },
  };
}

async function show3DTab(src) {
  const view = $("recon-3d-view");
  view.dataset.state = "loading";
  try {
    threeState = await build3DScene(src, $("recon-3d-canvas"));
    view.dataset.state = "ready";
  } catch {
    view.dataset.state = "error";
  }
}

let enhancedRequested = false;

function selectTab(name, src) {
  const isEnhanced = name === "enhanced";
  $("recon-tab-enhanced").setAttribute("aria-pressed", String(isEnhanced));
  $("recon-tab-3d").setAttribute("aria-pressed", String(!isEnhanced));
  $("recon-enhanced-view").hidden = !isEnhanced;
  $("recon-3d-view").hidden = isEnhanced;
  // Each starts its (possibly slow) processing at most once per open,
  // whichever tab is visited first -- switching back and forth afterward
  // just toggles visibility, it doesn't reprocess.
  if (isEnhanced && !enhancedRequested) {
    enhancedRequested = true;
    showEnhancedTab(src);
  }
  if (!isEnhanced && !threeState) show3DTab(src);
}

export function openReconstruct(src) {
  enhancedRequested = false;
  $("recon-enhanced-view").dataset.state = "";
  $("recon-3d-view").dataset.state = "";
  $("recon-tab-enhanced").onclick = () => selectTab("enhanced", src);
  $("recon-tab-3d").onclick = () => selectTab("3d", src);
  $("reconstruct").hidden = false;
  selectTab("enhanced", src);
}

export function closeReconstruct() {
  $("reconstruct").hidden = true;
  if (threeState) {
    threeState.dispose();
    threeState = null;
  }
}

$("reconstruct-close").addEventListener("click", closeReconstruct);
