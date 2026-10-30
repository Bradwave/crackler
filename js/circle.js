// Crackler: Pure circle fit and angle helpers for the circle fitter and the protractor.
import { solve } from "./linalg.js";

// Least-squares circle through the points: algebraic fit (Kåsa), then a few Gauss-Newton steps on the
// geometric distance. Returns { cx, cy, r, rms } or null for fewer than 3 points or collinear points.
function fitCircle(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n,
    my = pts.reduce((s, p) => s + p[1], 0) / n;
  // work around the centroid for conditioning
  const u = pts.map((p) => [p[0] - mx, p[1] - my]);
  let suu = 0,
    suv = 0,
    svv = 0,
    suuu = 0,
    svvv = 0,
    suvv = 0,
    svuu = 0;
  for (const [a, b] of u) {
    suu += a * a;
    suv += a * b;
    svv += b * b;
    suuu += a * a * a;
    svvv += b * b * b;
    suvv += a * b * b;
    svuu += b * a * a;
  }
  const det = suu * svv - suv * suv;
  if (!(Math.abs(det) > 1e-12 * (suu + svv) ** 2)) return null;
  const rhs1 = 0.5 * (suuu + suvv),
    rhs2 = 0.5 * (svvv + svuu);
  let cx = (rhs1 * svv - rhs2 * suv) / det,
    cy = (suu * rhs2 - suv * rhs1) / det;
  let r = Math.sqrt(cx * cx + cy * cy + (suu + svv) / n);
  for (let it = 0; it < 12; it++) {
    // minimise sum (|p - c| - r)²
    const J = [],
      res = [];
    for (const [a, b] of u) {
      const d = Math.hypot(a - cx, b - cy) || 1e-12;
      J.push([(cx - a) / d, (cy - b) / d, -1]);
      res.push(d - r);
    }
    const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => J.reduce((s, row) => s + row[i] * row[j], 0)));
    const g = [0, 1, 2].map((i) => -J.reduce((s, row, k) => s + row[i] * res[k], 0));
    const d = solve(A, g);
    if (!d) break;
    cx += d[0];
    cy += d[1];
    r += d[2];
    if (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) < 1e-12 * (1 + r)) break;
  }
  const rms = Math.sqrt(u.reduce((s, [a, b]) => s + (Math.hypot(a - cx, b - cy) - r) ** 2, 0) / n);
  if (!Number.isFinite(r) || !Number.isFinite(cx) || !(r > 0)) return null;
  return { cx: cx + mx, cy: cy + my, r, rms };
}

// Angle at vertex v between the arms towards a and b, in radians in [0, π]; null if an arm has no length.
function angleAt(v, a, b) {
  const ux = a[0] - v[0],
    uy = a[1] - v[1],
    wx = b[0] - v[0],
    wy = b[1] - v[1];
  const lu = Math.hypot(ux, uy),
    lw = Math.hypot(wx, wy);
  if (!(lu > 0) || !(lw > 0)) return null;
  return Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy) / (lu * lw))));
}

export { fitCircle, angleAt };
