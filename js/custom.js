// Crackler: Pure custom table columns defined by formulas, with user parameters.
// A column's formula sees the quantities of its own track (t, x, y, vx, v, ax, a, ek, Vx, ...), the user
// parameters, earlier custom columns by name, and other tracks' quantities as key_TrackName (e.g. x_B).
import { compile } from "./formula.js";

const BUILTIN = ["n", "t", "x", "y", "vx", "vy", "v", "ax", "ay", "a", "ek", "Vx", "Vy", "V", "Va"];
const NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;
const RESERVED = new Set(["pi", "e", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "exp", "ln", "log", "log10", "sqrt", "abs", "sign", "floor", "ceil", "round", "min", "max", "pow", "hypot"]);
const keyOf = (def) => "c:" + def.id;
const word = (s) => String(s).replace(/[^A-Za-z0-9_]/g, "_");

// Why a parameter or column name cannot be used, or null if it can.
function nameProblem(name, taken = []) {
  if (!NAME.test(name)) return "syntax";
  if (BUILTIN.includes(name) || RESERVED.has(name)) return "reserved";
  if (taken.includes(name)) return "taken";
  return null;
}

// seriesList: [{ track, s }] where s comes from trackSeries (arrays aligned on s.n, the frames).
// defs: [{ id, name, expr, unit }]; params: [{ name, value }].
// Adds s["c:<id>"] arrays to every s. Returns { errors: { [id]: { code, pos, detail } } }.
function addCustom(seriesList, defs, params) {
  const errors = {};
  const pv = Object.create(null);
  for (const p of params) if (NAME.test(p.name) && Number.isFinite(p.value)) pv[p.name] = p.value;
  // lookup of other tracks' values by frame
  const byFrame = seriesList.map(({ track, s }) => ({ track, s, at: new Map(s.n.map((f, i) => [f, i])) }));
  const compiled = [];
  const earlier = [];
  for (const def of defs) {
    const c = compile(def.expr || "");
    if (!c.ok) errors[def.id] = c.error;
    else {
      const known = new Set([...BUILTIN, ...Object.keys(pv), ...earlier]);
      for (const o of seriesList) for (const k of BUILTIN) known.add(`${k}_${word(o.track.name)}`);
      const unknown = c.names.find((n) => !known.has(n));
      if (unknown) errors[def.id] = { code: "unknownName", pos: 0, detail: unknown };
    }
    compiled.push(errors[def.id] ? null : c);
    if (NAME.test(def.name)) earlier.push(def.name);
  }
  for (const { s, track } of byFrame) {
    const n = s.n.length;
    defs.forEach((def, di) => {
      s[keyOf(def)] = new Array(n).fill(null);
      const c = compiled[di];
      if (!c) return;
      for (let i = 0; i < n; i++) {
        const scope = Object.create(null);
        for (const k of BUILTIN) scope[k] = s[k] ? (s[k][i] == null ? NaN : s[k][i]) : NaN;
        Object.assign(scope, pv);
        for (const o of byFrame) {
          const j = o.at.get(s.n[i]); // the own track too, so x_A and x mean the same in A's column
          for (const k of BUILTIN) scope[`${k}_${word(o.track.name)}`] = j == null || o.s[k][j] == null ? NaN : o.s[k][j];
        }
        for (let q = 0; q < di; q++) {
          const prev = defs[q];
          if (NAME.test(prev.name) && s[keyOf(prev)]) scope[prev.name] = s[keyOf(prev)][i] == null ? NaN : s[keyOf(prev)][i];
        }
        const v = c.fn(scope);
        s[keyOf(def)][i] = Number.isFinite(v) ? v : null;
      }
    });
  }
  return { errors };
}

export { BUILTIN, keyOf, nameProblem, addCustom };
