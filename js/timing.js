// Crackler: Pure helpers for frame timestamps and for the memory estimate before extraction.

const BYTES_PER_PIXEL = 4;

// ---------- memory ----------
function scaledSize(vw, vh, maxWidth) {
  const s = Math.min(1, maxWidth / vw);
  return { width: Math.max(2, Math.round(vw * s)), height: Math.max(2, Math.round(vh * s)) };
}
function bytesPerFrame(w, h) {
  return w * h * BYTES_PER_PIXEL;
}
function maxFramesForBudget(budget, w, h) {
  return Math.max(0, Math.floor(budget / bytesPerFrame(w, h)));
}
// Estimated outcome of extracting [start, end] seconds at the given settings.
function estimate({ vw, vh, fps, start, end, maxWidth, step, budget }) {
  const { width, height } = scaledSize(vw, vh, maxWidth);
  const frames = Math.max(0, Math.round(((end - start) * fps) / step));
  const bytes = frames * bytesPerFrame(width, height);
  return { width, height, frames, bytes, over: budget > 0 && bytes > budget };
}

// ---------- timestamps ----------
function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Looks for repeated and missing frames in a list of presentation times (seconds).
// Returns the typical frame period, the rate, and where the anomalies are.
function analyzeTimes(times) {
  const d = [];
  for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1]);
  const med = median(d.filter((x) => x > 1e-6));
  const duplicates = [],
    dropped = [];
  if (Number.isFinite(med)) {
    d.forEach((x, i) => {
      if (x < 0.4 * med) duplicates.push(i + 1);
      else if (x > 1.5 * med) dropped.push({ index: i + 1, missing: Math.round(x / med) - 1 });
    });
  }
  return { period: med, fps: 1 / med, duplicates, dropped };
}
// Turns the analysis into the warnings the UI shows.
function warningsOf(an, total) {
  const w = [];
  if (an.duplicates.length) w.push({ type: "duplicate", count: an.duplicates.length, at: an.duplicates[0] });
  if (an.dropped.length) {
    const count = an.dropped.reduce((a, b) => a + Math.max(1, b.missing), 0);
    w.push({ type: "dropped", count, at: an.dropped[0].index, of: total });
  }
  return w;
}

// ---------- choosing frames while they arrive ----------
// "Keep one frame in `step`" by position in the video, not by arrival order: a frame the browser
// skipped still counts as a slot, so the frames that are kept do not shift. Repeated frames are
// ignored. `period` is the expected frame period (s); it is refined from the frames seen.
function createStrider({ period, step = 1 }) {
  let prev = null,
    slot = 0;
  const win = [];
  const current = () => (win.length >= 5 ? median(win) : period);
  return {
    // Returns { keep, dup, missing } for a frame with presentation time t.
    next(t) {
      let missing = 0;
      if (prev !== null) {
        const d = t - prev,
          p = current();
        if (d < 0.4 * p) return { keep: false, dup: true, missing: 0 };
        if (d > 1.5 * p) missing = Math.max(0, Math.round(d / p) - 1);
        else {
          win.push(d);
          if (win.length > 24) win.shift();
        }
      }
      prev = t;
      slot += missing;
      const keep = slot % step === 0;
      slot++;
      return { keep, dup: false, missing };
    },
  };
}

export {
  createStrider,
  scaledSize,
  bytesPerFrame,
  maxFramesForBudget,
  estimate,
  median,
  analyzeTimes,
  warningsOf,
  BYTES_PER_PIXEL,
};
