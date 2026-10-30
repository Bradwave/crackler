// Crackler: End-to-end check of the pure pipeline on the synthetic clip: recover g from clicks.
import test from "node:test";
import assert from "node:assert/strict";
import { ballPixel, defaultSpec, frameCountOf, stickEnds } from "../js/frames-synthetic.js";
import { createCalibration, pixelToWorld } from "../js/calibration.js";
import { createClip, frameList, timeOfFrame } from "../js/clip.js";
import { buildTable } from "../js/table.js";
import { createTrack, setPoint } from "../js/tracks.js";

// Least-squares parabola y = c0 + c1 t + c2 t², solved with the normal equations.
function parabola(ts, ys) {
  const S = (k) => ts.reduce((a, t) => a + t ** k, 0),
    T = (k) => ts.reduce((a, t, i) => a + ys[i] * t ** k, 0);
  const M = [
    [ts.length, S(1), S(2), T(0)],
    [S(1), S(2), S(3), T(1)],
    [S(2), S(3), S(4), T(2)],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const f = M[j][i] / M[i][i];
      for (let k = i; k < 4; k++) M[j][k] -= f * M[i][k];
    }
  }
  const c = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let j = i + 1; j < 3; j++) s -= M[i][j] * c[j];
    c[i] = s / M[i][i];
  }
  return c;
}

test("synthetic clip: g is recovered through calibration, clip and table", () => {
  const spec = defaultSpec(),
    n = frameCountOf(spec);
  const cal = createCalibration(spec.width, spec.height);
  const [a, b] = stickEnds(spec);
  cal.stick = { a, b };
  cal.length = spec.stickLength;
  cal.origin = ballPixel(spec, 0); // origin at the release point, y up
  const clip = createClip(n);
  const tr = createTrack(1);
  // simulate clicks with a pixel of Gaussian-free quantisation error
  for (const f of frameList(clip)) {
    const p = ballPixel(spec, f);
    setPoint(tr, f, [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]);
  }
  const table = buildTable({
    tracks: [tr],
    cal,
    clip,
    timeOf: (f) => f / spec.fps,
    columns: { n: true, t: true, x: true, y: true },
  });
  assert.equal(table.rows.length, n);
  const ts = table.rows.map((r) => r.values[1]),
    ys = table.rows.map((r) => r.values[3]);
  const g = -2 * parabola(ts, ys)[2];
  assert.ok(Math.abs(g - spec.g) < 0.05, `g = ${g}`);
  const xs = table.rows.map((r) => r.values[2]);
  assert.ok(Math.abs((xs[n - 1] - xs[0]) / ts[n - 1] - spec.vx) < 0.01);
});

test("the scale of the stick is exact", () => {
  const spec = defaultSpec();
  const cal = createCalibration();
  const [a, b] = stickEnds(spec);
  cal.stick = { a, b };
  cal.length = spec.stickLength;
  cal.origin = a;
  const w = pixelToWorld(cal, b);
  assert.ok(Math.abs(w[0] - spec.stickLength) < 1e-12 && Math.abs(w[1]) < 1e-12);
  assert.equal(timeOfFrame(createClip(5), (f) => f / 60, 3), 3 / 60);
});

// ---------- Phase 2: the analysis tools on the same clicks ----------
import { fit } from "../js/fit.js";
import { localSlope, trapezoid } from "../js/integrate.js";
import { plotSeries } from "../js/quantities.js";
import { unitDiv, unitMul } from "../js/units.js";

function clicked() {
  const spec = defaultSpec(),
    n = frameCountOf(spec);
  const cal = createCalibration(spec.width, spec.height);
  const [a, b] = stickEnds(spec);
  cal.stick = { a, b };
  cal.length = spec.stickLength;
  cal.origin = ballPixel(spec, 0);
  const clip = createClip(n),
    tr = createTrack(1);
  for (const f of frameList(clip)) {
    const p = ballPixel(spec, f);
    setPoint(tr, f, [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]); // clicks to a quarter pixel
  }
  const series = (xKey, yKey, smooth = 2) =>
    plotSeries({ tracks: [tr], cal, clip, timeOf: (f) => f / spec.fps, smooth, xKey, yKeys: [yKey] })[0].pts;
  return { spec, series };
}

test("fit: g from y(t) with a parabola, from v_y(t) with a line, and with a custom formula", () => {
  const { spec, series } = clicked();
  const y = series("t", "y"),
    vy = series("t", "vy");
  const p = fit({ type: "poly", degree: 2 }, y.map((q) => q.x), y.map((q) => q.y));
  assert.ok(Math.abs(-2 * p.params[2] - spec.g) < 0.1, `g = ${-2 * p.params[2]}`);
  assert.ok(p.r2 > 0.99999);
  const l = fit({ type: "linear" }, vy.map((q) => q.x), vy.map((q) => q.y));
  assert.ok(Math.abs(-l.params[0] - spec.g) < 0.1, `g = ${-l.params[0]}`);
  assert.ok(l.errors[0] > 0 && Math.abs(-l.params[0] - spec.g) < 5 * l.errors[0] + 0.01);
  const c = fit({ type: "custom", expr: "y0 - g*x^2/2" }, y.map((q) => q.x), y.map((q) => q.y));
  assert.ok(Math.abs(c.params[0] - spec.g) < 0.1, `g = ${c.params[0]}`); // names sort as g, y0
});

test("area under v_y(t) is the change of y; slope of v_y(t) is -g; units", () => {
  const { spec, series } = clicked();
  const vy = series("t", "vy", 6), // quarter-pixel clicks: smooth the velocity, and use a wide window
    y = series("t", "y");
  const xs = vy.map((q) => q.x),
    ys = vy.map((q) => q.y);
  const area = trapezoid(xs, ys);
  const dy = y.find((q) => q.frame === vy.at(-1).frame).y - y.find((q) => q.frame === vy[0].frame).y;
  assert.ok(Math.abs(area - dy) < 0.02, `${area} vs ${dy}`);
  const i = Math.floor(xs.length / 2);
  assert.ok(Math.abs(localSlope(xs, ys, i, 10).slope + spec.g) < 0.1);
  assert.equal(unitMul("m/s", "s"), "m");
  assert.equal(unitDiv("m/s", "s"), "m/s^2");
});
