// Crackler: Tests for model.js (analytic formulas, Euler and RK4 simulation, presets).
import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, compileModel, defaultModel, evalAnalytic, simulate } from "../js/model.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const g = 9.81;
const dyn = (fx, fy, extra = {}, params = [{ name: "g", value: g }]) => {
  const c = compileModel("dynamic", { ...defaultModel("dynamic"), fx, fy }, params.map((p) => p.name));
  assert.ok(c.ok, JSON.stringify(c.errors));
  return { fns: c.fns, mass: 1, params, x0: 0, y0: 0, vx0: 0, vy0: 0, t0: 0, method: "rk4", dt: 0.001, ...extra };
};
const range = (n, dt) => Array.from({ length: n }, (_, i) => i * dt);

test("analytic particle: positions, exact velocities and accelerations", () => {
  const c = compileModel("analytic", { x: "x0 + 2*t", y: "-0.5*g*t^2" }, ["x0", "g"]);
  assert.ok(c.ok);
  const times = [0, 0.25, 1, 2];
  const r = evalAnalytic(c.fns, times, [{ name: "x0", value: 3 }, { name: "g", value: g }]);
  times.forEach((t, i) => {
    near(r.x[i], 3 + 2 * t);
    near(r.y[i], -0.5 * g * t * t);
    near(r.vx[i], 2, 1e-8);
    near(r.vy[i], -g * t, 1e-7);
    near(r.ax[i], 0, 1e-5);
    near(r.ay[i], -g, 1e-4);
  });
});
test("compiling: empty means zero, unknown names and syntax errors are reported per field", () => {
  const a = compileModel("analytic", { x: "", y: "t" }, []);
  assert.ok(a.ok);
  assert.equal(a.fns.x({}), 0);
  const b = compileModel("analytic", { x: "t + foo", y: "2*(t" }, []);
  assert.equal(b.ok, false);
  assert.equal(b.errors.x.code, "unknownName");
  assert.equal(b.errors.x.detail, "foo");
  assert.equal(b.errors.y.code, "unclosed");
  // dynamic formulas see t x y vx vy m and the parameters, but not vx0 etc.
  assert.ok(compileModel("dynamic", { fx: "-k*x - b*vx + t*m", fy: "0", dt: 0.01 }, ["k", "b"]).ok);
  assert.equal(compileModel("dynamic", { fx: "x0", fy: "0", dt: 0.01 }, []).errors.fx.code, "unknownName");
  assert.equal(compileModel("dynamic", { fx: "0", fy: "0", dt: 0 }, []).errors.dt.code, "step");
});
test("free fall: RK4 reproduces the exact solution, in both directions of time", () => {
  const times = [0, 0.1, 0.5, 1.2, 2];
  const r = simulate(dyn("0", "-m*g", { vx0: 1.5, vy0: 4, times, dt: 0.01 }));
  times.forEach((t, i) => {
    near(r.x[i], 1.5 * t, 1e-9);
    near(r.y[i], 4 * t - 0.5 * g * t * t, 1e-9);
    near(r.vy[i], 4 - g * t, 1e-9);
    near(r.ay[i], -g, 1e-9);
  });
  // start in the middle (t0 = 1 with the exact state) and ask for earlier times too
  const t0 = 1,
    s0 = { y0: 4 * t0 - 0.5 * g * t0 * t0, vy0: 4 - g * t0, x0: 1.5 * t0 };
  const back = simulate(dyn("0", "-m*g", { ...s0, vx0: 1.5, t0, times: [0, 0.5, 1, 1.5], dt: 0.01 }));
  near(back.y[0], 0, 1e-9);
  near(back.x[0], 0, 1e-9);
  near(back.vy[1], 4 - g * 0.5, 1e-9);
  near(back.y[3], 4 * 1.5 - 0.5 * g * 2.25, 1e-9);
});
test("harmonic oscillator: RK4 error falls like h⁴, Euler like h and it gains energy", () => {
  const w = 3,
    times = [2.5];
  const exact = Math.cos(w * times[0]);
  const err = (method, dt) => {
    const r = simulate(dyn("-k*x", "0", { x0: 1, method, dt, times }, [{ name: "k", value: w * w }]));
    return Math.abs(r.x[0] - exact);
  };
  const e1 = err("rk4", 0.02),
    e2 = err("rk4", 0.01);
  assert.ok(e1 / e2 > 12 && e1 / e2 < 20, `ratio ${e1 / e2}`); // about 16
  const u1 = err("euler", 0.002),
    u2 = err("euler", 0.001);
  assert.ok(u1 / u2 > 1.7 && u1 / u2 < 2.3, `ratio ${u1 / u2}`); // about 2
  assert.ok(e2 < 1e-6 && u2 > 1e-3);
  // energy after many periods: Euler grows, RK4 stays
  const long = [20];
  const energy = (r) => 0.5 * r.vx[0] ** 2 + 0.5 * w * w * r.x[0] ** 2;
  const Ee = energy(simulate(dyn("-k*x", "0", { x0: 1, method: "euler", dt: 0.002, times: long }, [{ name: "k", value: w * w }])));
  const Er = energy(simulate(dyn("-k*x", "0", { x0: 1, method: "rk4", dt: 0.002, times: long }, [{ name: "k", value: w * w }])));
  assert.ok(Ee > 0.5 * w * w * 1.05, `Euler energy ${Ee}`);
  near(Er, 0.5 * w * w, 1e-6);
});
test("drag: velocity tends to the terminal value m g / b; mass divides the force", () => {
  const params = [{ name: "g", value: g }, { name: "b", value: 2 }];
  const r = simulate(dyn("0", "-m*g - b*vy", { mass: 3, dt: 0.005, times: [30], method: "rk4" }, params));
  near(r.vy[0], -(3 * g) / 2, 1e-6);
  near(r.ay[0], 0, 1e-5);
  // a user parameter called m takes the place of the mass in formulas
  const r2 = simulate(dyn("0", "-m*g", { mass: 5, dt: 0.01, times: [1] }, [{ name: "m", value: 1 }, { name: "g", value: g }]));
  near(r2.ay[0], -g / 5, 1e-9);
});
test("diverging models give nulls after the blow-up, bad mass gives all nulls", () => {
  const blow = simulate(dyn("x*x*x*x", "0", { x0: 5, dt: 0.01, times: [0, 0.1, 5, 6] }, []));
  assert.notEqual(blow.x[0], null);
  assert.equal(blow.x[3], null);
  const none = simulate(dyn("0", "0", { mass: 0, times: [0, 1] }));
  assert.deepEqual(none.x, [null, null]);
});
test("the presets compile with their parameters", () => {
  for (const p of Object.values(PRESETS)) {
    const c = compileModel("dynamic", { ...defaultModel("dynamic"), fx: p.fx, fy: p.fy }, p.params.map((q) => q.name));
    assert.ok(c.ok, JSON.stringify(c.errors));
  }
});

