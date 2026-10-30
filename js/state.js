// Crackler: Application state, a tiny event bus, and the actions that change the state.
import { createCalibration, makeMapper } from "./calibration.js";
import { keyOf } from "./custom.js";
import { createClip, normalizeClip, snapFrame, stepFrame, timeOfFrame } from "./clip.js";
import { createHistory } from "./history.js";
import { defaultAnalysis, defaultOverlay, packProject, parseProject, stringifyProject } from "./project.js";
import { createTrack, removePoint, setPoint } from "./tracks.js";
import { clamp } from "./util.js";

// ---------- state ----------
const st = {
  src: null, // frame source (frames.js or frames-synthetic.js)
  clip: null,
  cal: createCalibration(),
  tracks: [],
  active: 0,
  frame: 0,
  playing: false,
  speed: 1,
  tool: "mark", // mark | calib | view
  calibStep: null, // null | stickA | stickB | origin
  pendingA: null, // first end of the stick while placing the second
  provisional: null, // point being placed (image px)
  autoAdvance: true,
  showMarks: true,
  smooth: 1, // half-width (points) of the derivative window
  cols: { n: true, t: true, x: true, y: true, vx: false, vy: false, v: false, ax: false, ay: false, a: false, ek: false },
  plot: { x: "t", y: ["y"], connect: false, auto: true, lim: [0, 1, 0, 1] },
  analysis: defaultAnalysis(),
  measures: [], // tape, protractor, circle fitter (see project.js)
  custom: { defs: [], params: [] }, // custom table columns and their parameters
  collect: null, // points being clicked for a perspective rectangle, a tape, a lens line ...
  vecTail: null, // first click of a vector whose tail is marked too
  auto: { half: 8, radius: 30, threshold: 0.8, adapt: false, dir: 1 }, // template matching settings
  overlay: defaultOverlay(), // arrows, trails, labels drawn on the video
  autoShow: false, // show the template and search boxes on the video
  rev: 0, // counts changes that affect computed series (for caches)
  pending: null, // a project waiting for its video
};
const history = createHistory(100);

// ---------- events ----------
// source, frame, clip, calib, tracks, tool, play, lang, cols, history, settings
const handlers = {};
function on(evt, fn) {
  (handlers[evt] ||= []).push(fn);
}
function emit(evt) {
  if (evt === "calib" || evt === "tracks" || evt === "source") mapperCache = null;
  if (evt === "calib" || evt === "tracks" || evt === "source" || evt === "clip" || evt === "settings") st.rev++;
  (handlers[evt] || []).forEach((fn) => fn());
}
// Pixel <-> world conversion for the current calibration and tracks (rebuilt when they change).
let mapperCache = null;
const mapper = () => (mapperCache ||= makeMapper(st.cal, st.tracks));

// ---------- queries ----------
const track = () => st.tracks[st.active];
const timeAt = (n) => timeOfFrame(st.clip, (k) => st.src.timeOf(k), n);

// ---------- undo and redo ----------
// What undo covers: clip, calibration, tracks, the smoothing, and the fit and range chosen on the plot.
// Not the view: which tabs and tools are open, the plot axes, what is selected on the plot.
const snapshot = () =>
  JSON.stringify({
    clip: st.clip,
    cal: st.cal,
    tracks: st.tracks,
    active: st.active,
    smooth: st.smooth,
    range: st.analysis.range,
    fit: st.analysis.fit,
    measures: st.measures,
    custom: st.custom,
  });
function checkpoint(key = null) {
  if (!st.src) return;
  if (history.push(snapshot(), key)) emit("history");
}
function restore(s) {
  const d = JSON.parse(s);
  st.clip = normalizeClip(d.clip, st.src.frameCount);
  st.cal = d.cal;
  st.tracks = d.tracks;
  st.active = Math.min(d.active, d.tracks.length - 1);
  st.frame = snapFrame(st.clip, st.frame);
  if (d.smooth) st.smooth = d.smooth;
  if ("range" in d) st.analysis.range = d.range;
  if (d.fit) st.analysis.fit = d.fit;
  if (d.measures) st.measures = d.measures;
  if (d.custom) st.custom = d.custom;
  for (const e of ["clip", "calib", "tracks", "frame", "history", "settings"]) emit(e);
}
function undo() {
  const s = history.undo();
  if (s) restore(s);
}
function redo() {
  const s = history.redo();
  if (s) restore(s);
}
const canUndo = () => history.canUndo;
const canRedo = () => history.canRedo;

