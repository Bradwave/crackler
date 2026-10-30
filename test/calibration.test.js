// Crackler: Tests for calibration.js (scale, origin, rotation, y inversion).
import test from "node:test";
import assert from "node:assert/strict";
import {
  angleToward,
  createCalibration,
  pixelToWorld,
  scale,
  stickAngle,
  unitLabel,
  worldToPixel,
} from "../js/calibration.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const nearP = (p, q, eps) => {
  near(p[0], q[0], eps);
  near(p[1], q[1], eps);
};

test("without a stick the unit is the pixel", () => {
  const c = createCalibration(100, 80);
  assert.equal(scale(c), 1);
  assert.equal(unitLabel(c), "px");
  nearP(pixelToWorld(c, [50, 40]), [0, 0]);
});

test("scale from a stick and y pointing up", () => {
  const c = createCalibration(100, 100);
  c.stick = { a: [10, 90], b: [110, 90] };
  c.length = 2;
  c.origin = [10, 90];
  near(scale(c), 0.02);
  nearP(pixelToWorld(c, [60, 90]), [1, 0]);
  nearP(pixelToWorld(c, [10, 40]), [0, 1]); // 50 px up
});

test("invertY flips the vertical axis", () => {
  const c = createCalibration(100, 100);
  c.origin = [0, 0];
  c.invertY = true;
  nearP(pixelToWorld(c, [0, 10]), [0, 10]);
});

test("rotated axes: x along a 30° incline", () => {
  const c = createCalibration(100, 100);
  c.origin = [0, 100];
  c.angle = Math.PI / 6;
  const p = [Math.cos(Math.PI / 6) * 50, 100 - Math.sin(Math.PI / 6) * 50]; // 50 px up the slope
  nearP(pixelToWorld(c, p), [50, 0], 1e-9);
});

test("round trip for random settings", () => {
  const c = createCalibration(640, 360);
  c.stick = { a: [3, 7], b: [203, 107] };
  c.length = 0.5;
  for (const [angle, inv] of [[0, false], [0.7, false], [-2.1, true], [3, true]]) {
    c.angle = angle;
    c.invertY = inv;
    c.origin = [123.4, 56.7];
    for (const p of [[0, 0], [640, 360], [333.3, 12.5]]) nearP(worldToPixel(c, pixelToWorld(c, p)), p, 1e-9);
  }
});

test("stickAngle and angleToward are consistent with the axes", () => {
  const c = createCalibration(100, 100);
  c.stick = { a: [0, 100], b: [50, 50] }; // 45° up to the right
  near(stickAngle(c), Math.PI / 4);
  c.origin = [0, 100];
  near(angleToward(c, [50, 50]), Math.PI / 4);
  c.angle = stickAngle(c);
  nearP(pixelToWorld(c, [50, 50]), [Math.hypot(50, 50) * scale(c), 0], 1e-9);
});
