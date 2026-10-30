// Crackler: Pure project file: pack the analysis into JSON, and read it back with validation.
// The video itself is never stored, only enough to recognise it and to repeat the same extraction.
import { defaultModel } from "./model.js";
import { KINDS, MARKERS } from "./tracks.js";

const FIT_TYPES = ["linear", "poly", "exp", "power", "custom"];
const AN_MODES = ["axes", "slope", "area", "fit"];

const VERSION = 1;

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const int = (v, d) => Math.round(num(v, d));
const str = (v, d = "") => (typeof v === "string" ? v : d);
const pt = (p) => Array.isArray(p) && p.length === 2 && p.every((q) => typeof q === "number" && Number.isFinite(q));

// ---------- plot analysis settings ----------
function defaultAnalysis() {
  return {
    mode: "axes", // axes | slope | area | fit
    series: 0,
    slopeKind: "tangent", // tangent | two
    k: 2, // neighbours on each side for the tangent
    slopeFrame: null,
    slopeA: null,
    slopeB: null,
    range: null, // [x0, x1] in plot units
    fit: { type: "linear", degree: 2, expr: "a*x^2+b*x+c", manual: false, values: {} },
  };
}
function cleanAnalysis(a) {
  const d = defaultAnalysis();
  if (!a || typeof a !== "object") return d;
  const f = a.fit && typeof a.fit === "object" ? a.fit : {};
  const frame = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const values = {};
  if (f.values && typeof f.values === "object")
    for (const [k, v] of Object.entries(f.values)) if (/^[A-Za-z_]\w{0,11}$/.test(k) && typeof v === "number" && Number.isFinite(v)) values[k] = v;
  return {
    mode: AN_MODES.includes(a.mode) ? a.mode : d.mode,
    series: Math.min(11, Math.max(0, int(a.series, 0))),
    slopeKind: a.slopeKind === "two" ? "two" : "tangent",
    k: Math.min(6, Math.max(1, int(a.k, 2))),
    slopeFrame: frame(a.slopeFrame),
    slopeA: frame(a.slopeA),
    slopeB: frame(a.slopeB),
    range: Array.isArray(a.range) && a.range.length === 2 && a.range.every((v) => typeof v === "number" && Number.isFinite(v)) && a.range[0] < a.range[1] ? [a.range[0], a.range[1]] : null,
    fit: {
      type: FIT_TYPES.includes(f.type) ? f.type : d.fit.type,
      degree: Math.min(6, Math.max(2, int(f.degree, 2))),
      expr: str(f.expr, d.fit.expr).slice(0, 200),
      manual: f.manual === true,
      values,
    },
  };
}

// ---------- overlays on the video ----------
function defaultOverlay() {
  return { v: false, a: false, f: false, trail: false, labels: true, stamp: false, sv: 1, sa: 1, sf: 1, trailLen: 0 };
}
function cleanOverlay(o) {
  const d = defaultOverlay();
  if (!o || typeof o !== "object") return d;
  const flag = (k) => (typeof o[k] === "boolean" ? o[k] : d[k]);
  const size = (k) => Math.min(8, Math.max(0.05, num(o[k], 1)));
  return {
    v: flag("v"),
    a: flag("a"),
    f: flag("f"),
    trail: flag("trail"),
    labels: flag("labels"),
    stamp: flag("stamp"),
    sv: size("sv"),
    sa: size("sa"),
    sf: size("sf"),
    trailLen: Math.min(1000, Math.max(0, int(o.trailLen, 0))),
  };
}

// video: { name, size, duration, frames, fps, width, height, extract }
function packProject({ video, clip, cal, tracks, active, settings, measures = [], custom = { defs: [], params: [] } }) {
  return {
    app: "crackler",
    version: VERSION,
    video,
    clip: { ...clip },
    calibration: JSON.parse(JSON.stringify(cal)),
    tracks: JSON.parse(JSON.stringify(tracks)),
    active,
    measures: JSON.parse(JSON.stringify(measures)),
    custom: JSON.parse(JSON.stringify(custom)),
    settings: { ...settings },
  };
}
function stringifyProject(p) {
  return JSON.stringify(p, null, 1);
}

