// Crackler: Tests for the Phase 3 pipeline: perspective, lens and camera in the mapper, track kinds,
// custom columns, vector columns.
import test from "node:test";
import assert from "node:assert/strict";
import { createCalibration, makeMapper, scale, unitLabel, axes, angleToward } from "../js/calibration.js";
import { addCustom, nameProblem } from "../js/custom.js";
import { trackSeries } from "../js/derive.js";
import { apply, fromPoints } from "../js/homography.js";
import { distort, lensFor, straightGuide } from "../js/lens.js";
import { evalMeasure } from "../js/measures.js";
import { buildTable } from "../js/table.js";
import { createTrack, interpPoint, setPoint, worldPoints } from "../js/tracks.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const nearP = (p, q, eps = 1e-9) => (near(p[0], q[0], eps), near(p[1], q[1], eps));
const clip = (n) => ({ start: 0, end: n - 1, step: 1, fps: null, tOffset: 0, zero: 0 });
const cols = (o) => ({ n: true, t: true, x: true, y: true, ...o });

// A 2 m × 1 m rectangle on the floor seen at an angle: corners bottom-left, bottom-right, top-right, top-left.
const QUAD = [[120, 330], [520, 320], [470, 150], [170, 160]];
function perspCal() {
  const c = createCalibration(640, 360);
  c.persp = { pts: QUAD, w: 2, h: 1 };
  c.origin = QUAD[0];
  return c;
}

