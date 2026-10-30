// Crackler: Pure models of motion: an analytic particle (x(t), y(t) from formulas) and a dynamic particle
// (force formulas, integrated with Euler or RK4). Everything is in world coordinates and clip time.
// Formulas use the same parser as custom columns; user parameters are available by name.
import { compile } from "./formula.js";

const MODEL_KINDS = ["analytic", "dynamic"];
const NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;

function defaultModel(kind) {
  if (kind === "analytic") return { x: "", y: "" };
  return { fx: "", fy: "", x0: 0, y0: 0, vx0: 0, vy0: 0, t0: 0, method: "rk4", dt: 0.001 };
}

// Ready-made examples. params are added to the project's parameters if missing.
const PRESETS = {
  fall: { label: "fall", fx: "0", fy: "-m*g", params: [{ name: "g", value: 9.81, unit: "m/s^2" }] },
  spring: { label: "spring", fx: "-k*x", fy: "0", params: [{ name: "k", value: 10, unit: "N/m" }] },
  drag: {
    label: "drag",
    fx: "-b*vx",
    fy: "-m*g-b*vy",
    params: [{ name: "g", value: 9.81, unit: "m/s^2" }, { name: "b", value: 0.5, unit: "kg/s" }],
  },
};

// ---------- compiling ----------
// field names a formula may use besides the parameters
const NAMES = { analytic: ["t"], dynamic: ["t", "x", "y", "vx", "vy", "m"] };
const FIELDS = { analytic: ["x", "y"], dynamic: ["fx", "fy"] };

// An empty formula means 0. Returns { ok, fns: { field: (scope) => number }, errors: { field: error } }.
function compileModel(kind, model, paramNames = []) {
  const allowed = new Set([...NAMES[kind], ...paramNames]);
  const fns = {},
    errors = {};
  for (const f of FIELDS[kind]) {
    const src = (model[f] || "").trim() === "" ? "0" : model[f];
    const c = compile(src);
    if (!c.ok) errors[f] = c.error;
    else {
      const unknown = c.names.find((n) => !allowed.has(n));
      if (unknown) errors[f] = { code: "unknownName", pos: 0, detail: unknown };
      else fns[f] = c.fn;
    }
  }
  if (kind === "dynamic") {
    if (!(model.dt > 0)) errors.dt = { code: "step", pos: 0, detail: "" };
  }
  return { ok: Object.keys(errors).length === 0, fns, errors };
}
function scopeOf(params) {
  const s = Object.create(null);
  for (const p of params) if (NAME.test(p.name) && Number.isFinite(p.value)) s[p.name] = p.value;
  return s;
}

// ---------- analytic particle ----------
// Positions and exact-enough velocities and accelerations (central differences of the formulas).
function evalAnalytic(fns, times, params = []) {
  const base = scopeOf(params),
    h = 1e-3;
  const at = (f, t) => {
    const s = Object.create(base);
    s.t = t;
    return f(s);
  };
  const out = { x: [], y: [], vx: [], vy: [], ax: [], ay: [] };
  for (const t of times) {
    for (const [k, f] of [["x", fns.x], ["y", fns.y]]) {
      const c = at(f, t),
        p = at(f, t + h),
        m = at(f, t - h);
      out[k].push(Number.isFinite(c) ? c : null);
      out["v" + k].push(Number.isFinite(p) && Number.isFinite(m) ? (p - m) / (2 * h) : null);
      out["a" + k].push(Number.isFinite(p) && Number.isFinite(m) && Number.isFinite(c) ? (p - 2 * c + m) / (h * h) : null);
    }
  }
  return out;
}

