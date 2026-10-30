// Crackler: Tests for homography.js, lens.js, camera.js, circle.js and autotrack.js.
import test from "node:test";
import assert from "node:assert/strict";
import { cutTemplate, match, prepare, toGray } from "../js/autotrack.js";
import { cameraFrame, fromBase, toBase } from "../js/camera.js";
import { angleAt, fitCircle } from "../js/circle.js";
import { apply, fromPoints, invert3, isProperQuad, mul3 } from "../js/homography.js";
import { distort, fitK1, lensFor, undistort } from "../js/lens.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const nearP = (p, q, eps = 1e-9) => (near(p[0], q[0], eps), near(p[1], q[1], eps));
let seed = 99;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;

// ---------- homography ----------
test("homography: the four points map exactly, and the map is invertible", () => {
  const src = [[100, 300], [500, 280], [540, 60], [80, 40]]; // a rectangle seen in perspective
  const dst = [[0, 0], [2, 0], [2, 1], [0, 1]];
  const H = fromPoints(src, dst);
  assert.ok(H);
  src.forEach((p, i) => nearP(apply(H, p), dst[i], 1e-9));
  const Hi = invert3(H);
  nearP(apply(Hi, [1, 0.5]), apply(Hi, [1, 0.5]));
  dst.forEach((p, i) => nearP(apply(Hi, p), src[i], 1e-7));
  const I = mul3(H, Hi);
  near(I[0][0], 1, 1e-9);
  near(I[1][1], 1, 1e-9);
  near(I[0][1], 0, 1e-9);
});
test("homography: recovers a known projective map at other points", () => {
  const H0 = [[1.2, 0.1, 30], [-0.05, 0.9, 12], [0.0004, 0.0002, 1]];
  const src = [[0, 0], [400, 0], [400, 300], [0, 300]];
  const dst = src.map((p) => apply(H0, p));
  const H = fromPoints(src, dst);
  for (const p of [[100, 50], [333, 222], [10, 290]]) nearP(apply(H, p), apply(H0, p), 1e-7);
});
test("homography: a pure scale and shift is affine (no perspective terms)", () => {
  const H = fromPoints([[0, 0], [10, 0], [10, 10], [0, 10]], [[5, 5], [25, 5], [25, 25], [5, 25]]);
  near(H[2][0], 0, 1e-12);
  near(H[2][1], 0, 1e-12);
  nearP(apply(H, [5, 5]), [15, 15]);
});
test("homography: degenerate or crossed quadrilaterals are refused", () => {
  assert.equal(fromPoints([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [1, 1], [0, 1]]), null);
  assert.equal(isProperQuad([[0, 0], [10, 10], [10, 0], [0, 10]]), false); // bow tie
  assert.equal(isProperQuad([[0, 0], [10, 0], [10, 10], [0, 10]]), true);
  assert.equal(isProperQuad([[0, 0], [10, 0], [10, 10], [0, 10]].reverse()), true);
  assert.equal(fromPoints([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [1, 0], [1, 1], [0.5, 0.5]]), null); // concave
});

// ---------- lens ----------
test("lens: distort and undistort are inverses, k1 sign and centre", () => {
  const l = lensFor(-0.18, 0.04, 800, 600);
  for (const p of [[400, 300], [10, 10], [790, 590], [123, 456], [700, 50]]) {
    const d = distort(l, p),
      u = undistort(l, d);
    nearP(u, p, 1e-6);
  }
  nearP(distort(l, [400, 300]), [400, 300]); // the centre does not move
  const edge = distort(l, [800, 300]);
  assert.ok(edge[0] < 800, "barrel distortion pulls points towards the centre");
  const pin = distort(lensFor(0.1, 0, 800, 600), [800, 300]);
  assert.ok(pin[0] > 800, "pincushion pushes them out");
  nearP(undistort(lensFor(0, 0, 800, 600), [12, 34]), [12, 34]);
});
test("lens: a point beyond the folding radius has no undistorted position", () => {
  const l = lensFor(-0.9, 0, 800, 600); // r_d peaks at 2/(3√3·…): points farther out cannot be produced
  assert.equal(undistort(l, [800, 600]), null);
});
test("lens: k1 is recovered from points on straight lines", () => {
  const truth = lensFor(-0.12, 0, 640, 480);
  const lines = [];
  for (const y of [60, 200, 330, 440]) lines.push(Array.from({ length: 12 }, (_, i) => distort(truth, [30 + i * 55, y])));
  lines.push(Array.from({ length: 10 }, (_, i) => distort(truth, [120, 20 + i * 48])));
  const base = lensFor(0, 0, 640, 480);
  const r = fitK1(lines, base);
  near(r.k1, -0.12, 1e-4);
  assert.ok(r.rms < 1e-3);
  // with click noise it is still close, and rms reflects the noise
  const noisy = lines.map((ln) => ln.map((p) => [p[0] + rnd() * 0.5, p[1] + rnd() * 0.5]));
  const rn = fitK1(noisy, base);
  near(rn.k1, -0.12, 0.02);
  assert.ok(rn.rms > 0.05 && rn.rms < 1);
  // no distortion -> k1 near 0; too few points -> null
  const flat = [Array.from({ length: 8 }, (_, i) => [50 + i * 60, 100 + i * 5])];
  near(fitK1(flat, base).k1, 0, 1e-6);
  assert.equal(fitK1([[[0, 0], [1, 1]]], base), null);
});

