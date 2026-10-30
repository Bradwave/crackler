// Crackler: Tests for fit.js and integrate.js (fits, R², uncertainties, area, slope).
import test from "node:test";
import assert from "node:assert/strict";
import { equationText, evaluate, fit, modelOf } from "../js/fit.js";
import { localSlope, slope2, trapezoid } from "../js/integrate.js";
import { ballPixel, defaultSpec, frameCountOf } from "../js/frames-synthetic.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test("linear fit: exact data, parameters, R² = 1", () => {
  const xs = range(20, (i) => i * 0.1),
    ys = xs.map((x) => 3 * x - 2);
  const r = fit({ type: "linear" }, xs, ys);
  assert.ok(r.ok);
  near(r.params[0], 3);
  near(r.params[1], -2);
  near(r.r2, 1);
  near(r.f(10), 28);
  assert.deepEqual(r.names, ["m", "b"]);
});
test("linear fit with noise: R² below 1, error bars cover the truth", () => {
  const xs = range(200, (i) => i / 20),
    ys = xs.map((x) => 1.5 * x + 4 + 0.3 * rnd());
  const r = fit({ type: "linear" }, xs, ys);
  assert.ok(r.r2 > 0.99 && r.r2 < 1);
  assert.ok(Math.abs(r.params[0] - 1.5) < 4 * r.errors[0]);
  assert.ok(Math.abs(r.params[1] - 4) < 4 * r.errors[1]);
  assert.ok(r.errors[0] > 0 && r.errors[0] < 0.01);
});
test("polynomial fit: recovers a cubic, any size of x", () => {
  for (const scale of [1, 1000]) {
    const xs = range(40, (i) => (i / 10) * scale),
      c = [1, -2, 0.5, 0.1];
    const ys = xs.map((x) => c.reduce((s, k, j) => s + k * (x / scale) ** j, 0));
    const r = fit({ type: "poly", degree: 3 }, xs, ys);
    assert.ok(r.ok);
    c.forEach((k, j) => near(r.params[j] * scale ** j, k, 1e-7));
    near(r.r2, 1, 1e-12);
  }
});
test("free fall: g from the position parabola and from the slope of v(t)", () => {
  const spec = defaultSpec(),
    n = frameCountOf(spec);
  const ts = range(n, (i) => i / spec.fps);
  const y = range(n, (i) => -(ballPixel(spec, i)[1] - ballPixel(spec, 0)[1]) / spec.pxPerM);
  const p = fit({ type: "poly", degree: 2 }, ts, y);
  near(-2 * p.params[2], spec.g, 1e-8);
  const vy = ts.map((t) => -spec.g * t);
  const l = fit({ type: "linear" }, ts, vy);
  near(l.params[0], -spec.g, 1e-9);
});
test("exponential fit: decay with noise, and negative amplitude", () => {
  const xs = range(60, (i) => i * 0.1),
    ys = xs.map((x) => 5 * Math.exp(-0.7 * x) * (1 + 0.01 * rnd()));
  const r = fit({ type: "exp" }, xs, ys);
  assert.ok(r.ok && r.converged);
  near(r.params[0], 5, 0.1);
  near(r.params[1], -0.7, 0.02);
  assert.ok(r.r2 > 0.999);
  const neg = fit({ type: "exp" }, xs, ys.map((v) => -v));
  near(neg.params[0], -5, 0.1);
});
test("power law: recovers exponent, refuses non-positive data", () => {
  const xs = range(30, (i) => 1 + i * 0.5),
    ys = xs.map((x) => 2.5 * x ** 1.5);
  const r = fit({ type: "power" }, xs, ys);
  near(r.params[0], 2.5, 1e-6);
  near(r.params[1], 1.5, 1e-6);
  assert.equal(fit({ type: "power" }, [0, 1, 2], [1, 2, 3]).error, "positive");
});
test("custom formula: damped oscillation, starting from the given guess", () => {
  const xs = range(120, (i) => i * 0.05),
    f = (x) => 3 * Math.exp(-0.3 * x) * Math.cos(2 * x);
  const ys = xs.map(f);
  const spec = { type: "custom", expr: "A*exp(-k*x)*cos(w*x)" };
  assert.deepEqual(modelOf(spec).names, ["A", "k", "w"]);
  const r = fit(spec, xs, ys, [2.5, 0.2, 1.9]);
  assert.ok(r.ok);
  near(r.params[0], 3, 1e-5);
  near(r.params[1], 0.3, 1e-5);
  near(r.params[2], 2, 1e-5);
  assert.ok(r.r2 > 0.999999);
});
test("custom formula: bad formula and too few points are reported, not thrown", () => {
  assert.equal(fit({ type: "custom", expr: "a*(x" }, [1, 2, 3], [1, 2, 3]).error, "formula");
  assert.equal(fit({ type: "custom", expr: "a*x+b+c" }, [1, 2], [1, 2]).error, "points");
  assert.equal(fit({ type: "poly", degree: 2 }, [1, 1, 1], [1, 2, 3]).error, "singular");
  assert.equal(fit({ type: "custom", expr: "x+1" }, [1, 2, 3], [1, 2, 3]).error, "params");
});
test("manual evaluation: same R² definition, no fitting", () => {
  const xs = [0, 1, 2, 3],
    ys = [0, 2, 4, 6];
  const good = evaluate({ type: "linear" }, xs, ys, [2, 0]);
  near(good.r2, 1);
  const bad = evaluate({ type: "linear" }, xs, ys, [1, 0]);
  near(bad.r2, 1 - 14 / 20);
  near(bad.sse, 1 + 4 + 9);
  assert.equal(evaluate({ type: "custom", expr: "1/(x-1)*a" }, [1, 2], [1, 2], [1]).error, "diverged");
});
test("equation text", () => {
  assert.equal(equationText({ type: "linear" }, [-9.81, 0.0123], "t", "v_y"), "v_y = −9.81·t + 0.0123");
  assert.equal(equationText({ type: "poly" }, [1, -2, 0.5], "t", "y"), "y = 0.5·t^2 − 2·t + 1");
  assert.equal(equationText({ type: "exp" }, [5, -0.7], "t", "v"), "v = 5·e^{−0.7·t}");
  assert.equal(equationText({ type: "custom", expr: "a*x^2" }, [1], "t", "y"), "y = a*t^2");
});

