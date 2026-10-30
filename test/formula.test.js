// Crackler: Tests for formula.js, units.js and linalg.js.
import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../js/formula.js";
import { invert, solve } from "../js/linalg.js";
import { unitDiv, unitMul, unitPow, parseUnit, format } from "../js/units.js";

const ev = (src, scope = {}) => {
  const c = compile(src);
  assert.ok(c.ok, `${src}: ${JSON.stringify(c.error)}`);
  return c.fn(scope);
};
const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("formula: arithmetic, precedence and powers", () => {
  assert.equal(ev("1+2*3"), 7);
  assert.equal(ev("(1+2)*3"), 9);
  assert.equal(ev("2^3^2"), 512); // right associative
  assert.equal(ev("-2^2"), -4);
  assert.equal(ev("2^-1"), 0.5);
  assert.equal(ev("10/4/5"), 0.5);
  assert.equal(ev("1e3+2.5e-1"), 1000.25);
  assert.equal(ev("8 − 3"), 5); // typographic minus
});
test("formula: names, constants, functions, implicit multiplication", () => {
  assert.equal(ev("a*x^2+b", { a: 2, x: 3, b: 1 }), 19);
  near(ev("sin(pi/2)+ln(e)+log(1000)"), 1 + 1 + 3);
  assert.equal(ev("max(1,5,3)+min(4,2)"), 7);
  assert.equal(ev("atan2(1,1)*4"), Math.PI);
  assert.equal(ev("2x+3(x+1)", { x: 2 }), 13);
  assert.equal(ev("sqrt(abs(-16))"), 4);
});
test("formula: parameter detection", () => {
  const c = compile("A*exp(-k*x)+c0+pi");
  assert.deepEqual(c.names, ["A", "c0", "k", "x"]);
});
test("formula: errors carry a code and a position, nothing is evaluated", () => {
  const codes = (s) => compile(s).error && compile(s).error.code;
  assert.equal(codes(""), "empty");
  assert.equal(codes("   "), "empty");
  assert.equal(codes("1+"), "empty");
  assert.equal(codes("(1+2"), "unclosed");
  assert.equal(codes("1 2 )"), "unexpected");
  assert.equal(codes("foo(2)"), "unknownFunc");
  assert.equal(codes("sin(1,2)"), "args");
  assert.equal(codes("sin()"), "args");
  assert.equal(codes("1 $ 2"), "unexpected");
  assert.equal(compile("1+*2").error.pos, 2);
  // there is no way to reach globals or call code
  assert.equal(codes("constructor"), undefined); // just a parameter name
  assert.equal(codes("process.exit(1)"), "number");
  assert.equal(codes("a.b"), "number");
  assert.equal(codes("alert(1)"), "unknownFunc");
});

test("units: algebra and formatting", () => {
  assert.equal(unitDiv("m/s", "s"), "m/s^2");
  assert.equal(unitMul("m/s", "s"), "m");
  assert.equal(unitMul("kg", "m/s^2"), "kg·m/s^2");
  assert.equal(unitDiv("", "s"), "1/s");
  assert.equal(unitPow("s", 2), "s^2");
  assert.equal(unitDiv("m", "s^2"), "m/s^2");
  assert.equal(unitDiv("px/s", "s"), "px/s^2");
  assert.equal(unitMul("m", "m"), "m^2");
  assert.equal(unitDiv("m", "m"), "");
  assert.equal(unitDiv("J", "m·s"), "J/(m·s)");
  assert.deepEqual(parseUnit("kg·px^2/s^2"), { kg: 1, px: 2, s: -2 });
  assert.equal(format({}), "");
});

test("linalg: solve and invert", () => {
  const x = solve([[2, 1], [1, 3]], [3, 5]);
  near(x[0], 0.8);
  near(x[1], 1.4);
  assert.equal(invert([[1, 2], [2, 4]]), null);
  const inv = invert([[4, 7], [2, 6]]);
  near(inv[0][0], 0.6);
  near(inv[0][1], -0.7);
  assert.equal(solve([[0, 0], [0, 0]], [1, 1]), null);
});
