// Crackler: Tests for table.js, tracks.js and mathtext.js.
import test from "node:test";
import assert from "node:assert/strict";
import { createCalibration } from "../js/calibration.js";
import { parse, plain, toHTML, toSVG } from "../js/mathtext.js";
import { buildTable, toDelimited } from "../js/table.js";
import { createTrack, getPoint, markedFrames, pointCount, removePoint, setPoint } from "../js/tracks.js";

const clip = { start: 0, end: 5, step: 1, fps: null, tOffset: 0, zero: 0 };
const timeOf = (n) => n * 0.1;
const cols = { n: true, t: true, x: true, y: true };

test("track points", () => {
  const t = createTrack(2);
  assert.equal(t.name, "B");
  setPoint(t, 3, [1, 2]);
  setPoint(t, 1, [5, 6]);
  assert.deepEqual(markedFrames(t), [1, 3]);
  assert.deepEqual(getPoint(t, 3), [1, 2]);
  removePoint(t, 3);
  assert.equal(pointCount(t), 1);
  assert.equal(getPoint(t, 3), null);
});

test("table rows only for marked frames, world coordinates, units", () => {
  const cal = createCalibration();
  cal.origin = [0, 100];
  const t = createTrack(1);
  setPoint(t, 1, [10, 90]);
  setPoint(t, 4, [20, 70]);
  const tb = buildTable({ tracks: [t], cal, clip, timeOf, columns: cols });
  assert.deepEqual(tb.columns.map((c) => c.plain), ["n", "t (s)", "x (px)", "y (px)"]);
  assert.deepEqual(tb.rows.map((r) => r.frame), [1, 4]);
  assert.deepEqual(tb.rows[1].values.map((v) => +v.toFixed(9)), [4, 0.4, 20, 30]);
});

test("column selection and several tracks", () => {
  const cal = createCalibration();
  const a = createTrack(1),
    b = createTrack(2);
  setPoint(a, 0, [1, 1]);
  setPoint(b, 2, [2, 2]);
  const tb = buildTable({ tracks: [a, b], cal, clip, timeOf, columns: { n: false, t: true, x: true, y: false } });
  assert.deepEqual(tb.columns.map((c) => c.plain), ["t (s)", "x_A (px)", "x_B (px)"]);
  assert.equal(tb.rows.length, 2);
  assert.equal(tb.rows[0].values[2], null);
  b.visible = false;
  assert.equal(buildTable({ tracks: [a, b], cal, clip, timeOf, columns: cols }).rows.length, 1);
});

test("CSV and spreadsheet text, decimal comma", () => {
  const cal = createCalibration();
  cal.origin = [0, 0];
  const t = createTrack(1);
  setPoint(t, 1, [1.5, 0]);
  const tb = buildTable({ tracks: [t], cal, clip, timeOf, columns: cols });
  assert.equal(toDelimited(tb), "n,t (s),x (px),y (px)\n1,0.1,1.5,0\n");
  assert.equal(toDelimited(tb, { sep: "\t", decimal: "," }), "n\tt (s)\tx (px)\ty (px)\n1\t0,1\t1,5\t0\n");
});

test("mathtext parsing and renderers", () => {
  assert.deepEqual(parse("v_x"), [{ t: "v", m: "" }, { t: "x", m: "sub" }]);
  assert.deepEqual(parse("a_{xy}^2"), [{ t: "a", m: "" }, { t: "xy", m: "sub" }, { t: "2", m: "sup" }]);
  assert.equal(toHTML("m/s^2"), "m/s<sup>2</sup>");
  assert.equal(toHTML("\\theta_0 < 1"), "θ<sub>0</sub> &lt; 1");
  assert.equal(plain("\\omega_{max}"), "ω_max");
  assert.equal(plain("a_y"), "a_y");
  assert.match(toSVG("v_x"), /^v<tspan baseline-shift="sub"[^>]*>x<\/tspan>$/);
  assert.equal(toHTML("x_\\alpha"), "x<sub>α</sub>");
});