// Model formulas and initial values of an analytic or dynamic particle.
function cleanModel(kind, m) {
  m = m && typeof m === "object" ? m : {};
  const d = defaultModel(kind);
  if (kind === "analytic") return { x: str(m.x).slice(0, 200), y: str(m.y).slice(0, 200) };
  const n = (v, def) => num(v, def);
  return {
    fx: str(m.fx).slice(0, 200),
    fy: str(m.fy).slice(0, 200),
    x0: n(m.x0, d.x0),
    y0: n(m.y0, d.y0),
    vx0: n(m.vx0, d.vx0),
    vy0: n(m.vy0, d.vy0),
    t0: n(m.t0, d.t0),
    method: m.method === "euler" ? "euler" : "rk4",
    dt: num(m.dt, d.dt) > 0 ? Math.max(1e-6, num(m.dt, d.dt)) : d.dt,
  };
}
const ids = (v) => (Array.isArray(v) ? v.filter((q) => Number.isInteger(q)).slice(0, 24) : []);
function cleanTrack(t, i) {
  const frames = (o) => {
    const out = {};
    for (const [k, p] of Object.entries(o && typeof o === "object" ? o : {})) if (/^\d+$/.test(k) && pt(p)) out[k] = [p[0], p[1]];
    return out;
  };
  return {
    id: int(t && t.id, i + 1),
    kind: KINDS.includes(t && t.kind) ? t.kind : "point",
    name: str(t && t.name, String.fromCharCode(65 + (i % 26))).slice(0, 12),
    color: /^#[0-9a-fA-F]{6}$/.test(t && t.color) ? t.color : "#E8344E",
    marker: MARKERS.includes(t && t.marker) ? t.marker : MARKERS[0],
    visible: !(t && t.visible === false),
    mass: Math.max(0, num(t && t.mass, 1)),
    points: frames(t && t.points),
    heads: frames(t && t.heads),
    tail: Number.isInteger(t && t.tail) ? t.tail : null,
    members: ids(t && t.members),
    model: (() => {
      const kind = KINDS.includes(t && t.kind) ? t.kind : "point";
      return kind === "analytic" || kind === "dynamic" ? cleanModel(kind, t && t.model) : null;
    })(),
  };
}
const points = (v, n) => (Array.isArray(v) && v.length === n && v.every(pt) ? v.map((p) => [...p]) : null);
function cleanCal(c) {
  c = c || {};
  const stick = c.stick && pt(c.stick.a) && pt(c.stick.b) ? { a: [...c.stick.a], b: [...c.stick.b] } : null;
  const l = c.lens || {};
  const lines = Array.isArray(l.lines)
    ? l.lines.map((ln) => (Array.isArray(ln) ? ln.filter(pt).map((p) => [...p]).slice(0, 40) : [])).filter((ln) => ln.length).slice(0, 8)
    : [];
  const quad = c.persp && points(c.persp.pts, 4);
  const cam = c.camera && Number.isInteger(c.camera.a) ? c.camera : null;
  return {
    width: Math.max(0, num(c.width, 0)),
    height: Math.max(0, num(c.height, 0)),
    stick,
    length: num(c.length, 1) > 0 ? num(c.length, 1) : 1,
    unit: str(c.unit, "m"),
    origin: pt(c.origin) ? [...c.origin] : [0, 0],
    angle: num(c.angle, 0),
    invertY: c.invertY === true,
    lens: { k1: Math.max(-2, Math.min(2, num(l.k1, 0))), k2: Math.max(-2, Math.min(2, num(l.k2, 0))), lines },
    persp: quad ? { pts: quad, w: Math.max(1e-9, num(c.persp.w, 1)), h: Math.max(1e-9, num(c.persp.h, 1)) } : null,
    camera: cam ? { a: cam.a, b: Number.isInteger(cam.b) ? cam.b : null, base: Math.max(0, int(cam.base, 0)) } : null,
  };
}
// Measuring tools: tape (2 points), protractor (vertex and two arm ends), circle (fit of a track's points).
function cleanMeasures(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list.slice(0, 12) : []) {
    if (!m || typeof m !== "object") continue;
    const base = { id: int(m.id, out.length + 1), name: str(m.name).slice(0, 12), color: /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : "#F5A623" };
    if (m.kind === "tape" && points(m.pts, 2)) out.push({ ...base, kind: "tape", pts: points(m.pts, 2) });
    else if (m.kind === "protractor" && points(m.pts, 3)) out.push({ ...base, kind: "protractor", pts: points(m.pts, 3) });
    else if (m.kind === "circle" && Number.isInteger(m.source))
      out.push({ ...base, kind: "circle", source: m.source, from: Number.isInteger(m.from) ? m.from : null, to: Number.isInteger(m.to) ? m.to : null });
  }
  return out;
}
// Custom table columns and their parameters.
function cleanCustom(c) {
  c = c && typeof c === "object" ? c : {};
  const defs = (Array.isArray(c.defs) ? c.defs : [])
    .slice(0, 16)
    .filter((d) => d && Number.isInteger(d.id) && typeof d.expr === "string")
    .map((d) => ({ id: d.id, name: str(d.name, "c" + d.id).slice(0, 16), expr: d.expr.slice(0, 200), unit: str(d.unit).slice(0, 16) }));
  const params = (Array.isArray(c.params) ? c.params : [])
    .slice(0, 16)
    .filter((p) => p && /^[A-Za-z_][A-Za-z_0-9]{0,11}$/.test(p.name) && typeof p.value === "number" && Number.isFinite(p.value))
    .map((p) => ({ name: p.name, value: p.value, unit: str(p.unit).slice(0, 16) }));
  return { defs, params };
}