// ---------- source and project ----------
function resetAnalysis(src) {
  st.src = src;
  st.clip = createClip(src.frameCount);
  st.cal = createCalibration(src.width, src.height);
  st.tracks = [createTrack(1)];
  st.active = 0;
  st.frame = 0;
  st.playing = false;
  st.tool = "mark";
  st.calibStep = null;
  st.pendingA = null;
  st.provisional = null;
  st.analysis = defaultAnalysis();
  st.measures = [];
  st.custom = { defs: [], params: [] };
  st.collect = null;
  st.vecTail = null;
}
function emitAll() {
  for (const e of ["source", "tool", "calib", "clip", "tracks", "frame", "history", "settings"]) emit(e);
}
// Returns "applied" or "mismatch" if a project was waiting for this video, else null.
function setSource(src) {
  if (st.src && st.src !== src) st.src.dispose();
  resetAnalysis(src);
  let result = null;
  if (st.pending) {
    if (projectFits(st.pending)) {
      applyProject(st.pending);
      result = "applied";
    } else result = "mismatch";
    st.pending = null;
  }
  history.reset(snapshot());
  emitAll();
  return result;
}
const projectFits = (p) => !!st.src && p.video.frames === st.src.frameCount;
function applyProject(p) {
  st.clip = normalizeClip({ ...p.clip }, st.src.frameCount);
  st.cal = p.calibration;
  st.tracks = p.tracks;
  st.active = p.active;
  st.smooth = p.settings.smooth;
  st.autoAdvance = p.settings.autoAdvance;
  st.showMarks = p.settings.showMarks;
  if (p.settings.cols) st.cols = { ...st.cols, ...p.settings.cols };
  if (p.settings.plot) Object.assign(st.plot, sanitizePlot(p.settings.plot));
  st.analysis = p.settings.analysis;
  st.overlay = p.settings.overlay;
  st.measures = p.measures;
  st.custom = p.custom;
  for (const d of p.custom.defs) if (!(keyOf(d) in st.cols)) st.cols[keyOf(d)] = true;
  st.frame = snapFrame(st.clip, st.clip.start);
}
function sanitizePlot(p) {
  const out = {};
  if (typeof p.x === "string") out.x = p.x;
  if (Array.isArray(p.y)) out.y = p.y.filter((k) => typeof k === "string").slice(0, 6);
  if (typeof p.connect === "boolean") out.connect = p.connect;
  if (typeof p.auto === "boolean") out.auto = p.auto;
  if (Array.isArray(p.lim) && p.lim.length === 4 && p.lim.every(Number.isFinite)) out.lim = p.lim;
  return out;
}
// The project as JSON text, ready to save.
function projectText() {
  const s = st.src,
    i = s.info || {};
  return stringifyProject(
    packProject({
      video: {
        name: i.name || "",
        size: i.size || 0,
        duration: i.duration || 0,
        frames: s.frameCount,
        fps: s.fps,
        width: s.width,
        height: s.height,
        extract: i.extract || null,
      },
      clip: st.clip,
      cal: st.cal,
      tracks: st.tracks,
      active: st.active,
      measures: st.measures,
      custom: st.custom,
      settings: {
        smooth: st.smooth,
        autoAdvance: st.autoAdvance,
        showMarks: st.showMarks,
        cols: st.cols,
        plot: st.plot,
        analysis: st.analysis,
        overlay: st.overlay,
      },
    }),
  );
}
// Reads a project file. Returns { error } or { project, applied }; when the video does not match
// (or none is open) the project is kept in st.pending until the right video is opened.
function loadProjectText(text) {
  const r = parseProject(text);
  if (r.error) return r;
  if (st.src && projectFits(r.project)) {
    applyProject(r.project);
    st.pending = null;
    history.reset(snapshot());
    emitAll();
    return { project: r.project, applied: true };
  }
  st.pending = r.project;
  emit("settings");
  return { project: r.project, applied: false };
}

