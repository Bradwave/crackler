// Crackler: Frame access layer. The ONLY module that touches a <video> element.
// Public interface (stable, so a WebCodecs version can replace this file):
//   probe(file) -> { duration, width, height, fps, fpsMeasured }
//   createFrames() -> { load(file, opts), frameCount, fps, width, height, warnings,
//                       getFrame(n) -> ImageBitmap, timeOf(n) -> seconds, dispose() }
// Frames are decoded once into memory, so frame n is always exactly frame n.
import { analyzeTimes, createStrider, maxFramesForBudget, median, warningsOf } from "./timing.js";

const supported = () =>
  typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

// ---------- hidden video element ----------
function makeVideo(file) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.preload = "auto";
  v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  v.src = URL.createObjectURL(file);
  document.body.appendChild(v);
  return v;
}
function freeVideo(v) {
  v.pause();
  const url = v.src;
  v.removeAttribute("src");
  v.load();
  v.remove();
  URL.revokeObjectURL(url);
}
const once = (el, ok, bad = "error") =>
  new Promise((res, rej) => {
    const done = (e) => {
      el.removeEventListener(ok, onOk);
      el.removeEventListener(bad, onBad);
      return e;
    };
    const onOk = (e) => res(done(e));
    const onBad = () => {
      done();
      rej(new Error("decode"));
    };
    el.addEventListener(ok, onOk);
    el.addEventListener(bad, onBad);
  });
async function seek(v, t) {
  if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return;
  const p = once(v, "seeked");
  v.currentTime = t;
  await p;
}

// ---------- probe ----------
// Reads size and duration, and estimates the frame rate by playing a few frames.
async function probe(file) {
  if (!supported()) throw new Error("unsupported");
  const v = makeVideo(file);
  try {
    await once(v, "loadedmetadata");
    const info = {
      name: file.name,
      size: file.size,
      duration: v.duration,
      width: v.videoWidth,
      height: v.videoHeight,
      fps: 30,
      fpsMeasured: false,
    };
    try {
      const times = await sampleTimes(v, 14, 1500);
      const med = median(times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 1e-6));
      if (Number.isFinite(med) && med > 0) {
        info.fps = Math.round((1 / med) * 100) / 100;
        info.fpsMeasured = true;
      }
    } catch {
      // keep the default
    }
    return info;
  } finally {
    freeVideo(v);
  }
}
function sampleTimes(v, count, timeout) {
  return new Promise((resolve, reject) => {
    const times = [];
    const stop = () => {
      v.pause();
      clearTimeout(timer);
      resolve(times);
    };
    const timer = setTimeout(stop, timeout);
    const cb = (now, meta) => {
      times.push(meta.mediaTime);
      if (times.length >= count) stop();
      else v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
    v.play().catch(reject);
  });
}

// ---------- extraction ----------
// One real-time pass over [start, end] seconds. Returns raw captures and why it stopped.
function extractPass(v, o) {
  const { start, end, width, height, step, rate, maxFrames, tol, period, onProgress, signal } = o;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const kept = [],
    all = [];
  const strider = createStrider({ period, step });
  let finished = false,
    timer = 0;
  return new Promise(async (resolve, reject) => {
    const finish = async (reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      v.pause();
      try {
        const bitmaps = await Promise.all(kept.map((k) => k.bmp));
        resolve({ reason, times: kept.map((k) => k.t), bitmaps, allTimes: all });
      } catch (e) {
        reject(e);
      }
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish("stalled"), 4000);
    };
    const onFrame = (now, meta) => {
      if (finished) return;
      arm();
      const t = meta.mediaTime;
      if (signal && signal.aborted) return finish("abort");
      if (t > end + tol) return finish("end");
      if (t >= start - tol) {
        all.push(t);
        if (strider.next(t).keep) {
          if (kept.length >= maxFrames) return finish("budget");
          ctx.drawImage(v, 0, 0, width, height);
          kept.push({ t, bmp: createImageBitmap(canvas) });
        }
        onProgress && onProgress(Math.min(1, (t - start) / Math.max(1e-6, end - start)), kept.length);
      }
      v.requestVideoFrameCallback(onFrame);
    };
    try {
      await seek(v, start);
      v.playbackRate = rate;
      v.addEventListener("ended", () => finish("end"), { once: true });
      arm();
      v.requestVideoFrameCallback(onFrame);
      await v.play();
    } catch (e) {
      finish("error").then(() => reject(e));
    }
  });
}

