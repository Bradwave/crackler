// Crackler: Tests for derive.js and quantities.js (finite differences, smoothing, series).
import test from "node:test";
import assert from "node:assert/strict";
import { createCalibration } from "../js/calibration.js";
import { derivatives, trackSeries } from "../js/derive.js";
import { ballPixel, defaultSpec, frameCountOf, stickEnds } from "../js/frames-synthetic.js";
import { ALL, label, plotSeries, unitOf } from "../js/quantities.js";
import { createTrack, setPoint } from "../js/tracks.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("k = 1 is the central difference on a uniform grid, one-sided at the ends", () => {
  const t = [0, 1, 2, 3, 4],
    x = [0, 1, 8, 27, 64]; // x = t³, not a parabola
  const d = derivatives(t, x, 1);
  near(d.v[1], (8 - 0) / 2);
  near(d.v[3], (64 - 8) / 2);
  near(d.v[0], 1); // forward
  near(d.v[4], 37); // backward
  assert.equal(d.a[0], null);
  assert.equal(d.a[4], null);
  near(d.a[2], 27 - 2 * 8 + 1); // second difference: 12
});

test("exact for a parabola at any window, also at the ends and with uneven times", () => {
  const t = [0, 0.1, 0.25, 0.3, 0.5, 0.55, 0.8, 1.0],
    g = 9.81;
  const x = t.map((s) => 3 + 2 * s - 0.5 * g * s * s);
  for (const k of [2, 3, 5]) {
    const d = derivatives(t, x, k);
    t.forEach((s, i) => {
      near(d.v[i], 2 - g * s, 1e-9);
      near(d.a[i], -g, 1e-8);
    });
  }
});

test("smoothing reduces the noise in the acceleration", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const t = Array.from({ length: 60 }, (_, i) => i / 60),
    x = t.map((s) => -0.5 * 9.81 * s * s + 0.004 * rnd());
  const rms = (a) => Math.sqrt(a.filter((v) => v != null).reduce((s, v) => s + (v + 9.81) ** 2, 0) / a.filter((v) => v != null).length);
  assert.ok(rms(derivatives(t, x, 6).a) < rms(derivatives(t, x, 1).a) / 4);
});

test("too few points give null, not NaN", () => {
  assert.deepEqual(derivatives([0], [1], 2), { v: [null], a: [null] });
  const d = derivatives([0, 1], [0, 2], 3);
  assert.deepEqual(d.v, [2, 2]);
  assert.deepEqual(d.a, [null, null]);
});

test("track series on the synthetic clip: ay = -g, vx = drift, kinetic energy", () => {
  const spec = defaultSpec(),
    n = frameCountOf(spec);
  const cal = createCalibration(spec.width, spec.height);
  const [a, b] = stickEnds(spec);
  cal.stick = { a, b };
  cal.length = spec.stickLength;
  cal.origin = ballPixel(spec, 0);
  const clip = { start: 0, end: n - 1, step: 1, fps: null, tOffset: 0, zero: 0 };
  const tr = createTrack(1, { mass: 2 });
  for (let f = 0; f < n; f++) setPoint(tr, f, ballPixel(spec, f));
  const s = trackSeries(tr, cal, clip, (f) => f / spec.fps, 2);
  for (let i = 0; i < n; i++) {
    near(s.ay[i], -spec.g, 1e-6);
    near(s.vx[i], spec.vx, 1e-6);
    near(s.ek[i], 0.5 * 2 * s.v[i] ** 2, 1e-9);
  }
  near(s.vy[n - 1], -spec.g * ((n - 1) / spec.fps), 1e-6);
});

test("quantity labels and units", () => {
  const cal = createCalibration();
  assert.equal(ALL.length, 15);
  assert.equal(label("Va"), "\\theta");
  assert.equal(label("vx"), "v_x");
  assert.equal(unitOf("ax", cal), "px/s^2");
  cal.stick = { a: [0, 0], b: [10, 0] };
  assert.equal(unitOf("v", cal), "m/s");
  assert.equal(unitOf("ek", cal), "J");
  cal.unit = "cm";
  assert.equal(unitOf("ek", cal), "kg·cm^2/s^2");
});

test("plot series: one per track and quantity, skipping missing values", () => {
  const cal = createCalibration();
  const clip = { start: 0, end: 5, step: 1, fps: null, tOffset: 0, zero: 0 };
  const a = createTrack(1),
    b = createTrack(2);
  for (let f = 0; f < 5; f++) setPoint(a, f, [f, f * f]);
  setPoint(b, 2, [1, 1]);
  const s = plotSeries({ tracks: [a, b], cal, clip, timeOf: (f) => f, smooth: 1, xKey: "t", yKeys: ["y", "ay"] });
  assert.equal(s.length, 4);
  assert.equal(s[0].pts.length, 5);
  assert.equal(s[1].pts.length, 3); // ay is missing at both ends
  assert.equal(s[2].pts.length, 1);
  assert.equal(s[3].pts.length, 0);
  assert.equal(s[0].pts[3].frame, 3);
});