test("trapezoid: exact for linear data, area of v(t) is the displacement", () => {
  near(trapezoid([0, 1, 2], [0, 2, 4]), 4);
  const spec = defaultSpec(),
    n = frameCountOf(spec);
  const ts = range(n, (i) => i / spec.fps),
    v = ts.map((t) => spec.g * t);
  const T = ts[n - 1];
  near(trapezoid(ts, v), 0.5 * spec.g * T * T, 1e-9); // linear integrand: exact
  near(trapezoid([0, 1, 3], [1, 1, 1]), 3);
  assert.equal(trapezoid([1], [1]), 0);
});
test("slope: two points and local tangent", () => {
  near(slope2({ x: 0, y: 1 }, { x: 2, y: 5 }), 2);
  assert.equal(slope2({ x: 1, y: 1 }, { x: 1, y: 5 }), null);
  const xs = range(11, (i) => i * 0.1),
    ys = xs.map((x) => x * x);
  const s = localSlope(xs, ys, 5, 2); // symmetric window: exact for a parabola
  near(s.slope, 2 * xs[5], 1e-12);
  near(s.at, xs[5] ** 2 + 2 * 0.01, 1e-12);
  assert.equal(s.n, 5);
  const edge = localSlope(xs, ys, 0, 2);
  assert.equal(edge.n, 3);
  assert.equal(localSlope([1], [1], 0, 2), null);
  assert.equal(localSlope([1, 1, 1], [1, 2, 3], 1, 2), null);
});