// ---------- dynamic particle ----------
// m a = F(t, x, y, vx, vy). Integrates from t0 in both directions to reach every requested time.
// opts: { fns, mass, params, x0, y0, vx0, vy0, t0, method: "euler" | "rk4", dt, times }
// Returns the same arrays as evalAnalytic; values after a divergence (non-finite force) are null.
function simulate(o) {
  const { fns, mass, method } = o;
  const base = scopeOf(o.params || []);
  const scope = Object.create(base);
  scope.m = base.m !== undefined ? base.m : mass;
  const acc = (t, x, y, vx, vy) => {
    scope.t = t;
    scope.x = x;
    scope.y = y;
    scope.vx = vx;
    scope.vy = vy;
    return [fns.fx(scope) / mass, fns.fy(scope) / mass];
  };
  const n = o.times.length;
  const out = { x: new Array(n).fill(null), y: new Array(n).fill(null), vx: new Array(n).fill(null), vy: new Array(n).fill(null), ax: new Array(n).fill(null), ay: new Array(n).fill(null) };
  if (!(mass > 0)) return out;
  const span = Math.max(0, ...o.times.map((t) => Math.abs(t - o.t0)));
  const dtMax = Math.max(o.dt, span / 400000); // never more than 400 000 steps per direction
  const finite = (...v) => v.every(Number.isFinite);

  const step = (s, h) => {
    if (method === "euler") {
      const [ax, ay] = acc(s.t, s.x, s.y, s.vx, s.vy);
      return { t: s.t + h, x: s.x + s.vx * h, y: s.y + s.vy * h, vx: s.vx + ax * h, vy: s.vy + ay * h };
    }
    // RK4 on (x, y, vx, vy)
    const f = (t, x, y, vx, vy) => {
      const [ax, ay] = acc(t, x, y, vx, vy);
      return [vx, vy, ax, ay];
    };
    const k1 = f(s.t, s.x, s.y, s.vx, s.vy);
    const k2 = f(s.t + h / 2, s.x + (h / 2) * k1[0], s.y + (h / 2) * k1[1], s.vx + (h / 2) * k1[2], s.vy + (h / 2) * k1[3]);
    const k3 = f(s.t + h / 2, s.x + (h / 2) * k2[0], s.y + (h / 2) * k2[1], s.vx + (h / 2) * k2[2], s.vy + (h / 2) * k2[3]);
    const k4 = f(s.t + h, s.x + h * k3[0], s.y + h * k3[1], s.vx + h * k3[2], s.vy + h * k3[3]);
    const w = (a, b, c, d) => (h / 6) * (a + 2 * b + 2 * c + d);
    return {
      t: s.t + h,
      x: s.x + w(k1[0], k2[0], k3[0], k4[0]),
      y: s.y + w(k1[1], k2[1], k3[1], k4[1]),
      vx: s.vx + w(k1[2], k2[2], k3[2], k4[2]),
      vy: s.vy + w(k1[3], k2[3], k3[3], k4[3]),
    };
  };
  const record = (i, s) => {
    const [ax, ay] = acc(s.t, s.x, s.y, s.vx, s.vy);
    if (!finite(s.x, s.y, s.vx, s.vy, ax, ay)) return false;
    out.x[i] = s.x;
    out.y[i] = s.y;
    out.vx[i] = s.vx;
    out.vy[i] = s.vy;
    out.ax[i] = ax;
    out.ay[i] = ay;
    return true;
  };
  // forward: times >= t0 ascending; backward: times < t0 descending
  const idx = o.times.map((t, i) => [t, i]);
  const runs = [
    idx.filter(([t]) => t >= o.t0).sort((a, b) => a[0] - b[0]),
    idx.filter(([t]) => t < o.t0).sort((a, b) => b[0] - a[0]),
  ];
  for (const run of runs) {
    let s = { t: o.t0, x: o.x0, y: o.y0, vx: o.vx0, vy: o.vy0 };
    for (const [T, i] of run) {
      const steps = Math.max(1, Math.ceil(Math.abs(T - s.t) / dtMax)),
        h = (T - s.t) / steps;
      let ok = true;
      if (Math.abs(T - s.t) > 0)
        for (let q = 0; q < steps; q++) {
          s = step(s, h);
          if (!finite(s.x, s.y, s.vx, s.vy)) {
            ok = false;
            break;
          }
        }
      s.t = T;
      if (!ok || !record(i, s)) break;
    }
  }
  return out;
}

export { MODEL_KINDS, PRESETS, defaultModel, compileModel, evalAnalytic, simulate };
