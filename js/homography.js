// Crackler: Pure homography (projective map between two planes) from four point pairs.
// Used for perspective correction: image points of a known rectangle -> metric plane coordinates.
import { solve } from "./linalg.js";

const mul3 = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));

function invert3(M) {
  const [[a, b, c], [d, e, f], [g, h, i]] = M;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return null;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// Similarity that moves the points to centroid 0 and mean distance √2 (keeps the system well conditioned).
function normalizer(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n,
    cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / n;
  const s = d > 0 ? Math.SQRT2 / d : 1;
  return [[s, 0, -s * cx], [0, s, -s * cy], [0, 0, 1]];
}
const apply3 = (M, p) => {
  const w = M[2][0] * p[0] + M[2][1] * p[1] + M[2][2];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  return [(M[0][0] * p[0] + M[0][1] * p[1] + M[0][2]) / w, (M[1][0] * p[0] + M[1][1] * p[1] + M[1][2]) / w];
};

// Twice the signed area of triangle (a, b, c).
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

// True if the four points form a proper (convex, non-degenerate) quadrilateral in the given order.
function isProperQuad(q) {
  if (!q || q.length !== 4) return false;
  const s = [0, 1, 2, 3].map((i) => cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]));
  const size = Math.max(...q.flatMap((p) => p.map(Math.abs)), 1);
  if (s.some((v) => Math.abs(v) < 1e-9 * size * size)) return false;
  return s.every((v) => v > 0) || s.every((v) => v < 0);
}

// H such that H(src[i]) = dst[i]; null if the points are degenerate.
function fromPoints(src, dst) {
  if (!isProperQuad(src) || !isProperQuad(dst)) return null;
  const T1 = normalizer(src),
    T2 = normalizer(dst);
  const s = src.map((p) => apply3(T1, p)),
    d = dst.map((p) => apply3(T2, p));
  const A = [],
    b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = s[i],
      [u, v] = d[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  const T2i = invert3(T2);
  if (!T2i) return null;
  const H = mul3(T2i, mul3(Hn, T1));
  const k = H[2][2];
  if (!Number.isFinite(k) || Math.abs(k) < 1e-300) return H;
  return H.map((r) => r.map((v) => v / k));
}

export { fromPoints, invert3, mul3, apply3 as apply, isProperQuad };