test("perspective: the rectangle corners get metric coordinates, with units and scale", () => {
  const c = perspCal(),
    m = makeMapper(c);
  nearP(m.map(QUAD[0]), [0, 0], 1e-9);
  nearP(m.map(QUAD[1]), [2, 0], 1e-9);
  nearP(m.map(QUAD[2]), [2, 1], 1e-9);
  nearP(m.map(QUAD[3]), [0, 1], 1e-9);
  assert.equal(unitLabel(c), "m");
  assert.equal(m.perspective, true);
  // the centre of the quadrilateral's diagonals is not the centre of the rectangle: perspective matters
  const H = fromPoints(QUAD, [[0, 0], [2, 0], [2, 1], [0, 1]]);
  const mid = [(QUAD[0][0] + QUAD[2][0]) / 2, (QUAD[0][1] + QUAD[2][1]) / 2];
  nearP(m.map(mid), apply(H, mid), 1e-9);
  assert.ok(Math.abs(m.map(mid)[0] - 1) > 0.01);
  // map and unmap are inverses
  for (const p of [[300, 250], [200, 180], [500, 300]]) nearP(m.unmap(m.map(p)), p, 1e-7);
  // the axes of the world follow the rectangle's sides
  const a = axes(c);
  assert.ok(a.ex[0] > 0.9); // x runs along the bottom edge, to the right
  assert.ok(a.ey[1] < -0.9); // y runs up the image
  assert.ok(scale(c) > 0);
});
test("perspective: rotating the axes and moving the origin work in the metric plane", () => {
  const c = perspCal();
  c.origin = QUAD[1];
  c.angle = Math.PI / 2; // x now runs up the rectangle's right side
  const m = makeMapper(c);
  nearP(m.map(QUAD[1]), [0, 0], 1e-9);
  nearP(m.map(QUAD[2]), [1, 0], 1e-9);
  nearP(m.map(QUAD[0]), [0, 2], 1e-9); // y runs to the left of the upward x axis
  assert.ok(Math.abs(angleToward(c, QUAD[2]) - Math.PI / 2) < 1e-9);
  c.invertY = true;
  nearP(makeMapper(c).map(QUAD[0]), [0, -2], 1e-9);
  // an invalid rectangle falls back to the plain scale
  c.persp = { pts: [[0, 0], [1, 1], [2, 2], [3, 3]], w: 2, h: 1 };
  assert.equal(makeMapper(c).perspective, false);
});
test("lens: positions are undistorted before scaling; the stick is straightened too", () => {
  const truth = lensFor(-0.15, 0, 640, 360);
  const c = createCalibration(640, 360);
  const ideal = [[100, 60], [540, 60], [320, 300], [60, 330]];
  const seen = ideal.map((p) => distort(truth, p));
  c.stick = { a: seen[0], b: seen[1] }; // a horizontal 4.4 m beam, 440 px in an ideal image
  c.length = 4.4;
  c.origin = seen[0];
  c.lens = { k1: -0.15, k2: 0, lines: [] };
  const m = makeMapper(c);
  nearP(m.map(seen[1]), [4.4, 0], 1e-6);
  nearP(m.map(seen[3]), [(60 - 100) * 0.01, -(330 - 60) * 0.01], 1e-6);
  // without the lens correction the same clicks give a different answer
  c.lens = { k1: 0, k2: 0, lines: [] };
  assert.ok(Math.abs(makeMapper(c).map(seen[3])[1] - -2.7) > 0.01);
});
test("camera motion: a drifting camera is corrected using a reference mark", () => {
  const c = createCalibration(640, 360);
  c.stick = { a: [0, 0], b: [100, 0] };
  c.length = 1; // 1 px = 0.01 m
  c.origin = [0, 0];
  const ref = createTrack(1);
  for (let f = 0; f < 5; f++) setPoint(ref, f, [200 + 3 * f, 100 - 2 * f]); // the fixed post seems to move
  const obj = createTrack(2);
  for (let f = 0; f < 5; f++) setPoint(obj, f, [50 + 10 * f + 3 * f, 40 - 2 * f]); // really moves 10 px/frame in x
  c.camera = { a: 1, b: null, base: 0 };
  const m = makeMapper(c, [ref, obj]);
  for (let f = 0; f < 5; f++) nearP(m.map(obj.points[f], f), [(50 + 10 * f) * 0.01, -40 * 0.01], 1e-9);
  // the reference itself reads as not moving, frames without marks use the nearest ones
  nearP(m.map(ref.points[4], 4), [200 * 0.01, -100 * 0.01], 1e-9);
  assert.deepEqual(interpPoint({ 0: [0, 0], 4: [4, 8] }, 2), [2, 4]);
  assert.deepEqual(interpPoint({ 1: [5, 5] }, 9), [5, 5]);
  assert.equal(interpPoint({}, 1), null);
  // the drawing helpers agree with the mapping
  nearP(m.toBaseFrame(m.toFrame([77, 33], 3), 3), [77, 33], 1e-9);
});
test("centre of mass: weighted by mass, defined only where all members are marked", () => {
  const cal = createCalibration();
  cal.origin = [0, 0];
  const a = createTrack(1, { mass: 1 }),
    b = createTrack(2, { mass: 3 });
  setPoint(a, 0, [0, 0]);
  setPoint(b, 0, [4, 0]);
  setPoint(a, 1, [1, 0]);
  const cm = createTrack(3, { kind: "cm", members: [1, 2] });
  const byId = new Map([a, b, cm].map((t) => [t.id, t]));
  const w = worldPoints(cm, (p) => [p[0], -p[1]], byId, [0, 1, 2]);
  assert.equal(w.length, 1);
  nearP([w[0].x, w[0].y], [3, 0]);
  setPoint(b, 1, [5, 0]);
  const s = trackSeries(cm, cal, clip(3), (f) => f, 1, [a, b, cm]);
  assert.deepEqual(s.n, [0, 1]);
  near(s.x[1], (1 * 1 + 3 * 5) / 4);
  near(s.vx[0], s.x[1] - s.x[0]); // two points: forward difference
  // kinetic energy uses the total mass
  near(s.ek[0], 0.5 * 4 * s.v[0] ** 2);
});
test("vectors: head per frame, tail marked or attached; components, length, angle; sum", () => {
  const cal = createCalibration();
  cal.origin = [0, 0];
  const bob = createTrack(1);
  setPoint(bob, 0, [10, -10]);
  setPoint(bob, 1, [20, -10]);
  const f1 = createTrack(2, { kind: "vector", tail: 1 }), // force attached to the bob
    f2 = createTrack(3, { kind: "vector" }); // free vector with its own tail
  f1.heads[0] = [10, -40]; // 30 px up (y up in world)
  f1.heads[1] = [50, -10]; // 30 px right
  setPoint(f2, 0, [0, 0]);
  f2.heads[0] = [40, 0];
  const sum = createTrack(4, { kind: "vsum", members: [2, 3] });
  const tracks = [bob, f1, f2, sum];
  const s1 = trackSeries(f1, cal, clip(2), (f) => f, 1, tracks);
  assert.deepEqual(s1.n, [0, 1]);
  nearP([s1.Vx[0], s1.Vy[0]], [0, 30]);
  near(s1.Va[0], 90);
  near(s1.V[1], 30);
  near(s1.Va[1], 0);
  nearP([s1.x[1], s1.y[1]], [20, 10]); // tail follows the bob
  assert.equal(s1.vx.every((v) => v === null), true); // no velocity for arrows
  const ss = trackSeries(sum, cal, clip(2), (f) => f, 1, tracks);
  assert.deepEqual(ss.n, [0]); // only frame 0 has both members
  nearP([ss.Vx[0], ss.Vy[0]], [40, 30]);
  near(ss.V[0], 50);
  nearP([ss.x[0], ss.y[0]], [10, 10]); // drawn from the tail of the first member
});
test("table: vector and custom columns, units and tracks that do not apply are skipped", () => {
  const cal = createCalibration();
  cal.origin = [0, 0];
  const p = createTrack(1, { name: "A", mass: 2 }),
    v = createTrack(2, { kind: "vector", name: "F", tail: 1 });
  for (let f = 0; f < 4; f++) setPoint(p, f, [f * 2, 0]);
  v.heads[1] = [2, -5];
  const custom = {
    defs: [{ id: 1, name: "E_c", expr: "0.5*m*v^2", unit: "J" }, { id: 2, name: "xx", expr: "x_A*2", unit: "" }],
    params: [{ name: "m", value: 2, unit: "kg" }],
  };
  const tb = buildTable({
    tracks: [p, v],
    cal,
    clip: clip(4),
    timeOf: (f) => f,
    columns: cols({ vx: true, Vy: true, "c:1": true }),
    custom,
  });
  const names = tb.columns.map((c) => c.plain);
  assert.ok(names.includes("v_x_A (px/s)") || names.some((n) => n.startsWith("v_{x,A}") || n.includes("v_x")));
  assert.ok(names.some((n) => n.startsWith("V_y")));
  assert.ok(names.some((n) => n.startsWith("E_c")));
  const iE = tb.columns.findIndex((c) => c.key === "c:1" && c.track === 1);
  const row = tb.rows.find((r) => r.frame === 1);
  near(row.values[iE], 0.5 * 2 * 2 ** 2); // v = 2 px per unit time
  const iV = tb.columns.findIndex((c) => c.key === "Vy");
  near(row.values[iV], 5);
  assert.equal(tb.rows.find((r) => r.frame === 0).values[iV], null);
});
test("custom columns: params, other tracks, earlier columns, errors", () => {
  const cal = createCalibration();
  cal.origin = [0, 0];
  const a = createTrack(1, { name: "A" }),
    b = createTrack(2, { name: "B" });
  for (let f = 0; f < 3; f++) {
    setPoint(a, f, [f, 0]);
    setPoint(b, f, [10 * f, 0]);
  }
  const list = [a, b].map((track) => ({ track, s: trackSeries(track, cal, clip(3), (f) => f, 1, [a, b]) }));
  const defs = [
    { id: 1, name: "d", expr: "x_B - x_A", unit: "" },
    { id: 2, name: "e2", expr: "d*k + 1", unit: "" },
    { id: 3, name: "bad", expr: "foo + 1", unit: "" },
    { id: 4, name: "worse", expr: "2*(x", unit: "" },
  ];
  const { errors } = addCustom(list, defs, [{ name: "k", value: 3 }]);
  assert.deepEqual(list[0].s["c:1"], [0, 9, 18]);
  assert.deepEqual(list[0].s["c:2"], [1, 28, 55]);
  assert.equal(errors[3].code, "unknownName");
  assert.equal(errors[3].detail, "foo");
  assert.equal(errors[4].code, "unclosed");
  assert.ok(list[0].s["c:3"].every((v) => v === null));
  assert.equal(nameProblem("g", ["k"]), null);
  assert.equal(nameProblem("vx", []), "reserved");
  assert.equal(nameProblem("pi", []), "reserved");
  assert.equal(nameProblem("2x", []), "syntax");
  assert.equal(nameProblem("k", ["k"]), "taken");
});

