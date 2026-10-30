// Crackler: Tests for clip.js and timing.js.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createClip,
  frameList,
  gridIndex,
  normalizeClip,
  snapFrame,
  stepFrame,
  timeOfFrame,
} from "../js/clip.js";
import { analyzeTimes, createStrider, estimate, maxFramesForBudget, scaledSize, warningsOf } from "../js/timing.js";

test("clip defaults and normalisation", () => {
  const c = createClip(100);
  assert.deepEqual([c.start, c.end, c.step], [0, 99, 1]);
  Object.assign(c, { start: -5, end: 500, step: 0, zero: 1000, fps: -3 });
  normalizeClip(c, 100);
  assert.deepEqual([c.start, c.end, c.step, c.zero, c.fps], [0, 99, 1, 99, null]);
  Object.assign(c, { start: 40, end: 10 });
  normalizeClip(c, 100);
  assert.equal(c.end, 40);
});

test("frame list, grid index, snapping and stepping", () => {
  const c = { start: 10, end: 30, step: 5, fps: null, tOffset: 0, zero: 10 };
  assert.deepEqual(frameList(c), [10, 15, 20, 25, 30]);
  assert.equal(gridIndex(c, 20), 2);
  assert.equal(gridIndex(c, 21), -1);
  assert.equal(snapFrame(c, 22), 20);
  assert.equal(snapFrame(c, 23), 25);
  assert.equal(snapFrame(c, 99), 30);
  assert.equal(stepFrame(c, 20, 1), 25);
  assert.equal(stepFrame(c, 30, 1), 30);
  assert.equal(stepFrame(c, 10, -1), 10);
});

test("time of a frame: t = 0 at any frame, offset, rate override", () => {
  const times = [0, 0.04, 0.09, 0.12, 0.2];
  const c = { start: 0, end: 4, step: 1, fps: null, tOffset: 0, zero: 2 };
  assert.ok(Math.abs(timeOfFrame(c, (n) => times[n], 2)) < 1e-12);
  assert.ok(Math.abs(timeOfFrame(c, (n) => times[n], 4) - 0.11) < 1e-12);
  c.tOffset = 1;
  assert.ok(Math.abs(timeOfFrame(c, (n) => times[n], 0) - 0.91) < 1e-12);
  c.fps = 25;
  c.tOffset = 0;
  assert.ok(Math.abs(timeOfFrame(c, (n) => times[n], 4) - 0.08) < 1e-12);
});

test("memory estimate", () => {
  assert.deepEqual(scaledSize(1920, 1080, 640), { width: 640, height: 360 });
  assert.deepEqual(scaledSize(320, 240, 640), { width: 320, height: 240 });
  const e = estimate({ vw: 1920, vh: 1080, fps: 30, start: 0, end: 10, maxWidth: 640, step: 1, budget: 400e6 });
  assert.equal(e.frames, 300);
  assert.equal(e.bytes, 300 * 640 * 360 * 4);
  assert.equal(e.over, false);
  assert.equal(estimate({ vw: 1920, vh: 1080, fps: 30, start: 0, end: 20, maxWidth: 960, step: 1, budget: 400e6 }).over, true);
  assert.equal(estimate({ vw: 640, vh: 360, fps: 60, start: 0, end: 1, maxWidth: 640, step: 2, budget: 0 }).frames, 30);
  assert.equal(maxFramesForBudget(400e6, 640, 360), 434);
});

test("analyzeTimes finds duplicated and dropped frames", () => {
  const clean = Array.from({ length: 20 }, (_, i) => i / 30);
  const a = analyzeTimes(clean);
  assert.ok(Math.abs(a.fps - 30) < 1e-9);
  assert.equal(a.duplicates.length + a.dropped.length, 0);
  const bad = [...clean];
  bad.splice(7, 2); // two frames missing after index 6
  bad.splice(12, 0, bad[11]); // a repeat
  const b = analyzeTimes(bad);
  assert.equal(b.dropped.length, 1);
  assert.equal(b.dropped[0].missing, 2);
  assert.equal(b.duplicates.length, 1);
  const w = warningsOf(b, bad.length);
  assert.deepEqual(w.map((x) => x.type).sort(), ["dropped", "duplicate"]);
  assert.equal(w.find((x) => x.type === "dropped").count, 2);
});

test("variable frame rate does not trigger false alarms within tolerance", () => {
  const t = [0, 0.033, 0.067, 0.1, 0.134, 0.166, 0.2];
  const a = analyzeTimes(t);
  assert.equal(a.duplicates.length + a.dropped.length, 0);
});

test("strider keeps one frame in N by position, even when frames are skipped or repeated", () => {
  const run = (times, step) => {
    const s = createStrider({ period: 1 / 30, step });
    return times.filter((t) => s.next(t).keep);
  };
  const slots = (n) => Array.from({ length: n }, (_, i) => i / 30);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  // clean: slots 0, 3, 6, ...
  assert.deepEqual(run(slots(10), 3).map((t) => Math.round(t * 30)), [0, 3, 6, 9]);
  // slot 4 is missing: the frames kept are still slots 0, 3, 6, 9 (arrival counting would give 0, 3, 7)
  const gap = slots(10).filter((_, i) => i !== 4);
  assert.deepEqual(run(gap, 3).map((t) => Math.round(t * 30)), [0, 3, 6, 9]);
  // the frame at slot 3 itself is missing: it is simply absent, later ones do not move
  const gap3 = slots(10).filter((_, i) => i !== 3);
  assert.deepEqual(run(gap3, 3).map((t) => Math.round(t * 30)), [0, 6, 9]);
  // repeats are ignored and do not count as slots
  const rep = [0, 1 / 30, 1 / 30, 2 / 30, 3 / 30];
  assert.deepEqual(run(rep, 1).length, 4);
  near(run(slots(5), 1)[4], 4 / 30);
  // step 1 keeps everything that is new
  assert.equal(run(slots(7), 1).length, 7);
  // a wrong initial period is corrected from the frames seen
  const s = createStrider({ period: 1 / 10, step: 2 });
  const out = slots(30).filter((t) => s.next(t).keep);
  assert.ok(out.length >= 13 && out.length <= 16);
});
