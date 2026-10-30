// Crackler: Pure list of quantities (labels, units) and the series built from them for tables and plots.
import { unitLabel } from "./calibration.js";
import { addCustom, keyOf } from "./custom.js";
import { trackSeries } from "./derive.js";

const GENERAL = ["n", "t"];
const MOTION = ["vx", "vy", "v", "ax", "ay", "a", "ek"];
const VECTOR = ["Vx", "Vy", "V", "Va"];
const PER_TRACK = ["x", "y", ...MOTION, ...VECTOR];
const ALL = [...GENERAL, ...PER_TRACK];

// Labels use the mathtext markup.
const LABELS = {
  n: "n", t: "t", x: "x", y: "y", vx: "v_x", vy: "v_y", v: "v", ax: "a_x", ay: "a_y", a: "a", ek: "E_k",
  Vx: "V_x", Vy: "V_y", V: "V", Va: "\\theta",
};
// Whether a quantity makes sense for a kind of track.
function appliesTo(kind, key) {
  if (key === "n" || key === "t" || key === "x" || key === "y" || key.startsWith("c:")) return true;
  return kind === "vector" || kind === "vsum" ? VECTOR.includes(key) : MOTION.includes(key);
}

// Custom columns: { id, name, expr, unit }. Everything below takes `custom` = { defs, params }.
const NO_CUSTOM = { defs: [], params: [] };
const allKeys = (custom = NO_CUSTOM) => [...ALL, ...custom.defs.map(keyOf)];
function label(key, custom = NO_CUSTOM) {
  if (key.startsWith("c:")) {
    const d = custom.defs.find((q) => keyOf(q) === key);
    return d ? d.name : key;
  }
  return LABELS[key];
}
function unitOf(key, cal, custom = NO_CUSTOM) {
  const u = unitLabel(cal);
  if (key.startsWith("c:")) {
    const d = custom.defs.find((q) => keyOf(q) === key);
    return d ? d.unit || "" : "";
  }
  if (key === "n") return "";
  if (key === "t") return "s";
  if (key === "x" || key === "y" || key === "Vx" || key === "Vy" || key === "V") return u;
  if (key === "Va") return "°";
  if (key === "vx" || key === "vy" || key === "v") return `${u}/s`;
  if (key === "ek") return u === "m" ? "J" : `kg·${u}^2/s^2`;
  return `${u}/s^2`;
}

// Series of every track, with custom columns added. Returns { list: [{ track, s }], errors }.
function seriesOfTracks({ tracks, cal, clip, timeOf, smooth, custom = NO_CUSTOM }) {
  const list = tracks.map((track) => ({ track, s: trackSeries(track, cal, clip, timeOf, smooth, tracks, custom.params) }));
  const { errors } = addCustom(list, custom.defs, custom.params);
  return { list, errors };
}

// One series per (track, y quantity): points { x, y, frame } where both values exist.
function plotSeries({ tracks, cal, clip, timeOf, smooth, xKey, yKeys, custom = NO_CUSTOM }) {
  const { list } = seriesOfTracks({ tracks, cal, clip, timeOf, smooth, custom });
  const out = [];
  for (const { track, s } of list) {
    if (!track.visible) continue;
    for (const yKey of yKeys) {
      const pts = [];
      if (appliesTo(track.kind, yKey) && appliesTo(track.kind, xKey))
        s.n.forEach((frame, i) => {
          const x = s[xKey] ? s[xKey][i] : null,
            y = s[yKey] ? s[yKey][i] : null;
          if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y, frame });
        });
      out.push({ track, yKey, pts });
    }
  }
  return out;
}

export { GENERAL, PER_TRACK, MOTION, VECTOR, ALL, NO_CUSTOM, allKeys, appliesTo, label, unitOf, seriesOfTracks, plotSeries };