// ---------- actions ----------
function gotoFrame(n) {
  if (!st.src) return;
  n = snapFrame(st.clip, clamp(Math.round(n), 0, st.src.frameCount - 1));
  if (n === st.frame) return;
  st.frame = n;
  st.vecTail = null;
  emit("frame");
}
function stepBy(k) {
  if (!st.src) return false;
  const n = stepFrame(st.clip, st.frame, k);
  if (n === st.frame) return false;
  st.frame = n;
  st.vecTail = null;
  emit("frame");
  return true;
}
function updateClip(patch) {
  Object.assign(st.clip, patch);
  normalizeClip(st.clip, st.src.frameCount);
  st.frame = snapFrame(st.clip, st.frame);
  emit("clip");
  emit("frame");
  checkpoint("clip");
}
function setTool(tool, step = null) {
  st.tool = tool;
  st.collect = null;
  st.vecTail = null;
  st.calibStep = tool === "calib" ? step : null;
  if (!st.calibStep) st.pendingA = null;
  st.provisional = null;
  emit("tool");
}
// Calibration changed: pass a key for continuous changes (sliders, typing) so undo treats them as one step.
function touchCal(key = null) {
  emit("calib");
  checkpoint(key);
}
// Marks the active track at the current frame. Returns false for computed tracks (centre of mass, sum).
// A vector with its own tail takes two clicks: tail, then head.
function markPoint(p) {
  const tr = track();
  if (tr.kind === "vector") {
    if (tr.tail == null) {
      if (!st.vecTail) {
        st.vecTail = p;
        emit("tracks");
        return true;
      }
      setPoint(tr, st.frame, st.vecTail);
      st.vecTail = null;
    }
    tr.heads[st.frame] = [p[0], p[1]];
  } else if (tr.kind === "point") setPoint(tr, st.frame, p);
  else return false;
  emit("tracks");
  checkpoint();
  if (st.autoAdvance) stepBy(1);
  else emit("frame");
  return true;
}
function deletePoint() {
  if (!st.src) return;
  removePoint(track(), st.frame);
  emit("tracks");
  checkpoint();
}
function clearPoints() {
  track().points = {};
  track().heads = {};
  emit("tracks");
  checkpoint();
}

// ---------- tracks ----------
const MAX_TRACKS = 12;
function addTrack(kind = "point") {
  if (st.tracks.length >= MAX_TRACKS) return false;
  const id = Math.max(0, ...st.tracks.map((t) => t.id)) + 1;
  const opts = { kind };
  // a computed track starts with everything of its kind that already exists
  if (kind === "cm") opts.members = st.tracks.filter((t) => t.kind === "point").map((t) => t.id);
  if (kind === "vsum") opts.members = st.tracks.filter((t) => t.kind === "vector").map((t) => t.id);
  const t = createTrack(id, opts);
  if (kind !== "point")
    t.name = { cm: "CM", vector: "F" + st.tracks.filter((q) => q.kind === "vector").length, vsum: "ΣF", analytic: "mod", dynamic: "sim" }[kind];
  st.tracks.push(t);
  st.active = st.tracks.length - 1;
  emit("tracks");
  checkpoint();
  return true;
}
// Drops every reference to a track that is going away.
function dropRefs(id) {
  for (const t of st.tracks) {
    t.members = t.members.filter((m) => m !== id);
    if (t.tail === id) t.tail = null;
  }
  if (st.cal.camera && (st.cal.camera.a === id || st.cal.camera.b === id)) {
    if (st.cal.camera.a === id) st.cal.camera = null;
    else st.cal.camera.b = null;
  }
  st.measures = st.measures.filter((m) => m.source !== id);
}
function removeTrack(i) {
  const gone = st.tracks[i].id;
  if (st.tracks.length <= 1) {
    st.tracks[0] = createTrack(st.tracks[0].id);
  } else {
    st.tracks.splice(i, 1);
    st.active = Math.min(st.active, st.tracks.length - 1);
  }
  dropRefs(gone);
  emit("calib");
  emit("tracks");
  checkpoint();
}
function selectTrack(i) {
  st.active = clamp(i, 0, st.tracks.length - 1);
  emit("tracks");
}
function editTrack(patch, key = null, i = st.active) {
  Object.assign(st.tracks[i], patch);
  emit("tracks");
  checkpoint(key);
}
// Changes the formulas or initial values of a model track.
function editModel(patch, key = null, i = st.active) {
  Object.assign(st.tracks[i].model, patch);
  emit("tracks");
  checkpoint(key);
}
// Overlay options (arrows, trails, labels) are view settings: not part of undo.
function setOverlay(patch) {
  Object.assign(st.overlay, patch);
  emit("settings");
}