// ---------- model tracks in the series pipeline, table and project ----------
import { createCalibration } from "../js/calibration.js";
import { trackSeries } from "../js/derive.js";
import { cleanOverlay, defaultOverlay, parseProject, stringifyProject, packProject } from "../js/project.js";
import { buildTable } from "../js/table.js";
import { createTrack, modelErrors } from "../js/tracks.js";

const clip = (n) => ({ start: 0, end: n - 1, step: 1, fps: null, tOffset: 0, zero: 0 });
test("analytic and dynamic tracks give the same series for the same physics", () => {
  const cal = createCalibration(640, 360);
  const params = [{ name: "g", value: g }];
  const an = createTrack(1, { kind: "analytic", mass: 2 });
  an.model = { x: "1.5*t", y: "4*t - 0.5*g*t^2" };
  const dy = createTrack(2, { kind: "dynamic", mass: 2 });
  dy.model = { ...defaultModel("dynamic"), fx: "0", fy: "-m*g", vx0: 1.5, vy0: 4, dt: 0.002 };
  const T = (f) => f / 30;
  const a = trackSeries(an, cal, clip(31), T, 1, [an, dy], params);
  const d = trackSeries(dy, cal, clip(31), T, 1, [an, dy], params);
  assert.equal(a.n.length, 31);
  for (let i = 0; i < 31; i++) {
    near(a.x[i], d.x[i], 1e-8);
    near(a.y[i], d.y[i], 1e-8);
    near(a.vy[i], d.vy[i], 1e-6);
    near(a.ay[i], -g, 1e-3);
    near(d.ay[i], -g, 1e-9);
  }
  near(a.ek[30], 0.5 * 2 * (1.5 ** 2 + (4 - g) ** 2), 1e-6); // mass of the track, speed at t = 1
  // with a broken formula the track has no points instead of crashing
  an.model.y = "2*(t";
  assert.equal(trackSeries(an, cal, clip(5), T, 1, [an], params).n.length, 0);
  assert.equal(modelErrors(an, params).y.code, "unclosed");
});
test("model tracks appear in the table and use the clip's time offset", () => {
  const cal = createCalibration(640, 360);
  const an = createTrack(1, { kind: "analytic", name: "M" });
  an.model = { x: "t", y: "0" };
  const c = { ...clip(4), tOffset: 10, zero: 0 };
  const tb = buildTable({ tracks: [an], cal, clip: c, timeOf: (f) => f, columns: { n: true, t: true, x: true, vx: true }, smooth: 1 });
  assert.deepEqual(tb.rows.map((r) => r.values[2]), [10, 11, 12, 13]); // x = t, t starts at the offset
  near(tb.rows[1].values[3], 1, 1e-6);
});
test("project keeps models and overlay settings, and cleans bad ones", () => {
  const dy = createTrack(3, { kind: "dynamic" });
  dy.model = { ...defaultModel("dynamic"), fy: "-m*g", method: "euler", dt: 0.01, vy0: 2 };
  const an = createTrack(4, { kind: "analytic" });
  an.model = { x: "t", y: "t^2" };
  const ov = { ...defaultOverlay(), v: true, a: true, sv: 2.5, trailLen: 30 };
  const text = stringifyProject(packProject({ video: {}, clip: clip(5), cal: createCalibration(), tracks: [dy, an], active: 0, settings: { overlay: ov } }));
  const r = parseProject(text).project;
  assert.deepEqual(r.tracks[0].model, dy.model);
  assert.deepEqual(r.tracks[1].model, an.model);
  assert.deepEqual(r.settings.overlay, ov);
  const bad = JSON.parse(text);
  bad.tracks[0].model = { fx: 5, dt: -1, method: "magic", vy0: "x" };
  bad.settings.overlay = { v: "yes", sv: 999, trailLen: -5 };
  const c = parseProject(JSON.stringify(bad)).project;
  assert.equal(c.tracks[0].model.method, "rk4");
  assert.equal(c.tracks[0].model.dt, 0.001);
  assert.equal(c.tracks[0].model.vy0, 0);
  assert.equal(c.tracks[0].model.fx, "");
  assert.equal(c.settings.overlay.v, false);
  assert.equal(c.settings.overlay.sv, 8);
  assert.equal(c.settings.overlay.trailLen, 0);
  assert.deepEqual(cleanOverlay(null), defaultOverlay());
});
