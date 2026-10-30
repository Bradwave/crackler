// Crackler: Pure clip settings: which frames are analysed and which time each one gets.

function createClip(frameCount) {
  return { start: 0, end: Math.max(0, frameCount - 1), step: 1, fps: null, tOffset: 0, zero: 0 };
}
// Brings every field back into a valid range (keeps the object identity).
function normalizeClip(clip, frameCount) {
  const last = Math.max(0, frameCount - 1);
  const int = (v, d) => (Number.isFinite(+v) ? Math.round(+v) : d);
  clip.start = Math.min(last, Math.max(0, int(clip.start, 0)));
  clip.end = Math.min(last, Math.max(clip.start, int(clip.end, last)));
  clip.step = Math.max(1, int(clip.step, 1));
  clip.zero = Math.min(last, Math.max(0, int(clip.zero, clip.start)));
  clip.fps = clip.fps > 0 ? +clip.fps : null;
  clip.tOffset = Number.isFinite(+clip.tOffset) ? +clip.tOffset : 0;
  return clip;
}
function frameList(clip) {
  const out = [];
  for (let n = clip.start; n <= clip.end; n += clip.step) out.push(n);
  return out;
}
// Position of frame n in the analysed list, or -1 if it is not on the grid.
function gridIndex(clip, n) {
  if (n < clip.start || n > clip.end) return -1;
  const k = (n - clip.start) / clip.step;
  return Number.isInteger(k) ? k : -1;
}
// Nearest analysed frame to n.
function snapFrame(clip, n) {
  const k = Math.round((n - clip.start) / clip.step),
    kmax = Math.floor((clip.end - clip.start) / clip.step);
  return clip.start + Math.min(kmax, Math.max(0, k)) * clip.step;
}
// Frame reached by moving `k` grid steps from n (clamped to the clip).
function stepFrame(clip, n, k) {
  const i = Math.round((snapFrame(clip, n) - clip.start) / clip.step),
    kmax = Math.floor((clip.end - clip.start) / clip.step);
  return clip.start + Math.min(kmax, Math.max(0, i + k)) * clip.step;
}
// Time of frame n: real timestamps, or a uniform rate when the user overrides it.
function timeOfFrame(clip, timeOf, n) {
  if (clip.fps > 0) return (n - clip.zero) / clip.fps + clip.tOffset;
  return timeOf(n) - timeOf(clip.zero) + clip.tOffset;
}

export { createClip, normalizeClip, frameList, gridIndex, snapFrame, stepFrame, timeOfFrame };
