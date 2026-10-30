// Crackler: Tests for plotmath.js, history.js and project.js.
import test from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../js/history.js";
import { extent, fmtTick, nearest, niceTicks } from "../js/plotmath.js";
import { cleanAnalysis, defaultAnalysis, packProject, parseProject, stringifyProject } from "../js/project.js";
import { createCalibration } from "../js/calibration.js";
import { createTrack, setPoint } from "../js/tracks.js";

test("niceTicks", () => {
  assert.deepEqual(niceTicks(0, 10, 5).ticks, [0, 2, 4, 6, 8, 10]);
  const t = niceTicks(-0.33, 0.87, 6);
  assert.ok(t.ticks[0] >= -0.33 && t.ticks.at(-1) <= 0.87 + 1e-9);
  assert.equal(t.step, 0.2);
  assert.deepEqual(niceTicks(3, 3).ticks, [3]);
});
test("extent: margin, constant and empty data", () => {
  const [lo, hi] = extent([0, 10]);
  assert.ok(lo < 0 && hi > 10);
  assert.deepEqual(extent([]), [0, 1]);
  const [a, b] = extent([5, 5, 5]);
  assert.ok(a < 5 && b > 5);
  assert.deepEqual(extent([NaN, 1, 3]).map((v) => Math.round(v)), [1, 3]);
});
test("fmtTick", () => {
  assert.equal(fmtTick(0.2, 0.1), "0.2");
  assert.equal(fmtTick(2, 1), "2");
  assert.equal(fmtTick(1e-12, 1), "0");
  assert.equal(fmtTick(1.5e7, 1e6), "1.5e+7");
});
test("nearest point", () => {
  const items = [{ sx: 0, sy: 0, f: 1 }, { sx: 10, sy: 0, f: 2 }];
  assert.equal(nearest(items, 8, 1, 5).f, 2);
  assert.equal(nearest(items, 50, 50, 5), null);
});

test("history: undo, redo, truncation, coalescing, limit", () => {
  const h = createHistory(3, 800);
  h.reset("a");
  assert.equal(h.canUndo, false);
  h.push("b", null, 0);
  h.push("c", null, 10);
  assert.equal(h.push("c", null, 20), false);
  assert.equal(h.undo(), "b");
  assert.equal(h.undo(), "a");
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), "b");
  h.push("x", null, 30); // drops the redo branch
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(), "b");
  h.redo();
  h.push("s1", "slider", 1000);
  h.push("s2", "slider", 1200);
  h.push("s3", "slider", 1300);
  assert.equal(h.undo(), "x"); // the three slider values are one step
  h.push("s9", "slider", 5000);
  h.push("s10", "slider", 6000); // too late to coalesce
  assert.equal(h.undo(), "s9");
  const lim = createHistory(3);
  lim.reset("0");
  for (const s of ["1", "2", "3", "4"]) lim.push(s);
  let n = 0;
  while (lim.undo()) n++;
  assert.equal(n, 2);
});

function sample() {
  const cal = createCalibration(100, 50);
  cal.stick = { a: [1, 2], b: [11, 2] };
  const t = createTrack(1, { name: "Ball", mass: 0.2 });
  setPoint(t, 3, [10, 20]);
  setPoint(t, 5, [12, 25]);
  return packProject({
    video: { name: "v.mp4", size: 10, duration: 2, frames: 60, fps: 30, width: 640, height: 360, extract: { start: 0, end: 2, maxWidth: 640, step: 1 } },
    clip: { start: 1, end: 50, step: 2, fps: null, tOffset: 0.1, zero: 3 },
    cal,
    tracks: [t],
    active: 0,
    settings: { smooth: 3, autoAdvance: false, showMarks: true, cols: { n: true, t: true, x: true, y: false } },
  });
}
test("project round trip", () => {
  const p = sample();
  const r = parseProject(stringifyProject(p));
  assert.ok(r.project);
  assert.deepEqual(r.project.tracks, p.tracks);
  assert.deepEqual(r.project.calibration, p.calibration);
  assert.deepEqual(r.project.clip, p.clip);
  assert.equal(r.project.settings.smooth, 3);
  assert.equal(r.project.settings.autoAdvance, false);
  assert.deepEqual(r.project.video.extract, p.video.extract);
});
test("project parsing rejects bad input and cleans odd values", () => {
  assert.equal(parseProject("not json").error, "json");
  assert.equal(parseProject('{"app":"other"}').error, "format");
  assert.equal(parseProject(JSON.stringify({ ...sample(), version: 99 })).error, "version");
  const bad = sample();
  bad.tracks[0].points = { 3: [1, 2], x: [1, 2], 4: ["a", 2], 5: [1, null] };
  bad.tracks[0].color = "red";
  bad.tracks[0].marker = "star";
  bad.tracks[0].mass = -5;
  bad.settings.smooth = 500;
  bad.calibration.stick = { a: [1, 2] };
  const r = parseProject(JSON.stringify(bad)).project;
  assert.deepEqual(Object.keys(r.tracks[0].points), ["3"]);
  assert.equal(r.tracks[0].marker, "circle");
  assert.match(r.tracks[0].color, /^#/);
  assert.equal(r.tracks[0].mass, 0);
  assert.equal(r.settings.smooth, 12);
  assert.equal(r.calibration.stick, null);
});

test("analysis settings: defaults, round trip and cleaning", () => {
  assert.deepEqual(cleanAnalysis(undefined), defaultAnalysis());
  const a = defaultAnalysis();
  a.mode = "fit";
  a.range = [0.1, 0.5];
  a.slopeFrame = 7;
  a.fit = { type: "custom", degree: 3, expr: "A*exp(-k*x)", manual: true, values: { A: 2, k: 0.5 } };
  assert.deepEqual(cleanAnalysis(JSON.parse(JSON.stringify(a))), a);
  const bad = cleanAnalysis({ mode: "evil", series: -3, k: 99, slopeFrame: -1, range: [5, 1], fit: { type: "x", degree: 99, expr: 5, values: { "a b": 1, ok: "no", good: 3 } } });
  assert.equal(bad.mode, "axes");
  assert.equal(bad.series, 0);
  assert.equal(bad.k, 6);
  assert.equal(bad.slopeFrame, null);
  assert.equal(bad.range, null);
  assert.equal(bad.fit.type, "linear");
  assert.equal(bad.fit.degree, 6);
  assert.deepEqual(bad.fit.values, { good: 3 });
  const p = parseProject(JSON.stringify({ ...sample(), settings: { analysis: a } }));
  assert.equal(p.project.settings.analysis.fit.expr, "A*exp(-k*x)");
});
