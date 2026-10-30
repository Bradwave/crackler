// Crackler: Synthetic frame source: a ball in free fall with known g, same interface as frames.js.
// ballPixel() and the spec are pure (used by the Node tests); drawing needs a canvas.

const defaultSpec = () => ({
  g: 9.81, // m/s²
  fps: 60,
  duration: 0.85, // s
  width: 640,
  height: 360,
  pxPerM: 80,
  x0: 320, // px, ball position at t = 0
  y0: 24,
  vx: 0.6, // m/s, small horizontal drift so x(t) is not trivial
  radius: 9, // px
  stickLength: 2, // m, drawn as a ruler on the floor
  stickA: [40, 330], // px
});

function frameCountOf(spec) {
  return Math.floor(spec.duration * spec.fps + 1e-9) + 1;
}
// True pixel position of the ball centre at time t.
function ballPixelAt(spec, t) {
  return [spec.x0 + spec.vx * t * spec.pxPerM, spec.y0 + 0.5 * spec.g * t * t * spec.pxPerM];
}
function ballPixel(spec, n) {
  return ballPixelAt(spec, n / spec.fps);
}
function stickEnds(spec) {
  const a = spec.stickA;
  return [a, [a[0] + spec.stickLength * spec.pxPerM, a[1]]];
}

// ---------- drawing ----------
function drawScene(ctx, spec, n) {
  const { width: W, height: H } = spec;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#cfe8f5");
  sky.addColorStop(1, "#f4f1e4");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // background grid, so zoom and pan are easy to judge
  ctx.strokeStyle = "rgba(20,40,60,0.10)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) line(ctx, x + 0.5, 0, x + 0.5, H);
  for (let y = 0; y <= H; y += 40) line(ctx, 0, y + 0.5, W, y + 0.5);
  // floor
  ctx.fillStyle = "#6b5a46";
  ctx.fillRect(0, H - 22, W, 22);
  // ruler of known length
  const [a, b] = stickEnds(spec);
  ctx.fillStyle = "#f2b632";
  ctx.fillRect(a[0], a[1] - 5, b[0] - a[0], 10);
  ctx.strokeStyle = "#3a0e12";
  ctx.lineWidth = 2;
  ctx.strokeRect(a[0], a[1] - 5, b[0] - a[0], 10);
  for (let i = 0; i <= 8; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / 8;
    line(ctx, x, a[1] - 5, x, a[1] - (i % 4 === 0 ? 14 : 9));
  }
  ctx.fillStyle = "#3a0e12";
  ctx.font = "700 12px monospace";
  ctx.fillText(`${spec.stickLength} m`, a[0], a[1] - 20);
  // ball
  const [x, y] = ballPixel(spec, n);
  const g = ctx.createRadialGradient(x - spec.radius * 0.35, y - spec.radius * 0.35, 1, x, y, spec.radius);
  g.addColorStop(0, "#ffd0c8");
  g.addColorStop(0.35, "#e0342a");
  g.addColorStop(1, "#8a1410");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, spec.radius, 0, Math.PI * 2);
  ctx.fill();
}
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// ---------- the frame source ----------
function createSyntheticFrames() {
  let bitmaps = [],
    spec = null;
  const src = {
    kind: "synthetic",
    warnings: [],
    info: null,
    get frameCount() {
      return bitmaps.length;
    },
    get fps() {
      return spec ? spec.fps : 0;
    },
    get width() {
      return spec ? spec.width : 0;
    },
    get height() {
      return spec ? spec.height : 0;
    },
    get spec() {
      return spec;
    },
    async load(options = {}) {
      spec = { ...defaultSpec(), ...options };
      const c = document.createElement("canvas");
      c.width = spec.width;
      c.height = spec.height;
      const ctx = c.getContext("2d");
      const n = frameCountOf(spec);
      bitmaps = [];
      for (let i = 0; i < n; i++) {
        drawScene(ctx, spec, i);
        bitmaps.push(await createImageBitmap(c));
      }
      src.info = { name: "synthetic", duration: spec.duration, width: spec.width, height: spec.height };
      return src;
    },
    getFrame(n) {
      return bitmaps[Math.max(0, Math.min(bitmaps.length - 1, n))];
    },
    timeOf(n) {
      return n / spec.fps;
    },
    dispose() {
      bitmaps.forEach((b) => b.close());
      bitmaps = [];
    },
  };
  return src;
}

// Records the same animation to a video file, in real time (best effort, needs MediaRecorder).
async function recordSyntheticVideo(options = {}, onProgress = () => {}) {
  const spec = { ...defaultSpec(), ...options };
  if (!window.MediaRecorder) throw new Error("MediaRecorder");
  const c = document.createElement("canvas");
  c.width = spec.width;
  c.height = spec.height;
  const ctx = c.getContext("2d");
  const types = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
  const stream = c.captureStream(spec.fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  drawScene(ctx, spec, 0);
  rec.start();
  const n = frameCountOf(spec),
    track = stream.getVideoTracks()[0];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    drawScene(ctx, spec, i);
    if (track.requestFrame) track.requestFrame();
    onProgress(i / n);
    const wait = t0 + ((i + 1) * 1000) / spec.fps - performance.now();
    await new Promise((r) => setTimeout(r, Math.max(0, wait)));
  }
  rec.stop();
  await done;
  const ext = (mime || "video/webm").startsWith("video/mp4") ? "mp4" : "webm";
  return { blob: new Blob(chunks, { type: mime }), ext };
}

export {
  defaultSpec,
  frameCountOf,
  ballPixelAt,
  ballPixel,
  stickEnds,
  createSyntheticFrames,
  recordSyntheticVideo,
};
