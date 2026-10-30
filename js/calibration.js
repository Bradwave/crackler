// Crackler: Pure calibration: scale from a stick or a known rectangle, origin, axes, lens, camera motion.
// Pipeline for a pixel p at a frame:
//   camera motion (back to the base frame) -> lens undistortion -> metric plane (scale, or homography)
//   -> origin and rotated axes -> world coordinates.
// Pixels are image pixels (x right, y down). World y points up unless invertY is set.
// Perspective and lens corrections change the coordinates of marked points, never the video, and the
// perspective one is valid only for motion in the plane of the rectangle.
import { cameraFrame, fromBase, toBase } from "./camera.js";
import { apply, fromPoints, invert3 } from "./homography.js";
import { distort, isIdentity, lensFor, undistort } from "./lens.js";
import { interpPoint } from "./tracks.js";

const UNITS = ["m", "cm", "mm", "km", "in", "ft"];

function createCalibration(width = 0, height = 0) {
  return {
    width,
    height,
    stick: null, // { a: [x, y], b: [x, y] } in pixels
    length: 1,
    unit: "m",
    origin: [width / 2, height / 2],
    angle: 0, // radians, counter-clockwise in the metric plane
    invertY: false,
    lens: { k1: 0, k2: 0, lines: [] }, // lines: arrays of clicked points that should be straight
    persp: null, // { pts: 4 corners (bottom-left, bottom-right, top-right, top-left), w, h } in cal.unit
    camera: null, // { a: trackId, b: trackId | null, base: frame }
  };
}
function stickPixels(cal) {
  if (!cal.stick) return 0;
  const { a, b } = cal.stick;
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
const lensOf = (cal) => {
  const l = cal.lens;
  return l && (l.k1 || l.k2) && cal.width > 0 ? lensFor(l.k1, l.k2, cal.width, cal.height) : null;
};
// The four corners of the known rectangle in plane coordinates.
const rectOf = (p) => [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]];
function perspH(cal) {
  const p = cal.persp;
  if (!p || !(p.w > 0) || !(p.h > 0)) return null;
  return fromPoints(p.pts, rectOf(p));
}
// Whether the perspective rectangle is set and gives a valid homography.
const hasPersp = (cal) => !!perspH(cal);
// Length of the stick in undistorted pixels (a straight stick is only straight after undistortion).
function stickUndistorted(cal) {
  if (!cal.stick) return 0;
  const lens = lensOf(cal),
    a = undistort(lens, cal.stick.a) || cal.stick.a,
    b = undistort(lens, cal.stick.b) || cal.stick.b;
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
const unitLabel = (cal) => (hasPersp(cal) || stickPixels(cal) > 0 ? cal.unit : "px");

// ---------- the mapper ----------
// tracks: all tracks, needed only for the camera-motion references.
function makeMapper(cal, tracks = []) {
  const lens = lensOf(cal),
    H = perspH(cal),
    Hi = H ? invert3(H) : null;
  const px = stickUndistorted(cal);
  const k = !H && px > 0 && cal.length > 0 ? cal.length / px : 1;
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const refs = (id, f) => {
    const t = byId.get(id);
    return t && t.points ? interpPoint(t.points, f) : null;
  };
  const cams = new Map();
  const camAt = (f) => {
    if (!cal.camera) return null;
    if (!cams.has(f)) cams.set(f, cameraFrame(cal.camera, refs, f));
    return cams.get(f);
  };
  // pixel (base frame, as clicked) -> metric plane (u right, v up)
  const plane = (p) => {
    const q = undistort(lens, p);
    if (!q) return null;
    if (H) return apply(H, q);
    return [k * q[0], -k * q[1]];
  };
  const unplane = (uv) => {
    const q = Hi ? apply(Hi, uv) : [uv[0] / k, -uv[1] / k];
    return q ? distort(lens, q) : null;
  };
  const o = plane(cal.origin) || [0, 0];
  const c = Math.cos(cal.angle),
    s = Math.sin(cal.angle);
  const m = {
    // pixel at a frame -> world, or null if it cannot be mapped (e.g. beyond the lens model)
    map(p, frame = 0) {
      const uv = plane(toBase(p, camAt(frame)));
      if (!uv) return null;
      const du = uv[0] - o[0],
        dv = uv[1] - o[1],
        y = -du * s + dv * c;
      return [du * c + dv * s, cal.invertY ? -y : y];
    },
    unmap(w, frame = 0) {
      const y = cal.invertY ? -w[1] : w[1];
      const uv = [o[0] + w[0] * c - y * s, o[1] + w[0] * s + y * c];
      const p = unplane(uv);
      return p ? fromBase(p, camAt(frame)) : null;
    },
    // where a point of the base-frame image appears at this frame (for drawing the calibration)
    toFrame: (p, frame) => fromBase(p, camAt(frame)),
    toBaseFrame: (p, frame) => toBase(p, camAt(frame)),
    // plane coordinates of a base-frame pixel and back (the angle of the axes lives in this plane)
    plane,
    unplane,
    unit: unitLabel(cal),
    perspective: !!H,
    k,
  };
  // world units per pixel at the origin
  const p0 = cal.origin,
    a = m.map(p0, cal.camera ? cal.camera.base : 0),
    b = m.map([p0[0] + 1, p0[1]], cal.camera ? cal.camera.base : 0);
  m.scale = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : k;
  return m;
}

// ---------- conveniences (no camera motion unless tracks and a frame are given) ----------
const pixelToWorld = (cal, p, frame = 0, tracks = []) => makeMapper(cal, tracks).map(p, frame);
const worldToPixel = (cal, w, frame = 0, tracks = []) => makeMapper(cal, tracks).unmap(w, frame);
const scale = (cal) => makeMapper(cal).scale;
// Directions of the world axes on the image at the origin: unit vectors in pixel space.
function axes(cal) {
  const m = makeMapper(cal),
    e = m.scale > 0 ? m.scale : 1;
  const base = cal.camera ? cal.camera.base : 0;
  const o = m.unmap([0, 0], base),
    a = m.unmap([e, 0], base),
    b = m.unmap([0, e], base);
  const unit = (v) => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };
  if (!o || !a || !b) return { ex: [1, 0], ey: [0, -1] };
  return { ex: unit([a[0] - o[0], a[1] - o[1]]), ey: unit([b[0] - o[0], b[1] - o[1]]) };
}
// Angle (in the metric plane) of the line from the origin to pixel p; used to drag the axes.
function angleToward(cal, p) {
  const m = makeMapper(cal),
    uo = m.plane(cal.origin),
    up = m.plane(p);
  return uo && up ? Math.atan2(up[1] - uo[1], up[0] - uo[0]) : cal.angle;
}
// Angle that makes the x axis follow the stick (for inclined planes).
function stickAngle(cal) {
  if (!cal.stick) return cal.angle;
  const m = makeMapper(cal),
    ua = m.plane(cal.stick.a),
    ub = m.plane(cal.stick.b);
  return ua && ub ? Math.atan2(ub[1] - ua[1], ub[0] - ua[0]) : cal.angle;
}

export {
  UNITS,
  createCalibration,
  stickPixels,
  makeMapper,
  hasPersp,
  lensOf,
  isIdentity,
  scale,
  unitLabel,
  axes,
  pixelToWorld,
  worldToPixel,
  stickAngle,
  angleToward,
};
