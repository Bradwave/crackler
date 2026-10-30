// Crackler: Pure derived quantities: velocity and acceleration by local least squares, per track.
import { makeMapper } from "./calibration.js";
import { frameList, timeOfFrame } from "./clip.js";
import { massOf, worldPoints } from "./tracks.js";

// Solves a 3×3 system by Gaussian elimination with partial pivoting; null if singular.
function solve3(M, b) {
  const A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < 3; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = A[r][3];
    for (let k = r + 1; k < 3; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

// First and second derivative of xs(ts) at every point.
// k is the half-width of the window in points: each estimate fits a parabola to the points within ±k.
// k = 1 is the plain central difference (one-sided at the ends); larger k smooths.
// Where there are too few points the value is null. ts must be increasing.
function derivatives(ts, xs, k = 1) {
  k = Math.max(1, Math.round(k));
  const n = ts.length,
    v = new Array(n).fill(null),
    a = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - k),
      hi = Math.min(n - 1, i + k),
      m = hi - lo + 1;
    if (m < 2) continue;
    if (m === 2) {
      v[i] = (xs[hi] - xs[lo]) / (ts[hi] - ts[lo]);
      continue;
    }
    // normal equations for x ≈ c0 + c1 dt + c2 dt², dt measured from the point itself
    const S = [0, 0, 0, 0, 0],
      T = [0, 0, 0];
    for (let j = lo; j <= hi; j++) {
      const dt = ts[j] - ts[i];
      let p = 1;
      for (let q = 0; q < 5; q++) {
        S[q] += p;
        if (q < 3) T[q] += p * xs[j];
        p *= dt;
      }
    }
    const c = solve3([[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], T);
    if (c) {
      v[i] = c[1];
      a[i] = 2 * c[2];
    }
  }
  return { v, a };
}

const hyp = (p, q) => (p == null || q == null ? null : Math.hypot(p, q));
const nulls = (n) => new Array(n).fill(null);

// Everything the table and the plots need for one track, aligned on the frames where it is defined.
// Columns: n, t, x, y, vx, vy, v, ax, ay, a, ek (kinetic energy, ½ m v²), and for vectors
// Vx, Vy, V, Va (components, length, angle in degrees from the x axis).
// `cal` is a calibration; `tracks` are all tracks (centre of mass, vectors and camera motion need them).
// `params` are the user parameters, needed by model tracks (analytic and dynamic particles).
function trackSeries(track, cal, clip, timeOf, k = 1, tracks = [], params = []) {
  const mapper = makeMapper(cal, tracks);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const env = { timeOf: (f) => timeOfFrame(clip, timeOf, f), params };
  const wp = worldPoints(track, (p, f) => mapper.map(p, f), byId, frameList(clip), env);
  const n = wp.map((e) => e.frame),
    N = n.length;
  const t = n.map((f) => timeOfFrame(clip, timeOf, f));
  const x = wp.map((e) => e.x),
    y = wp.map((e) => e.y);
  const model = track.kind === "analytic" || track.kind === "dynamic";
  const moving = track.kind === "point" || track.kind === "cm";
  // a model knows its own velocity and acceleration exactly; measured tracks use the smoothing window
  const dx = model ? { v: wp.map((e) => e.vx), a: wp.map((e) => e.ax) } : moving ? derivatives(t, x, k) : { v: nulls(N), a: nulls(N) };
  const dy = model ? { v: wp.map((e) => e.vy), a: wp.map((e) => e.ay) } : moving ? derivatives(t, y, k) : { v: nulls(N), a: nulls(N) };
  const v = dx.v.map((p, i) => hyp(p, dy.v[i]));
  const a = dx.a.map((p, i) => hyp(p, dy.a[i]));
  const mass = massOf(track, byId);
  const ek = v.map((s) => (s == null ? null : 0.5 * mass * s * s));
  const vec = track.kind === "vector" || track.kind === "vsum";
  const Vx = vec ? wp.map((e) => e.cx) : nulls(N),
    Vy = vec ? wp.map((e) => e.cy) : nulls(N);
  return {
    n,
    t,
    x,
    y,
    vx: dx.v,
    vy: dy.v,
    v,
    ax: dx.a,
    ay: dy.a,
    a,
    ek,
    Vx,
    Vy,
    V: vec ? Vx.map((c, i) => Math.hypot(c, Vy[i])) : nulls(N),
    Va: vec ? Vx.map((c, i) => (Math.atan2(Vy[i], c) * 180) / Math.PI) : nulls(N),
  };
}

export { derivatives, trackSeries, solve3 };