// Returns { project } or { error: "json" | "format" | "version" }.
function parseProject(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return { error: "json" };
  }
  if (!d || d.app !== "crackler" || !Array.isArray(d.tracks)) return { error: "format" };
  if (num(d.version, 0) > VERSION || num(d.version, 0) < 1) return { error: "version" };
  const v = d.video || {},
    c = d.clip || {},
    s = d.settings || {},
    e = v.extract || null;
  const tracks = d.tracks.map(cleanTrack).slice(0, 24);
  return {
    project: {
      video: {
        name: str(v.name),
        size: num(v.size, 0),
        duration: num(v.duration, 0),
        frames: int(v.frames, 0),
        fps: num(v.fps, 0),
        width: int(v.width, 0),
        height: int(v.height, 0),
        extract: e && num(e.maxWidth, 0) > 0
          ? { start: num(e.start, 0), end: num(e.end, 0), maxWidth: int(e.maxWidth, 640), step: Math.max(1, int(e.step, 1)) }
          : null,
      },
      clip: {
        start: int(c.start, 0),
        end: int(c.end, 0),
        step: Math.max(1, int(c.step, 1)),
        fps: num(c.fps, 0) > 0 ? c.fps : null,
        tOffset: num(c.tOffset, 0),
        zero: int(c.zero, 0),
      },
      calibration: cleanCal(d.calibration),
      tracks: tracks.length ? tracks : [cleanTrack({}, 0)],
      measures: cleanMeasures(d.measures),
      custom: cleanCustom(d.custom),
      active: Math.min(Math.max(0, int(d.active, 0)), Math.max(0, tracks.length - 1)),
      settings: {
        smooth: Math.min(12, Math.max(1, int(s.smooth, 1))),
        autoAdvance: s.autoAdvance !== false,
        showMarks: s.showMarks !== false,
        cols: s.cols && typeof s.cols === "object" ? Object.fromEntries(Object.entries(s.cols).map(([k, x]) => [k, x === true])) : null,
        plot: s.plot && typeof s.plot === "object" ? s.plot : null,
        analysis: cleanAnalysis(s.analysis),
        overlay: cleanOverlay(s.overlay),
      },
    },
  };
}

export { VERSION, defaultOverlay, cleanOverlay, defaultAnalysis, cleanAnalysis, packProject, stringifyProject, parseProject };
