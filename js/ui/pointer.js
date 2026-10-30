// Crackler: Pointer input on the stage: place points, drag handles, pan, pinch and wheel zoom.
// One finger or the mouse places a point (loupe on touch); two fingers pinch and pan.
import { t } from "../i18n.js";
import { addCollected, emit, mapper, markPoint, setTool, st, touchCal } from "../state.js";
import { clamp } from "../util.js";
import { toast } from "./controls.js";
import * as loupe from "./loupe.js";
import { cam, cv, hitHandle, req, showHover, toImage, viewSize, zoomAt } from "./stage.js";

const ptrs = new Map();
let g = null; // current gesture: { type: "place" | "pan" | "pinch", ... }

const loc = (e) => {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};
const clampImg = (p) => [clamp(p[0], 0, st.src.width), clamp(p[1], 0, st.src.height)];
// Where a point clicked at this frame sits in the base-frame image the calibration is defined in.
const toBase = (p) => mapper().toBaseFrame(p, st.frame);

// ---------- placing ----------
// purpose: "mark", "collect", "stickA", "stickB", "origin", or a handle object { id, set(raw) }.
function beginPlace(e, s, purpose) {
  g = { type: "place", purpose, touch: e.pointerType !== "mouse" };
  update(s);
}
function update(s) {
  const raw = toImage(s),
    p = clampImg(raw);
  st.provisional = p;
  if (typeof g.purpose === "object") {
    g.purpose.set(g.purpose.id === "axis" ? raw : p);
    emit("calib");
    emit("tracks");
  }
  if (g.touch) loupe.show(p, s, cam.zoom, viewSize(), "#ffd23f");
  req();
}
function commit() {
  const p = st.provisional,
    purpose = g.purpose;
  cancelPlace();
  if (!p) return;
  if (typeof purpose === "object") return touchCal();
  if (purpose === "mark") {
    markPoint(p);
    return;
  }
  const b = toBase(p);
  if (purpose === "collect") addCollected(b);
  else if (purpose === "stickA") {
    st.pendingA = b;
    setTool("calib", "stickB");
  } else if (purpose === "stickB") {
    st.cal.stick = { a: st.pendingA, b };
    setTool("calib", null);
    touchCal();
  } else if (purpose === "origin") {
    st.cal.origin = b;
    setTool("calib", null);
    touchCal();
  }
}
function cancelPlace() {
  st.provisional = null;
  loupe.hide();
  g = null;
  req();
}

// ---------- pan and pinch ----------
function beginPan(s) {
  g = { type: "pan", last: s };
  cv.classList.add("grabbing");
}
function beginPinch() {
  const [a, b] = [...ptrs.values()];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  g = { type: "pinch", dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, zoom: cam.zoom, ip: toImage(mid) };
}
function updatePinch() {
  const [a, b] = [...ptrs.values()];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
  cam.manual = true;
  cam.zoom = clamp(g.zoom * (d / g.dist), 0.05, 60);
  cam.x = mid[0] - g.ip[0] * cam.zoom;
  cam.y = mid[1] - g.ip[1] * cam.zoom;
  req();
}

// ---------- events ----------
let warned = 0;
function purposeFor(s) {
  if (st.tool === "collect") return "collect";
  if (st.tool === "calib") {
    const h = hitHandle(s);
    if (h) return h;
    return st.calibStep || null; // stickA, stickB, origin, or pan
  }
  if (st.tool !== "mark") return null;
  const tr = st.tracks[st.active];
  if (tr.kind === "cm" || tr.kind === "vsum") {
    if (Date.now() - warned > 2500) toast(t("computedTrack"));
    warned = Date.now();
    return null;
  }
  return "mark";
}
function down(e) {
  if (!st.src) return;
  e.preventDefault();
  try {
    cv.setPointerCapture(e.pointerId);
  } catch {
    // synthetic or already released pointer: the stage still works without capture
  }
  const s = loc(e);
  ptrs.set(e.pointerId, s);
  if (ptrs.size === 2) {
    if (g && g.type === "place") cancelPlace();
    if (g && g.type === "pan") cv.classList.remove("grabbing");
    beginPinch();
    return;
  }
  if (ptrs.size > 2) return;
  const wantPan = e.pointerType === "mouse" && (e.button === 1 || e.button === 2);
  const purpose = wantPan ? null : purposeFor(s);
  if (purpose) beginPlace(e, s, purpose);
  else beginPan(s);
}
function move(e) {
  const s = loc(e);
  if (!ptrs.has(e.pointerId)) {
    if (e.pointerType === "mouse" && st.src) showHover(toImage(s));
    return;
  }
  ptrs.set(e.pointerId, s);
  if (!g) return;
  if (g.type === "pinch") updatePinch();
  else if (g.type === "pan") {
    cam.manual = true;
    cam.x += s[0] - g.last[0];
    cam.y += s[1] - g.last[1];
    g.last = s;
    req();
  } else if (g.type === "place") {
    update(s);
    if (!g.touch) showHover(st.provisional);
  }
}
function up(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (!g) return;
  if (g.type === "place") {
    if (e.type === "pointercancel") cancelPlace();
    else commit();
  } else if (g.type === "pan") {
    cv.classList.remove("grabbing");
    g = null;
  } else if (g.type === "pinch" && ptrs.size < 2) g = null;
}
function wheel(e) {
  if (!st.src) return;
  e.preventDefault();
  const s = loc(e);
  const unit = e.deltaMode === 1 ? 16 : 1;
  const k = e.ctrlKey ? 0.01 : 0.0016;
  zoomAt(s[0], s[1], Math.exp(-e.deltaY * unit * k));
}

function init() {
  cv.addEventListener("pointerdown", down);
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !ptrs.size) showHover(null);
  });
  cv.addEventListener("wheel", wheel, { passive: false });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  // iOS Safari: stop the page from zooming while pinching the stage
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) cv.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && g && g.type === "place") {
      for (const id of [...ptrs.keys()]) ptrs.delete(id);
      cancelPlace();
    }
  });
}

export { init };
