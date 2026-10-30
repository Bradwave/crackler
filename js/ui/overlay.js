// Crackler: What is drawn on the video besides the frame (calibration, lens lines, perspective rectangle,
// measuring tools, tracks of every kind), and the draggable handles of the calibrate tool.
// drawOverlays gets a small toolbox `g` from the stage so this module does not depend on it.
import { angleToward, lensOf } from "../calibration.js";
import { lensFor, straightGuide } from "../lens.js";
import { evalMeasure } from "../measures.js";
import { timeOfFrame } from "../clip.js";
import { trackSeries } from "../derive.js";
import { mapper, st } from "../state.js";
import { getPoint, markedFrames, massOf, worldPoints } from "../tracks.js";
import { fmt } from "../util.js";

const AXIS_PX = 64;
const unit2 = (v) => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];

// ---------- handles ----------
// Draggable points of the calibrate tool. pos is in image pixels at the current frame; set(raw) takes
// the pointer position (image pixels at the current frame) and stores it in base-frame coordinates.
function handleList(zoom) {
  if (!st.src || st.tool !== "calib") return [];
  const M = mapper(),
    f = st.frame,
    cal = st.cal;
  const base = (raw) => M.toBaseFrame(raw, f);
  const list = [];
  const o = M.unmap([0, 0], f);
  if (o) {
    const wl = (M.scale * AXIS_PX) / zoom,
      tip = M.unmap([wl, 0], f);
    if (tip) {
      const d = unit2(sub(tip, o));
      list.push({
        id: "axis",
        pos: [o[0] + (d[0] * AXIS_PX) / zoom, o[1] + (d[1] * AXIS_PX) / zoom],
        set: (raw) => {
          cal.angle = angleToward(cal, base(raw));
        },
      });
    }
  }
  const at = (p) => M.toFrame(p, f);
  list.push({ id: "origin", pos: at(cal.origin), set: (raw) => (cal.origin = base(raw)) });
  if (cal.stick)
    for (const k of ["a", "b"]) list.push({ id: "stick" + k, pos: at(cal.stick[k]), set: (raw) => (cal.stick[k] = base(raw)) });
  if (cal.persp) cal.persp.pts.forEach((p, i) => list.push({ id: "q" + i, pos: at(p), set: (raw) => (cal.persp.pts[i] = base(raw)) }));
  for (const m of st.measures)
    if (m.pts) m.pts.forEach((p, i) => list.push({ id: `m${m.id}.${i}`, pos: at(p), set: (raw) => (m.pts[i] = base(raw)), measure: true }));
  return list;
}

// ---------- motion overlays: velocity, acceleration, net force, trails ----------
const envNow = () => ({ timeOf: (n) => timeOfFrame(st.clip, (k) => st.src.timeOf(k), n), params: st.custom.params });
let cache = { rev: -1, list: [], scale: {} };
// Series of every track, rebuilt only when something changed, and the world length one unit of each
// quantity gets as an arrow (so the fastest arrow is about 14% of the image diagonal, times the user's size).
function motionData(M) {
  if (cache.rev === st.rev) return cache;
  const list = st.tracks.map((track) => ({
    track,
    s: trackSeries(track, st.cal, st.clip, (n) => st.src.timeOf(n), st.smooth, st.tracks, st.custom.params),
  }));
  const byId = new Map(st.tracks.map((t) => [t.id, t]));
  let mv = 0,
    ma = 0,
    mf = 0;
  for (const { track, s } of list) {
    const m = massOf(track, byId);
    for (const v of s.v) if (v != null && v > mv) mv = v;
    for (const a of s.a) if (a != null) (a > ma && (ma = a), a * m > mf && (mf = a * m));
    s.at = new Map(s.n.map((fr, i) => [fr, i]));
  }
  const extent = Math.hypot(st.src.width, st.src.height) * (M.scale || 1);
  const k = (mx) => (mx > 0 ? (0.14 * extent) / mx : 0);
  cache = { rev: st.rev, list, scale: { v: k(mv), a: k(ma), f: k(mf) } };
  return cache;
}
const MOVING = new Set(["point", "cm", "analytic", "dynamic"]);
function drawMotion(g, M, f) {
  const o = st.overlay;
  if (!(o.v || o.a || o.f || o.trail)) return;
  const { list, scale } = motionData(M);
  const byId = new Map(st.tracks.map((t) => [t.id, t]));
  const u = M.unit,
    fu = u === "m" ? "N" : `kg·${u}/s²`;
  for (const { track, s } of list) {
    if (!track.visible || !MOVING.has(track.kind)) continue;
    const i = s.at.get(f);
    if (o.trail) {
      const from = o.trailLen > 0 ? Math.max(0, s.n.findIndex((fr) => fr >= f - o.trailLen * (st.clip.step || 1))) : 0;
      const pts = [];
      for (let q = Math.max(0, from); q < s.n.length && s.n[q] <= f; q++) {
        const p = M.unmap([s.x[q], s.y[q]], s.n[q]);
        if (p) pts.push(g.toScreen(p));
      }
      if (pts.length > 1)
        g.halo(() => {
          g.ctx.beginPath();
          pts.forEach((p, k) => (k ? g.ctx.lineTo(...p) : g.ctx.moveTo(...p)));
        }, track.color, 1.5);
    }
    if (i == null) continue;
    const mass = massOf(track, byId);
    const tail = M.unmap([s.x[i], s.y[i]], f);
    if (!tail) continue;
    const arrow = (vx, vy, k, color, text, dy) => {
      if (vx == null || vy == null || !(k > 0)) return;
      const head = M.unmap([s.x[i] + vx * k, s.y[i] + vy * k], f);
      if (!head) return;
      const a = g.toScreen(tail),
        b = g.toScreen(head);
      g.arrow(a, b, color, 2.5);
      if (o.labels) g.label(text, b[0] + 7, b[1] + dy, color); // v, a and F labels sit on separate lines
    };
    const name = st.tracks.length > 1 ? track.name + " " : "";
    if (o.v) arrow(s.vx[i], s.vy[i], scale.v * o.sv, g.C.vel, `${name}v = ${fmt(s.v[i], 3)} ${u}/s`, -6);
    if (o.a) arrow(s.ax[i], s.ay[i], scale.a * o.sa, g.C.acc, `${name}a = ${fmt(s.a[i], 3)} ${u}/s²`, 9);
    if (o.f && s.ax[i] != null) arrow(s.ax[i] * mass, s.ay[i] * mass, scale.f * o.sf, g.C.accent, `${name}ΣF = ${fmt(s.a[i] * mass, 3)} ${fu}`, 24);
  }
}