// ---------- camera ----------
test("camera: shift only and shift with rotation, toBase and fromBase are inverses", () => {
  const marks = { 1: { 0: [100, 100], 5: [110, 90] }, 2: { 0: [200, 100], 5: [110 + 0, 90 - 100] } };
  const refs = (id, f) => marks[id][f] || null;
  // shift only: the scene moved by (+10, -10)
  const cf = cameraFrame({ a: 1, b: null, base: 0 }, refs, 5);
  nearP(toBase([110, 90], cf), [100, 100]);
  nearP(toBase([150, 40], cf), [140, 50]);
  nearP(fromBase(toBase([321, 123], cf), cf), [321, 123]);
  assert.equal(cameraFrame({ a: 1, b: null, base: 0 }, refs, 3), null); // no mark at that frame
  assert.equal(cameraFrame(null, refs, 5), null);
  // rotation: reference B was 100 px right of A, now it is 100 px above A (rotated by -90° in image terms)
  const cr = cameraFrame({ a: 1, b: 2, base: 0 }, refs, 5);
  near(cr.d, -Math.PI / 2, 1e-12);
  nearP(toBase([110, 90], cr), [100, 100]);
  nearP(toBase([110, -10], cr), [200, 100]); // B at frame 5 goes back to B at frame 0
  nearP(fromBase(toBase([40, 70], cr), cr), [40, 70]);
});

// ---------- circle ----------
test("circle fit: exact points, noisy arc, collinear and too few", () => {
  const pts = Array.from({ length: 12 }, (_, i) => [50 + 30 * Math.cos(i / 2), -20 + 30 * Math.sin(i / 2)]);
  const c = fitCircle(pts);
  near(c.cx, 50, 1e-8);
  near(c.cy, -20, 1e-8);
  near(c.r, 30, 1e-8);
  near(c.rms, 0, 1e-8);
  // a quarter arc with noise is the hard case for algebraic fits
  const arc = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 39) * (Math.PI / 2);
    return [10 + 100 * Math.cos(a) + rnd() * 0.3, 5 + 100 * Math.sin(a) + rnd() * 0.3];
  });
  const f = fitCircle(arc);
  near(f.r, 100, 1.5);
  near(f.cx, 10, 1.5);
  assert.ok(f.rms < 0.5);
  assert.equal(fitCircle([[0, 0], [1, 1], [2, 2], [3, 3]]), null);
  assert.equal(fitCircle([[0, 0], [1, 1]]), null);
});
test("angle at a vertex", () => {
  near(angleAt([0, 0], [1, 0], [0, 1]), Math.PI / 2);
  near(angleAt([0, 0], [1, 0], [1, 1]), Math.PI / 4);
  near(angleAt([5, 5], [6, 5], [4, 5]), Math.PI);
  assert.equal(angleAt([1, 1], [1, 1], [2, 2]), null);
});

// ---------- template matching ----------
function scene(w, h, bx, by, { gain = 1, offset = 0, noise = 0 } = {}) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d2 = (x - bx) ** 2 + (y - by) ** 2;
      let v = 40 + 8 * Math.sin(x / 7) + 6 * Math.cos(y / 5) + 180 * Math.exp(-d2 / 18);
      g[y * w + x] = gain * v + offset + noise * rnd();
    }
  return g;
}
test("template matching: finds a moving blob to sub-pixel accuracy", () => {
  const W = 160,
    H = 120;
  const g0 = scene(W, H, 50, 40);
  const tpl = prepare(cutTemplate(g0, W, H, 50, 40, 10));
  for (const [bx, by] of [[50, 40], [57.4, 43.7], [62.2, 35.1], [70, 48.5]]) {
    const m = match(scene(W, H, bx, by), W, H, tpl, 55, 41, 25);
    near(m.x, bx, 0.4); // integer peak plus a sub-pixel correction: about 0.3 px
    near(m.y, by, 0.4);
    assert.ok(m.score > 0.95, `score ${m.score}`);
  }
});
test("template matching: brightness and contrast changes and noise do not matter; blank images fail", () => {
  const W = 160,
    H = 120;
  const tpl = prepare(cutTemplate(scene(W, H, 50, 40), W, H, 50, 40, 10));
  const m = match(scene(W, H, 66, 52, { gain: 0.5, offset: 30, noise: 4 }), W, H, tpl, 60, 45, 25);
  near(m.x, 66, 0.4);
  near(m.y, 52, 0.4);
  assert.ok(m.score > 0.9);
  const blank = new Float32Array(W * H).fill(100);
  assert.ok(match(blank, W, H, tpl, 60, 45, 25).score < 0.2);
  // the object outside the search window is not found
  const far = match(scene(W, H, 120, 90), W, H, tpl, 50, 40, 12);
  assert.ok(far.score < 0.8);
});
test("template matching: edges of the image, and conversion from RGBA", () => {
  const W = 60,
    H = 50;
  const g = scene(W, H, 5, 5);
  assert.equal(cutTemplate(g, W, H, 5, 5, 10), null); // window would leave the image
  const tpl = prepare(cutTemplate(scene(W, H, 30, 25), W, H, 30, 25, 6));
  assert.equal(match(g, W, H, tpl, 2, 2, 3), null); // search window entirely invalid
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const gr = toGray(rgba, 2, 1);
  near(gr[0], 0.299 * 255, 1e-3);
  near(gr[1], 0.587 * 255, 1e-3);
});
