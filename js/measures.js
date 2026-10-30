// Crackler: Pure results of the measuring tools: tape length, protractor angle, circle fit.
import { angleAt, fitCircle } from "./circle.js";
import { frameList } from "./clip.js";
import { worldPoints } from "./tracks.js";

// m: a measure ({ kind, pts | source, from, to }); mapper: from makeMapper; tracks: all tracks.
// Returns an object of numbers in world units / degrees, or null if it cannot be computed.
// Tape and protractor points live in the base-frame image, so they are mapped at the base frame.
function evalMeasure(m, mapper, tracks, clip, baseFrame = 0) {
  if (m.kind === "tape") {
    const a = mapper.map(m.pts[0], baseFrame),
      b = mapper.map(m.pts[1], baseFrame);
    return a && b ? { length: Math.hypot(b[0] - a[0], b[1] - a[1]), dx: b[0] - a[0], dy: b[1] - a[1] } : null;
  }
  if (m.kind === "protractor") {
    const w = m.pts.map((p) => mapper.map(p, baseFrame));
    if (w.some((q) => !q)) return null;
    const rad = angleAt(w[0], w[1], w[2]);
    return rad == null ? null : { degrees: (rad * 180) / Math.PI };
  }
  if (m.kind === "circle") {
    const tr = tracks.find((t) => t.id === m.source);
    if (!tr) return null;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const frames = frameList(clip).filter((f) => (m.from == null || f >= m.from) && (m.to == null || f <= m.to));
    const pts = worldPoints(tr, (p, f) => mapper.map(p, f), byId, frames);
    const c = fitCircle(pts.map((e) => [e.x, e.y]));
    return c ? { cx: c.cx, cy: c.cy, r: c.r, rms: c.rms, n: pts.length } : null;
  }
  return null;
}

export { evalMeasure };