function createFrames() {
  let bitmaps = [],
    times = [],
    meta = { width: 0, height: 0, fps: 0 };
  const src = {
    kind: "video",
    warnings: [],
    info: null,
    get frameCount() {
      return bitmaps.length;
    },
    get fps() {
      return meta.fps;
    },
    get width() {
      return meta.width;
    },
    get height() {
      return meta.height;
    },
    // opts: start, end (s), maxWidth, step, budget (bytes), onProgress(frac, frames, attempt), signal
    async load(file, opts = {}) {
      if (!supported()) throw new Error("unsupported");
      src.dispose();
      const info = opts.info || (await probe(file));
      const start = Math.max(0, opts.start ?? 0),
        end = Math.min(info.duration, opts.end ?? info.duration);
      const scale = Math.min(1, (opts.maxWidth || 640) / info.width);
      const width = Math.max(2, Math.round(info.width * scale)),
        height = Math.max(2, Math.round(info.height * scale));
      const step = Math.max(1, opts.step || 1);
      const maxFrames = opts.budget ? maxFramesForBudget(opts.budget, width, height) : Infinity;
      const tol = 0.5 / info.fps;
      const v = makeVideo(file);
      try {
        await once(v, "loadedmetadata");
        let rate = 0.5,
          result = null,
          an = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (result) result.bitmaps.forEach((b) => b.close());
          result = await extractPass(v, {
            start,
            end,
            width,
            height,
            step,
            rate,
            maxFrames,
            tol,
            period: 1 / info.fps,
            signal: opts.signal,
            onProgress: (f, n) => opts.onProgress && opts.onProgress(f, n, attempt),
          });
          if (result.reason === "abort") break;
          an = analyzeTimes(result.allTimes);
          // gaps usually mean the page could not keep up: try again more slowly
          if (!an.dropped.length || rate <= 0.125) break;
          rate /= 2;
        }
        if (result.reason === "abort") {
          result.bitmaps.forEach((b) => b.close());
          throw new DOMException("aborted", "AbortError");
        }
        // remove frames that repeat the previous presentation time
        const keepIdx = [];
        result.times.forEach((t, i) => {
          if (i === 0 || t - result.times[i - 1] > 1e-6) keepIdx.push(i);
          else result.bitmaps[i].close();
        });
        bitmaps = keepIdx.map((i) => result.bitmaps[i]);
        const abs = keepIdx.map((i) => result.times[i]);
        times = abs.map((t) => t - abs[0]);
        const d = [];
        for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1]);
        const period = median(d.filter((x) => x > 1e-6));
        meta = { width, height, fps: Number.isFinite(period) ? 1 / period : info.fps };
        src.warnings = warningsOf(an || analyzeTimes(abs), bitmaps.length);
        if (result.reason === "budget") src.warnings.push({ type: "budget", count: bitmaps.length });
        if (result.reason === "stalled") src.warnings.push({ type: "stalled", count: bitmaps.length });
        src.info = { ...info, start: abs[0], rate, step };
        return src;
      } finally {
        freeVideo(v);
      }
    },
    getFrame(n) {
      return bitmaps[Math.max(0, Math.min(bitmaps.length - 1, n))];
    },
    timeOf(n) {
      return times[Math.max(0, Math.min(times.length - 1, n))];
    },
    dispose() {
      bitmaps.forEach((b) => b.close());
      bitmaps = [];
      times = [];
      src.warnings = [];
    },
  };
  return src;
}

export { probe, createFrames, supported };
