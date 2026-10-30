// Crackler: The video stage: camera (zoom and pan), drawing of the frame, tracks and calibration.
import { $ } from "../dom.js";
import { mapper, on, st } from "../state.js";
import { clamp, fmt } from "../util.js";
import { makeToolbox } from "./draw.js";
import { drawOverlays, handleList } from "./overlay.js";

// ---------- canvas and camera ----------
const cv = $("#cv"),
  ctx = cv.getContext("2d"),
  wrap = $("#wrap");
const cam = { zoom: 1, x: 0, y: 0 };
const C = {};
let dpr = 1,
  W = 300,
  H = 300,
  raf = 0,
  fitZoom = 1;

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["surface", "ink", "muted", "accent", "tile2", "stage", "vel", "acc", "pos"])
    C[k] = cs.getPropertyValue("--" + k).trim();
  req();
}
function resize() {
  const d = window.devicePixelRatio || 1,
    w = Math.max(60, cv.clientWidth),
    h = Math.max(60, cv.clientHeight);
  const first = !cam.sized;
  if (w === W && h === H && d === dpr && !first) return;
  // keep the centre of the view fixed when the stage changes size
  const cx = (W / 2 - cam.x) / cam.zoom,
    cy = (H / 2 - cam.y) / cam.zoom;
  dpr = d;
  W = w;
  H = h;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  fitZoom = fitZoomOf();
  if (first || !st.src || !cam.manual) fitCam();
  else {
    cam.x = W / 2 - cx * cam.zoom;
    cam.y = H / 2 - cy * cam.zoom;
  }
  cam.sized = true;
  req();
}
const fitZoomOf = () => (st.src ? Math.min(W / st.src.width, H / st.src.height) * 0.98 : 1);
function fitCam() {
  if (!st.src) return;
  fitZoom = fitZoomOf();
  cam.zoom = fitZoom;
  cam.manual = false;
  cam.x = (W - st.src.width * cam.zoom) / 2;
  cam.y = (H - st.src.height * cam.zoom) / 2;
  req();
}
function zoomAt(sx, sy, factor) {
  const z = clamp(cam.zoom * factor, fitZoom * 0.4, 60);
  const ix = (sx - cam.x) / cam.zoom,
    iy = (sy - cam.y) / cam.zoom;
  cam.zoom = z;
  cam.manual = true;
  cam.x = sx - ix * z;
  cam.y = sy - iy * z;
  req();
}
const toImage = (s) => [(s[0] - cam.x) / cam.zoom, (s[1] - cam.y) / cam.zoom];
const toScreen = (p) => [p[0] * cam.zoom + cam.x, p[1] * cam.zoom + cam.y];
const viewSize = () => [W, H];

// ---------- handles of the calibrate tool ----------
const HIT = 24;
// The handle under screen point s, or null. Handles are listed by overlay.js (they depend on what is set up).
function hitHandle(s) {
  for (const h of handleList(cam.zoom)) {
    const p = toScreen(h.pos);
    if (Math.hypot(p[0] - s[0], p[1] - s[1]) <= HIT) return h;
  }
  return null;
}

// ---------- drawing ----------
function req() {
  if (!raf) raf = requestAnimationFrame(draw);
}
const toolbox = makeToolbox(ctx, C, cam, toScreen);

function draw() {
  raf = 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.stage || "#000";
  ctx.fillRect(0, 0, W, H);
  if (!st.src || !st.src.frameCount) return;
  const bmp = st.src.getFrame(st.frame);
  ctx.imageSmoothingEnabled = cam.zoom < 3;
  ctx.drawImage(bmp, cam.x, cam.y, st.src.width * cam.zoom, st.src.height * cam.zoom);
  drawOverlays(toolbox);
}

// ---------- readout ----------
const readout = $("#readout");
// World coordinates under the mouse; null hides the box.
function showHover(ip) {
  if (!ip || !st.src) {
    readout.hidden = true;
    return;
  }
  const M = mapper(),
    w = M.map(ip, st.frame);
  if (!w) {
    readout.hidden = true;
    return;
  }
  const d = M.scale < 0.001 ? 5 : 3;
  readout.textContent = `x = ${fmt(w[0], d)} ${M.unit}   y = ${fmt(w[1], d)} ${M.unit}`;
  readout.hidden = false;
}

function init() {
  new ResizeObserver(resize).observe(wrap);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  new MutationObserver(readColors).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  for (const e of ["frame", "tracks", "calib", "tool", "settings"]) on(e, req);
  on("source", () => {
    fitCam();
    $("#empty").hidden = true;
  });
  readColors();
  resize();
  if (document.fonts) document.fonts.ready.then(req);
}

export { C, cv, wrap, cam, init, req, fitCam, zoomAt, toImage, toScreen, viewSize, hitHandle, showHover, resize };