test("measuring tools: tape, protractor, circle fit in world units", () => {
  const cal = createCalibration(640, 360);
  cal.stick = { a: [0, 0], b: [100, 0] };
  cal.length = 1; // 0.01 m per pixel
  cal.origin = [0, 0];
  const m = makeMapper(cal);
  const c = clip(40);
  const tape = evalMeasure({ kind: "tape", pts: [[10, 10], [310, 410]] }, m, [], c);
  near(tape.length, 5, 1e-9);
  const pro = evalMeasure({ kind: "protractor", pts: [[100, 100], [200, 100], [100, 0]] }, m, [], c);
  near(pro.degrees, 90, 1e-9);
  const tr = createTrack(1);
  for (let f = 0; f < 40; f++) setPoint(tr, f, [320 + 100 * Math.cos(f / 6), 180 + 100 * Math.sin(f / 6)]);
  const circ = evalMeasure({ kind: "circle", source: 1, from: null, to: null }, m, [tr], c);
  near(circ.r, 1, 1e-7);
  near(circ.cx, 3.2, 1e-7);
  near(circ.cy, -1.8, 1e-7);
  assert.equal(circ.n, 40);
  assert.equal(evalMeasure({ kind: "circle", source: 9 }, m, [tr], c), null);
  const part = evalMeasure({ kind: "circle", source: 1, from: 0, to: 9 }, m, [tr], c);
  assert.equal(part.n, 10);
});
test("lens guide: the straight line bent back through the lens passes near the clicked points", () => {
  const truth = lensFor(-0.2, 0, 640, 360);
  const line = Array.from({ length: 9 }, (_, i) => distort(truth, [40 + i * 70, 40 + i * 5]));
  const g = straightGuide(line, truth);
  assert.equal(g.length, 24);
  for (const p of line) {
    const d = Math.min(...g.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
    assert.ok(d < 20, `distance ${d}`);
  }
  assert.equal(straightGuide([[0, 0]], truth), null);
});