// ---------- drawing ----------
function drawOverlays(g) {
  if (!st.src) return;
  const M = mapper(),
    f = st.frame;
  const S = (p) => g.toScreen(M.toFrame(p, f)); // base-frame pixel -> screen
  drawLens(g, S);
  drawPersp(g, S, M, f);
  drawScale(g, S, M, f);
  drawMeasures(g, S, M, f);
  drawTracks(g, M, f);
  drawMotion(g, M, f);
  if (!g.exporting) drawCollect(g, S);
}

function drawLens(g, S) {
  const cal = st.cal,
    lines = cal.lens.lines || [];
  if (!lines.length) return;
  const lens = lensOf(cal) || lensFor(0, 0, cal.width, cal.height);
  for (const line of lines) {
    if (line.length > 1) {
      g.halo(() => {
        g.ctx.beginPath();
        line.forEach((p, i) => (i ? g.ctx.lineTo(...S(p)) : g.ctx.moveTo(...S(p))));
      }, g.C.tile2, 1.5);
      const guide = straightGuide(line, lens);
      if (guide)
        g.halo(() => {
          g.ctx.beginPath();
          guide.forEach((p, i) => (i ? g.ctx.lineTo(...S(p)) : g.ctx.moveTo(...S(p))));
        }, g.C.vel, 1.5);
    }
    for (const p of line) g.dot(S(p), g.C.tile2, 3);
  }
}

function drawPersp(g, S, M, f) {
  const q = st.cal.persp;
  if (!q) return;
  const pts = q.pts.map(S);
  g.halo(() => {
    g.ctx.beginPath();
    pts.forEach((p, i) => (i ? g.ctx.lineTo(...p) : g.ctx.moveTo(...p)));
    g.ctx.closePath();
  }, g.C.vel, 1.5);
  // a metric grid inside, bent by the perspective
  if (M.perspective) {
    for (let k = 1; k < 4; k++) {
      for (const [a, b] of [[[q.w * k / 4, 0], [q.w * k / 4, q.h]], [[0, q.h * k / 4], [q.w, q.h * k / 4]]]) {
        const p1 = M.unplane(a),
          p2 = M.unplane(b);
        if (p1 && p2)
          g.halo(() => {
            g.ctx.beginPath();
            g.ctx.moveTo(...S(p1));
            g.ctx.lineTo(...S(p2));
          }, g.C.vel, 1);
      }
    }
  }
  pts.forEach((p, i) => g.label(String(i + 1), p[0] + 6, p[1] - 6, g.C.vel));
}

