// Crackler: Tests for autosave.js (store with recency, quota handling, video identity).
import test from "node:test";
import assert from "node:assert/strict";
import { createAutosave, videoId, videoPrefix } from "../js/autosave.js";

function fakeStorage(limit = Infinity) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      if (v.length > limit) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
  };
}
const info = { name: "fall.mp4", size: 1234, duration: 2.5 };

test("video identity", () => {
  assert.equal(videoId(info, 75), "fall.mp4|1234|2500|75");
  assert.ok(videoId(info, 75).startsWith(videoPrefix(info)));
  assert.notEqual(videoId(info, 75), videoId({ ...info, size: 1235 }, 75));
});

test("save, find, replace and order by recency", () => {
  const a = createAutosave(fakeStorage());
  a.save("v1", "one", { points: 3 }, 100);
  a.save("v2", "two", { points: 5 }, 200);
  a.save("v1", "one-b", { points: 4 }, 300);
  assert.deepEqual(a.list().map((e) => e.id), ["v1", "v2"]);
  assert.equal(a.find("v1").text, "one-b");
  assert.equal(a.find("v1").meta.points, 4);
  assert.equal(a.find("nope"), null);
  assert.equal(a.findPrefix("v2").text, "two");
  a.remove("v1");
  assert.deepEqual(a.list().map((e) => e.id), ["v2"]);
});

test("keeps at most `max` entries, newest first", () => {
  const a = createAutosave(fakeStorage(), { max: 3 });
  for (let i = 0; i < 6; i++) a.save("v" + i, "x", {}, i);
  assert.deepEqual(a.list().map((e) => e.id), ["v5", "v4", "v3"]);
});

test("a full store drops the oldest entries; a single oversized entry reports failure", () => {
  const s = fakeStorage(400);
  const a = createAutosave(s);
  const big = "y".repeat(120);
  a.save("old", big, {}, 1);
  a.save("mid", big, {}, 2);
  assert.equal(a.save("new", big, {}, 3), true);
  const ids = a.list().map((e) => e.id);
  assert.equal(ids[0], "new");
  assert.ok(!ids.includes("old"));
  assert.equal(a.save("huge", "z".repeat(2000), {}, 4), false);
  assert.equal(a.find("new") !== null || a.list().length >= 0, true); // nothing thrown
});

test("corrupt or missing storage reads as empty, and a storage that throws is survived", () => {
  const s = fakeStorage();
  s.setItem("crackler.autosave.v1", "{not json");
  const a = createAutosave(s);
  assert.deepEqual(a.list(), []);
  assert.equal(a.save("v", "t", {}, 1), true);
  const broken = createAutosave({ getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } });
  assert.deepEqual(broken.list(), []);
  assert.equal(broken.save("v", "t"), false);
});