// ---------- measuring tools ----------
function nextId(list) {
  return Math.max(0, ...list.map((m) => m.id)) + 1;
}
function addMeasure(m) {
  if (st.measures.length >= 12) return null;
  const full = { id: nextId(st.measures), name: "", color: "#F5A623", ...m };
  st.measures.push(full);
  emit("tracks");
  checkpoint();
  return full;
}
function removeMeasure(id) {
  st.measures = st.measures.filter((m) => m.id !== id);
  emit("tracks");
  checkpoint();
}
function editMeasure(id, patch, key = null) {
  Object.assign(st.measures.find((m) => m.id === id), patch);
  emit("tracks");
  checkpoint(key);
}

// ---------- clicking several points (rectangle corners, tape ends, lens lines ...) ----------
// kind names what is being placed; need: number of clicks (0 = until finishCollect); done(points) is called.
function startCollect(kind, need, done) {
  st.collect = { kind, need, pts: [], done };
  st.tool = "collect";
  st.calibStep = null;
  st.pendingA = null;
  st.provisional = null;
  emit("tool");
}
function addCollected(p) {
  const c = st.collect;
  if (!c) return;
  c.pts.push([p[0], p[1]]);
  if (c.need && c.pts.length >= c.need) finishCollect();
  else emit("tool");
}
function finishCollect(cancel = false) {
  const c = st.collect;
  if (!c) return;
  st.collect = null;
  st.tool = "calib";
  if (!cancel && c.pts.length) c.done(c.pts);
  emit("tool");
  emit("calib");
}

// ---------- custom columns and parameters ----------
function addParam() {
  let k = st.custom.params.length + 1;
  const names = st.custom.params.map((p) => p.name);
  while (names.includes("p" + k)) k++;
  st.custom.params.push({ name: "p" + k, value: 1, unit: "" });
  emit("settings");
  checkpoint();
}
function editParam(i, patch, key = null) {
  Object.assign(st.custom.params[i], patch);
  emit("settings");
  checkpoint(key);
}
function removeParam(i) {
  st.custom.params.splice(i, 1);
  emit("settings");
  checkpoint();
}
// Adds the parameters of an example that are not there yet (by name).
function ensureParams(list) {
  let added = false;
  for (const p of list)
    if (!st.custom.params.some((q) => q.name === p.name)) {
      st.custom.params.push({ ...p });
      added = true;
    }
  if (added) {
    emit("settings");
    checkpoint();
  }
}
function addDef(def = {}) {
  if (st.custom.defs.length >= 16) return null;
  const id = nextId(st.custom.defs);
  const d = { id, name: "c" + id, expr: "", unit: "", ...def };
  st.custom.defs.push(d);
  st.cols[keyOf(d)] = true;
  emit("settings");
  checkpoint();
  return d;
}
function editDef(i, patch, key = null) {
  Object.assign(st.custom.defs[i], patch);
  emit("settings");
  checkpoint(key);
}
function removeDef(i) {
  const [d] = st.custom.defs.splice(i, 1);
  delete st.cols[keyOf(d)];
  emit("settings");
  checkpoint();
}

function setSetting(patch) {
  Object.assign(st, patch);
  emit("settings");
  checkpoint("s:" + Object.keys(patch).join());
}
// Changes to the plot analysis tools (slope, area, fit). fit is merged one level down.
function setAnalysis(patch) {
  const { fit, ...rest } = patch;
  Object.assign(st.analysis, rest);
  if (fit) Object.assign(st.analysis.fit, fit);
  emit("settings");
  checkpoint("a:" + Object.keys(patch).join());
}

export {
  st,
  on,
  emit,
  track,
  timeAt,
  checkpoint,
  undo,
  redo,
  canUndo,
  canRedo,
  setSource,
  projectText,
  loadProjectText,
  gotoFrame,
  stepBy,
  updateClip,
  setTool,
  markPoint,
  deletePoint,
  clearPoints,
  touchCal,
  addTrack,
  removeTrack,
  selectTrack,
  editTrack,
  setSetting,
  setAnalysis,
  editModel,
  setOverlay,
  mapper,
  addMeasure,
  removeMeasure,
  editMeasure,
  startCollect,
  addCollected,
  finishCollect,
  ensureParams,
  addParam,
  editParam,
  removeParam,
  addDef,
  editDef,
  removeDef,
  MAX_TRACKS,
};
