// Crackler: Canvas plot renderer. Draws axes, grid and series; returns what the UI needs for hit tests.
import { drawMath } from "./mathtext.js";
import { extent, fmtTick, niceTicks } from "./plotmath.js";

const M = { l: 54, r: 12, t: 12, b: 40 };

function shape(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (kind === "cross") {
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
  } else if (kind === "square") ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (kind === "diamond") {
    ctx.moveTo(x, y - r * 1.3);
    ctx.lineTo(x + r * 1.3, y);
    ctx.lineTo(x, y + r * 1.3);
    ctx.lineTo(x - r * 1.3, y);
    ctx.closePath();
  } else if (kind === "triangle") {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 1.1, y + r * 0.9);
    ctx.lineTo(x - r * 1.1, y + r * 0.9);
    ctx.closePath();
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
}

// spec: { series: [{ color, marker, pts: [{x, y, frame}] }], xLabel, yLabel, xlim, ylim, connect, curFrame,
//         overlays: { range: [x0, x1], area: { pts, color }, curve: { pts: [[x, y]], color },
//                     lines: [{ x0, y0, x1, y1, color }], marks: [{ x, y, color }] } }
// xlim / ylim: [lo, hi] or null for automatic. C: colours { surface, ink, muted, gridline, accent }.
// Returns { items: [{ sx, sy, frame, si }], range: { x: [lo, hi], y: [lo, hi] }, invX(sx) -> data x }.
function drawPlot(ctx, w, h, spec, C) {
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, w, h);
  const all = spec.series.flatMap((s) => s.pts);
  const xr = spec.xlim || extent(all.map((p) => p.x)),
    yr = spec.ylim || extent(all.map((p) => p.y));
  const x0 = M.l,
    x1 = w - M.r,
    y0 = h - M.b,
    y1 = M.t;
  const X = (v) => x0 + ((v - xr[0]) / (xr[1] - xr[0] || 1)) * (x1 - x0),
    Y = (v) => y0 - ((v - yr[0]) / (yr[1] - yr[0] || 1)) * (y0 - y1);
  const xt = niceTicks(xr[0], xr[1], Math.max(3, Math.round((x1 - x0) / 70))),
    yt = niceTicks(yr[0], yr[1], Math.max(3, Math.round((y0 - y1) / 45)));

  // grid, ticks, labels
  ctx.lineWidth = 1;
  ctx.font = '10px "Space Mono", ui-monospace, monospace';
  ctx.fillStyle = C.muted;
  ctx.strokeStyle = C.gridline;
  ctx.textAlign = "center";
  for (const v of xt.ticks) {
    const x = Math.round(X(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y0);
    ctx.stroke();
    ctx.fillText(fmtTick(v, xt.step), x, y0 + 14);
  }
  ctx.textAlign = "right";
  for (const v of yt.ticks) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillText(fmtTick(v, yt.step), x0 - 5, y + 3);
  }
  // zero lines
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1.5;
  if (xr[0] < 0 && xr[1] > 0) line(ctx, Math.round(X(0)) + 0.5, y1, Math.round(X(0)) + 0.5, y0);
  if (yr[0] < 0 && yr[1] > 0) line(ctx, x0, Math.round(Y(0)) + 0.5, x1, Math.round(Y(0)) + 0.5);

  // series, clipped to the plot area
  const items = [];
  const ov = spec.overlays || {};
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y1, x1 - x0, y0 - y1);
  ctx.clip();
  if (ov.range) {
    const a = X(ov.range[0]),
      b = X(ov.range[1]);
    ctx.fillStyle = C.accent;
    ctx.globalAlpha = 0.13;
    ctx.fillRect(a, y1, b - a, y0 - y1);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    line(ctx, a, y1, a, y0);
    line(ctx, b, y1, b, y0);
    ctx.setLineDash([]);
  }
  if (ov.area && ov.area.pts.length > 1) {
    const pts = ov.area.pts;
    ctx.fillStyle = ov.area.color;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(X(pts[0].x), Y(0));
    for (const p of pts) ctx.lineTo(X(p.x), Y(p.y));
    ctx.lineTo(X(pts[pts.length - 1].x), Y(0));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  spec.series.forEach((s, si) => {
    const pts = s.pts.map((p) => ({ sx: X(p.x), sy: Y(p.y), frame: p.frame, si }));
    if (spec.connect && pts.length > 1) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.stroke();
    }
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = 2;
    for (const p of pts) {
      shape(ctx, s.marker, p.sx, p.sy, 3.2);
      if (s.marker === "cross") ctx.stroke();
      else ctx.fill();
      items.push(p);
    }
    for (const p of pts)
      if (p.frame === spec.curFrame) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2.5;
        shape(ctx, "circle", p.sx, p.sy, 8);
        ctx.stroke();
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.5;
        shape(ctx, "circle", p.sx, p.sy, 8);
        ctx.stroke();
      }
  });
  // analysis overlays on top of the points
  if (ov.curve && ov.curve.pts.length > 1) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 4.5;
    path(ctx, ov.curve.pts, X, Y);
    ctx.strokeStyle = ov.curve.color;
    ctx.lineWidth = 2.5;
    path(ctx, ov.curve.pts, X, Y);
  }
  for (const l of ov.lines || []) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 4;
    line(ctx, X(l.x0), Y(l.y0), X(l.x1), Y(l.y1));
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 2;
    line(ctx, X(l.x0), Y(l.y0), X(l.x1), Y(l.y1));
    ctx.setLineDash([]);
  }
  for (const m of ov.marks || []) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 4;
    shape(ctx, "circle", X(m.x), Y(m.y), 6);
    ctx.stroke();
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    shape(ctx, "circle", X(m.x), Y(m.y), 6);
    ctx.stroke();
  }
  ctx.restore();

  // frame and axis labels
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);
  drawMath(ctx, spec.xLabel, (x0 + x1) / 2, h - 6, { size: 11.5, weight: 700, color: C.ink, align: "center" });
  ctx.save();
  ctx.translate(12, (y0 + y1) / 2);
  ctx.rotate(-Math.PI / 2);
  drawMath(ctx, spec.yLabel, 0, 0, { size: 11.5, weight: 700, color: C.ink, align: "center" });
  ctx.restore();
  if (!all.length) {
    ctx.fillStyle = C.muted;
    ctx.textAlign = "center";
    ctx.font = '11px "Space Mono", ui-monospace, monospace';
    ctx.fillText(spec.emptyText || "", (x0 + x1) / 2, (y0 + y1) / 2);
  }
  return { items, range: { x: xr, y: yr }, invX: (sx) => xr[0] + ((sx - x0) / (x1 - x0)) * (xr[1] - xr[0]) };
}
function path(ctx, pts, X, Y) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
  ctx.stroke();
}
function line(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a, b);
  ctx.lineTo(c, d);
  ctx.stroke();
}

export { drawPlot };
