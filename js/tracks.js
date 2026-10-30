// Crackler: Pure track data model. Kinds:
//   point   a point mass, marked frame by frame (pixels)
//   cm      centre of mass of point masses (weights = their masses), computed
//   vector  an arrow marked frame by frame: head per frame, tail marked or attached to a point mass
//   vsum    the sum of vectors, computed, drawn from the tail of the first one
//   analytic  a particle moving as x(t), y(t) given by formulas (world coordinates, clip time)
//   dynamic   a particle obeying m a = F from force formulas, integrated by Euler or RK4

import { compileModel, defaultModel, evalAnalytic, simulate } from "./model.js";

const COLORS = ["#E8344E", "#2350D8", "#F5A623", "#7B3FE4", "#0F9A63", "#00A7C4", "#C2185B", "#6D4C41"];
const MARKERS = ["circle", "cross", "square", "diamond", "triangle"];
const KINDS = ["point", "cm", "vector", "vsum", "analytic", "dynamic"];

function createTrack(id, opts = {}) {
  const i = Math.max(0, id - 1),
    kind = KINDS.includes(opts.kind) ? opts.kind : "point";
  return {
    id,
    kind,
    name: opts.name ?? String.fromCharCode(65 + (i % 26)),
    color: opts.color ?? COLORS[i % COLORS.length],
    marker: opts.marker ?? MARKERS[0],
    visible: opts.visible ?? true,
    mass: opts.mass ?? 1,
    points: {}, // frame -> [x, y] pixels: the point itself, or the tail of a vector
    heads: {}, // vectors: frame -> [x, y] pixels of the arrow head
    tail: opts.tail ?? null, // vectors: id of a point mass the tail follows, or null (tail is marked)
    members: opts.members ?? [], // cm and vsum: ids of the tracks combined
    model: opts.model ?? (kind === "analytic" || kind === "dynamic" ? defaultModel(kind) : null),
  };
}
const isMarked = (t) => t.kind === "point" || t.kind === "vector";
function setPoint(track, frame, p) {
  track.points[frame] = [p[0], p[1]];
}
function getPoint(track, frame) {
  return track.points[frame] || null;
}
function removePoint(track, frame) {
  delete track.points[frame];
  delete track.heads[frame];
}
// Number of marked frames: points for a point mass, heads for a vector, 0 for computed tracks.
function pointCount(track) {
  return Object.keys(track.kind === "vector" ? track.heads : track.points).length;
}
function markedFrames(track) {
  return Object.keys(track.kind === "vector" ? track.heads : track.points)
    .map(Number)
    .sort((a, b) => a - b);
}
// Linear interpolation between marked frames (held constant outside them); null with no marks.
function interpPoint(points, frame) {
  const ks = Object.keys(points).map(Number);
  if (!ks.length) return null;
  ks.sort((a, b) => a - b);
  if (points[frame]) return points[frame];
  if (frame <= ks[0]) return points[ks[0]];
  if (frame >= ks[ks.length - 1]) return points[ks[ks.length - 1]];
  let lo = 0,
    hi = ks.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ks[mid] <= frame) lo = mid;
    else hi = mid;
  }
  const a = points[ks[lo]],
    b = points[ks[hi]],
    f = (frame - ks[lo]) / (ks[hi] - ks[lo]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// ---------- positions in world coordinates ----------
// map(p, frame) -> [x, y] world or null. Returns entries for the frames (from `frames`) where the track
// is defined: { frame, x, y } and for vectors also { cx, cy } (the components of the arrow).
// env = { timeOf(frame) -> seconds, params: [{ name, value }] } is needed for the model kinds.
function worldPoints(track, map, byId, frames, env) {
  if (track.kind === "analytic" || track.kind === "dynamic") return modelEntries(track, frames, env);
  const out = [];
  const pointAt = (t, f) => {
    const p = getPoint(t, f);
    return p ? map(p, f) : null;
  };
  const vectorAt = (v, f) => {
    const h = v.heads[f];
    if (!h) return null;
    const tailTrack = v.tail != null ? byId.get(v.tail) : null;
    const tp = tailTrack ? getPoint(tailTrack, f) : getPoint(v, f);
    if (!tp) return null;
    const t = map(tp, f),
      e = map(h, f);
    return t && e ? { x: t[0], y: t[1], cx: e[0] - t[0], cy: e[1] - t[1] } : null;
  };
  for (const f of frames) {
    if (track.kind === "point") {
      const w = pointAt(track, f);
      if (w) out.push({ frame: f, x: w[0], y: w[1] });
    } else if (track.kind === "cm") {
      let sx = 0,
        sy = 0,
        sm = 0,
        ok = track.members.length > 0;
      for (const id of track.members) {
        const m = byId.get(id),
          w = m && m.kind === "point" ? pointAt(m, f) : null;
        if (!w) {
          ok = false;
          break;
        }
        sx += w[0] * m.mass;
        sy += w[1] * m.mass;
        sm += m.mass;
      }
      if (ok && sm > 0) out.push({ frame: f, x: sx / sm, y: sy / sm });
    } else if (track.kind === "vector") {
      const v = vectorAt(track, f);
      if (v) out.push({ frame: f, ...v });
    } else if (track.kind === "vsum") {
      let first = null,
        cx = 0,
        cy = 0,
        ok = track.members.length > 0;
      for (const id of track.members) {
        const m = byId.get(id),
          v = m && m.kind === "vector" ? vectorAt(m, f) : null;
        if (!v) {
          ok = false;
          break;
        }
        first = first || v;
        cx += v.cx;
        cy += v.cy;
      }
      if (ok) out.push({ frame: f, x: first.x, y: first.y, cx, cy });
    }
  }
  return out;
}
// ---------- model tracks ----------
const memo = new Map();
// The compile errors of a model track's formulas (empty object if fine).
function modelErrors(track, params = []) {
  return compileModel(track.kind, track.model, params.map((p) => p.name)).errors;
}
function modelEntries(track, frames, env) {
  if (!env || !track.model) return [];
  const times = frames.map((f) => env.timeOf(f));
  const key = JSON.stringify([track.kind, track.model, track.mass, env.params, frames.length, frames[0], frames[frames.length - 1], times[0], times[times.length - 1]]);
  let r = memo.get(key);
  if (!r) {
    const c = compileModel(track.kind, track.model, env.params.map((p) => p.name));
    if (!c.ok) r = null;
    else if (track.kind === "analytic") r = evalAnalytic(c.fns, times, env.params);
    else
      r = simulate({ ...track.model, fns: c.fns, mass: track.mass, params: env.params, times });
    if (memo.size > 24) memo.delete(memo.keys().next().value);
    memo.set(key, r);
  }
  if (!r) return [];
  const out = [];
  frames.forEach((frame, i) => {
    if (r.x[i] != null && r.y[i] != null) out.push({ frame, x: r.x[i], y: r.y[i], vx: r.vx[i], vy: r.vy[i], ax: r.ax[i], ay: r.ay[i] });
  });
  return out;
}

// Mass of a track for kinetic energy: its own, or the total of the members of a centre of mass.
function massOf(track, byId) {
  if (track.kind === "cm") return track.members.reduce((s, id) => s + (byId.get(id) ? byId.get(id).mass : 0), 0);
  return track.mass;
}

export {
  COLORS,
  MARKERS,
  KINDS,
  createTrack,
  isMarked,
  setPoint,
  getPoint,
  removePoint,
  pointCount,
  markedFrames,
  interpPoint,
  worldPoints,
  modelErrors,
  massOf,
};
