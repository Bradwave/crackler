// Crackler: Tests for sessions.js over the in-memory backend.
import test from "node:test";
import assert from "node:assert/strict";
import { createSessions, memoryBackend } from "../js/sessions.js";

const meta = (name) => ({ name, videoName: name + ".mp4", size: 10, project: "{}", points: 0 });

test("create, list newest first, get the video back", async () => {
  const s = createSessions(memoryBackend());
  const a = await s.create("blobA", meta("a"), 1000);
  const b = await s.create("blobB", meta("b"), 2000);
  assert.deepEqual((await s.list()).map((m) => m.id), [b, a]);
  assert.equal(await s.video(a), "blobA");
  assert.equal((await s.get(b)).name, "b");
});

test("save updates the analysis and the time, keeps the rest", async () => {
  const s = createSessions(memoryBackend());
  const a = await s.create("x", meta("a"), 1000);
  const b = await s.create("y", meta("b"), 2000);
  assert.equal(await s.save(a, { project: "{1}", points: 7 }, 3000), true);
  const m = await s.get(a);
  assert.equal(m.points, 7);
  assert.equal(m.videoName, "a.mp4");
  assert.deepEqual((await s.list()).map((q) => q.id), [a, b]);
  assert.equal(await s.save("nope", {}), false);
});

test("rename trims and falls back to the video name", async () => {
  const s = createSessions(memoryBackend());
  const a = await s.create("x", meta("a"));
  await s.rename(a, "  Free fall 2  ");
  assert.equal((await s.get(a)).name, "Free fall 2");
  await s.rename(a, "   ");
  assert.equal((await s.get(a)).name, "a.mp4");
});

test("remove deletes the record and the video", async () => {
  const s = createSessions(memoryBackend());
  const a = await s.create("x", meta("a"));
  await s.remove(a);
  assert.equal(await s.get(a), undefined);
  assert.equal(await s.video(a), undefined);
  assert.deepEqual(await s.list(), []);
});

test("a failed metadata write leaves no orphan video", async () => {
  const be = memoryBackend();
  const put = be.put;
  be.put = async (st, k, v) => {
    if (st === "meta") throw new Error("quota");
    return put(st, k, v);
  };
  const s = createSessions(be);
  await assert.rejects(s.create("x", meta("a")));
  assert.deepEqual(await be.all("video"), []);
});