function drawScale(g, S, M, f) {
  const cal = st.cal,
    calibTool = st.tool === "calib";
  const stick = cal.stick,
    pend = st.pendingA && st.provisional && !g.exporting ? { a: S(st.pendingA), b: g.toScreen(st.provisional) } : null;
  const s = (!g.exporting && pend) || (stick ? { a: S(stick.a), b: S(stick.b) } : null);
  if (s) {
    g.halo(() => {
      g.ctx.beginPath();
      g.ctx.moveTo(...s.a);
      g.ctx.lineTo(...s.b);
    }, g.C.tile2, 2);
    for (const e of [s.a, s.b]) {
      const nx = -(s.b[1] - s.a[1]),
        ny = s.b[0] - s.a[0],
        n = Math.hypot(nx, ny) || 1;
      g.halo(() => {
        g.ctx.beginPath();
        g.ctx.moveTo(e[0] - (nx / n) * 7, e[1] - (ny / n) * 7);
        g.ctx.lineTo(e[0] + (nx / n) * 7, e[1] + (ny / n) * 7);
      }, g.C.tile2, 2);
    }
    if (stick && !pend) g.label(`${fmt(cal.length)} ${cal.unit}`, (s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2 - 10, g.C.tile2, { align: "center" });
  } else if (st.pendingA && !g.exporting) g.handle(S(st.pendingA), g.C.tile2, true);
  // origin and axes
  const o = M.unmap([0, 0], f);
  if (o) {
    const os = g.toScreen(o),
      wl = (M.scale * AXIS_PX) / g.cam.zoom,
      tx = M.unmap([wl, 0], f),
      ty = M.unmap([0, wl], f);
    if (tx && ty) {
      const ex = unit2(sub(g.toScreen(tx), os)),
        ey = unit2(sub(g.toScreen(ty), os));
      g.arrow(os, [os[0] + ex[0] * AXIS_PX, os[1] + ex[1] * AXIS_PX], g.C.accent);
      g.arrow(os, [os[0] + ey[0] * AXIS_PX, os[1] + ey[1] * AXIS_PX], g.C.vel);
      g.label("x", os[0] + ex[0] * (AXIS_PX + 12) - 3, os[1] + ex[1] * (AXIS_PX + 12) + 4, g.C.accent);
      g.label("y", os[0] + ey[0] * (AXIS_PX + 12) - 3, os[1] + ey[1] * (AXIS_PX + 12) + 4, g.C.vel);
    }
    if (!g.exporting) g.handle(os, g.C.surface, calibTool);
  }
  if (calibTool && !g.exporting) for (const h of handleList(g.cam.zoom)) g.handle(g.toScreen(h.pos), h.id === "axis" ? g.C.accent : h.measure ? g.C.acc : h.id.startsWith("q") ? g.C.vel : g.C.tile2, true);
}

function drawMeasures(g, S, M, f) {
  const base = st.cal.camera ? st.cal.camera.base : 0;
  const unit = M.unit;
  for (const m of st.measures) {
    const r = evalMeasure(m, M, st.tracks, st.clip, base);
    if (m.kind === "tape") {
      const a = S(m.pts[0]),
        b = S(m.pts[1]);
      g.halo(() => (g.ctx.beginPath(), g.ctx.moveTo(...a), g.ctx.lineTo(...b)), m.color, 2);
      g.dot(a, m.color, 4);
      g.dot(b, m.color, 4);
      if (r) g.label(`${m.name ? m.name + " " : ""}${fmt(r.length)} ${unit}`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 8, m.color, { align: "center" });
    } else if (m.kind === "protractor") {
      const [v, a, b] = m.pts.map(S);
      for (const e of [a, b]) g.halo(() => (g.ctx.beginPath(), g.ctx.moveTo(...v), g.ctx.lineTo(...e)), m.color, 2);
      const a0 = Math.atan2(a[1] - v[1], a[0] - v[0]),
        a1 = Math.atan2(b[1] - v[1], b[0] - v[0]);
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      g.halo(() => (g.ctx.beginPath(), g.ctx.arc(v[0], v[1], 26, a0, a0 + d, d < 0)), m.color, 1.5);
      g.dot(v, m.color, 4);
      if (r) {
        const mid = a0 + d / 2;
        g.label(`${m.name ? m.name + " " : ""}${fmt(r.degrees, 4)}°`, v[0] + Math.cos(mid) * 46 - 12, v[1] + Math.sin(mid) * 46 + 4, m.color);
      }
    } else if (m.kind === "circle" && r) {
      const pts = [];
      for (let i = 0; i <= 72; i++) {
        const t = (i / 72) * 2 * Math.PI,
          p = M.unmap([r.cx + r.r * Math.cos(t), r.cy + r.r * Math.sin(t)], f);
        if (p) pts.push(g.toScreen(p));
      }
      g.halo(() => {
        g.ctx.beginPath();
        pts.forEach((p, i) => (i ? g.ctx.lineTo(...p) : g.ctx.moveTo(...p)));
      }, m.color, 2);
      const c = M.unmap([r.cx, r.cy], f);
      if (c) {
        const cs = g.toScreen(c);
        g.marker("cross", cs, m.color, 7);
        g.label(`${m.name ? m.name + " " : ""}r = ${fmt(r.r)} ${unit}`, cs[0] + 10, cs[1] - 8, m.color);
      }
    }
  }
}

function drawTracks(g, M, f) {
  const byId = new Map(st.tracks.map((t) => [t.id, t]));
  const map = (p, fr) => M.map(p, fr);
  const px = (w) => (w ? M.unmap(w, f) : null);
  const env = envNow();
  const active = st.tracks[st.active];
  for (const tr of st.tracks) {
    if (!tr.visible) continue;
    if (tr.kind === "point") {
      if (st.showMarks)
        for (const fr of markedFrames(tr)) {
          if (fr === f) continue;
          g.dot(g.toScreen(tr.points[fr]), tr.color, 3, true);
        }
      const p = getPoint(tr, f);
      if (p && !(st.provisional && st.tool === "mark" && tr === active)) {
        g.marker(tr.marker, g.toScreen(p), tr.color, 9);
        if (st.overlay.labels && st.tracks.length > 1) {
          const sc = g.toScreen(p);
          g.label(tr.name, sc[0] + 12, sc[1] - 10, tr.color);
        }
      }
    } else if (tr.kind === "analytic" || tr.kind === "dynamic") {
      const e = worldPoints(tr, map, byId, [f], env)[0],
        p = e && px([e.x, e.y]);
      if (p) {
        const sc = g.toScreen(p);
        g.marker(tr.kind === "analytic" ? "circle" : "square", sc, tr.color, 8);
        if (st.overlay.labels) g.label(tr.name, sc[0] + 11, sc[1] - 9, tr.color);
      }
    } else if (tr.kind === "cm") {
      const e = worldPoints(tr, map, byId, [f])[0],
        p = e && px([e.x, e.y]);
      if (p) {
        const s = g.toScreen(p);
        g.marker("diamond", s, tr.color, 8);
        g.marker("cross", s, tr.color, 4);
        g.label(tr.name, s[0] + 11, s[1] - 9, tr.color);
      }
    } else if (tr.kind === "vector" || tr.kind === "vsum") {
      const e = worldPoints(tr, map, byId, [f])[0];
      if (e) {
        const tail = px([e.x, e.y]),
          head = px([e.x + e.cx, e.y + e.cy]);
        if (tail && head) {
          const a = g.toScreen(tail),
            b = g.toScreen(head);
          g.arrow(a, b, tr.color, 2.5);
          g.label(tr.name, (a[0] + b[0]) / 2 + 6, (a[1] + b[1]) / 2 - 6, tr.color);
        }
      }
      if (tr === active && st.vecTail) g.marker("circle", g.toScreen(st.vecTail), tr.color, 5);
    }
  }
  // template and search boxes of the automatic tracker, around the active point
  if (st.autoShow && !g.exporting && active && active.kind === "point") {
    const p = getPoint(active, f);
    if (p) {
      const s = g.toScreen(p),
        z = g.cam.zoom,
        r1 = (st.auto.half + 0.5) * z,
        r2 = st.auto.radius * z + r1;
      g.halo(() => g.ctx.strokeRect(s[0] - r1, s[1] - r1, 2 * r1, 2 * r1), g.C.tile2, 1.5);
      g.ctx.setLineDash([6, 4]);
      g.halo(() => g.ctx.strokeRect(s[0] - r2, s[1] - r2, 2 * r2, 2 * r2), g.C.tile2, 1);
      g.ctx.setLineDash([]);
    }
  }
  if (st.provisional && !g.exporting && st.tool === "mark" && active && active.kind !== "cm" && active.kind !== "vsum") {
    const s = g.toScreen(st.provisional);
    if (st.vecTail) g.arrow(g.toScreen(st.vecTail), s, active.color, 2);
    else g.marker(active.marker, s, active.color, 9);
    g.crosshair(s, active.color);
  }
}

function drawCollect(g, S) {
  const c = st.collect;
  if (!c) return;
  const pts = c.pts.map(S);
  if (pts.length > 1)
    g.halo(() => {
      g.ctx.beginPath();
      pts.forEach((p, i) => (i ? g.ctx.lineTo(...p) : g.ctx.moveTo(...p)));
    }, g.C.tile2, 1.5);
  pts.forEach((p, i) => {
    g.dot(p, g.C.tile2, 5);
    g.label(String(i + 1), p[0] + 7, p[1] - 7, g.C.tile2);
  });
  if (st.provisional) g.crosshair(g.toScreen(st.provisional), g.C.tile2);
}

export { drawOverlays, handleList, AXIS_PX };
