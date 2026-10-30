// Crackler: Pure curve fitting: linear, polynomial, exponential, power law and custom formulas.
// Closed form where possible; Levenberg-Marquardt for the rest. Also R² and parameter uncertainties.
import { compile } from "./formula.js";
import { invert, solve } from "./linalg.js";
import { unitDiv, unitPow } from "./units.js";
import { fmt } from "./util.js";

const TYPES = ["linear", "poly", "exp", "power", "custom"];
const MAX_DEGREE = 6;

// ---------- models ----------
// Returns { names, labels, f(x, p), units(xUnit, yUnit) } or { error }.
function modelOf(spec) {
  const { type } = spec;
  if (type === "linear")
    return {
      names: ["m", "b"],
      labels: ["m", "b"],
      f: (x, p) => p[0] * x + p[1],
      units: (xu, yu) => [unitDiv(yu, xu), yu],
    };
  if (type === "poly") {
    const n = Math.min(MAX_DEGREE, Math.max(2, Math.round(spec.degree || 2)));
    const idx = Array.from({ length: n + 1 }, (_, k) => k);
    return {
      names: idx.map((k) => `a${k}`),
      labels: idx.map((k) => `a_${k}`),
      f: (x, p) => p.reduceRight((s, c) => s * x + c, 0),
      units: (xu, yu) => idx.map((k) => (k === 0 ? yu : unitDiv(yu, unitPow(xu, k)))),
      degree: n,
    };
  }
  if (type === "exp")
    return {
      names: ["A", "B"],
      labels: ["A", "B"],
      f: (x, p) => p[0] * Math.exp(p[1] * x),
      units: (xu, yu) => [yu, unitDiv("", xu)],
    };
  if (type === "power")
    return { names: ["A", "B"], labels: ["A", "B"], f: (x, p) => p[0] * Math.pow(x, p[1]), units: () => ["", ""] };
  if (type === "custom") {
    const c = compile(spec.expr || "");
    if (!c.ok) return { error: c.error };
    const names = c.names.filter((n) => n !== "x");
    const bad = c.names.find((n) => n.length > 12);
    if (bad) return { error: { code: "unexpected", pos: 0, detail: bad } };
    return {
      names,
      labels: names,
      f: (x, p) => {
        const s = Object.create(null); // no inherited names such as constructor
        s.x = x;
        for (let i = 0; i < names.length; i++) s[names[i]] = p[i];
        return c.fn(s);
      },
      units: () => names.map(() => ""),
    };
  }
  return { error: { code: "unexpected", pos: 0, detail: String(type) } };
}

// ---------- statistics ----------
function rSquared(ys, yhat) {
  const n = ys.length;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let ssr = 0,
    sst = 0;
  for (let i = 0; i < n; i++) {
    ssr += (ys[i] - yhat[i]) ** 2;
    sst += (ys[i] - my) ** 2;
  }
  return { sse: ssr, sst, r2: sst > 0 ? 1 - ssr / sst : NaN };
}

// ---------- closed form: polynomials ----------
// Ascending coefficients a0..an. x is scaled internally for conditioning.
function polyFit(xs, ys, deg) {
  const n = xs.length,
    p = deg + 1;
  let s = 0;
  for (const x of xs) s = Math.max(s, Math.abs(x));
  if (!(s > 0)) s = 1;
  const S = Array.from({ length: p }, () => new Array(p).fill(0)),
    T = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const u = xs[i] / s;
    const pw = [1];
    for (let k = 1; k < 2 * p; k++) pw.push(pw[k - 1] * u);
    for (let a = 0; a < p; a++) {
      T[a] += pw[a] * ys[i];
      for (let b = 0; b < p; b++) S[a][b] += pw[a + b];
    }
  }
  const inv = invert(S);
  if (!inv) return null;
  const c = inv.map((r) => r.reduce((sum, v, j) => sum + v * T[j], 0));
  return { coef: c.map((v, k) => v / Math.pow(s, k)), inv, s };
}

// ---------- Levenberg-Marquardt ----------
function lm(f, p0, xs, ys, { maxIter = 200 } = {}) {
  const n = xs.length,
    m = p0.length;
  let p = [...p0];
  const sse = (q) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const r = ys[i] - f(xs[i], q);
      if (!Number.isFinite(r)) return Infinity;
      s += r * r;
    }
    return s;
  };
  const jac = (q) => {
    const J = [];
    for (let i = 0; i < n; i++) J.push(new Array(m));
    for (let j = 0; j < m; j++) {
      const h = 1e-6 * (Math.abs(q[j]) + 1e-3);
      const qa = [...q],
        qb = [...q];
      qa[j] += h;
      qb[j] -= h;
      for (let i = 0; i < n; i++) J[i][j] = (f(xs[i], qa) - f(xs[i], qb)) / (2 * h);
    }
    return J;
  };
  let cur = sse(p),
    lambda = 1e-3,
    iter = 0,
    converged = false;
  if (!Number.isFinite(cur)) return { p, sse: Infinity, iterations: 0, converged: false };
  for (; iter < maxIter; iter++) {
    const J = jac(p);
    const A = Array.from({ length: m }, () => new Array(m).fill(0)),
      g = new Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      const r = ys[i] - f(xs[i], p);
      for (let a = 0; a < m; a++) {
        g[a] += J[i][a] * r;
        for (let b = 0; b < m; b++) A[a][b] += J[i][a] * J[i][b];
      }
    }
    let improved = false;
    for (let tries = 0; tries < 30; tries++) {
      const B = A.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (v || 1) : v)));
      const d = solve(B, g);
      if (d) {
        const q = p.map((v, a) => v + d[a]),
          s = sse(q);
        if (s < cur) {
          const rel = (cur - s) / (cur || 1);
          const step = Math.max(...d.map((v, a) => Math.abs(v) / (Math.abs(p[a]) + 1e-12)));
          p = q;
          cur = s;
          lambda = Math.max(lambda / 5, 1e-12);
          improved = true;
          if (rel < 1e-13 || step < 1e-10) converged = true;
          break;
        }
      }
      lambda *= 6;
    }
    if (!improved) {
      converged = true; // no step lowers the error any more
      break;
    }
    if (converged) break;
  }
  return { p, sse: cur, iterations: iter, converged: converged || cur === 0 };
}

// Parameter uncertainties from the covariance s² (JᵀJ)⁻¹.
function lmErrors(f, p, xs, ys, sse) {
  const n = xs.length,
    m = p.length;
  if (n <= m) return p.map(() => null);
  const J = xs.map((x) =>
    p.map((v, j) => {
      const h = 1e-6 * (Math.abs(v) + 1e-3);
      const qa = [...p],
        qb = [...p];
      qa[j] += h;
      qb[j] -= h;
      return (f(x, qa) - f(x, qb)) / (2 * h);
    }),
  );
  const A = p.map((_, a) => p.map((_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
  const inv = invert(A);
  if (!inv) return p.map(() => null);
  const s2 = sse / (n - m);
  return p.map((_, j) => (inv[j][j] * s2 >= 0 ? Math.sqrt(inv[j][j] * s2) : null));
}

// ---------- initial guesses ----------
function linearFit(xs, ys) {
  const r = polyFit(xs, ys, 1);
  return r ? [r.coef[1], r.coef[0]] : null;
}
function expGuess(xs, ys) {
  const sign = ys.every((y) => y > 0) ? 1 : ys.every((y) => y < 0) ? -1 : 0;
  if (sign) {
    const l = linearFit(xs, ys.map((y) => Math.log(sign * y)));
    if (l) return [sign * Math.exp(l[1]), l[0]];
  }
  return [ys.reduce((a, b) => a + b, 0) / ys.length || 1, 0.1];
}
function powerGuess(xs, ys) {
  if (xs.every((x) => x > 0) && ys.every((y) => y > 0)) {
    const l = linearFit(xs.map(Math.log), ys.map(Math.log));
    if (l) return [Math.exp(l[1]), l[0]];
  }
  return [1, 1];
}

// ---------- the main entry point ----------
// spec: { type, degree, expr }. p0: optional start values (custom, exp, power).
// Returns { ok, error, names, labels, params, errors, r2, sse, n, f, converged } (ok false with
// an error code: "formula", "points", "singular", "positive", "diverged").
function fit(spec, xs, ys, p0) {
  const model = modelOf(spec);
  if (model.error) return { ok: false, error: "formula", formula: model.error };
  const m = model.names.length,
    n = xs.length;
  const base = { names: model.names, labels: model.labels, n, f: null, units: model.units };
  if (m === 0) return { ok: false, error: "params", ...base };
  if (n < m) return { ok: false, error: "points", ...base };
  if (spec.type === "power" && !(xs.every((x) => x > 0) && ys.every((y) => y > 0)))
    return { ok: false, error: "positive", ...base };

  let params,
    errors,
    converged = true;
  if (spec.type === "linear" || spec.type === "poly") {
    const deg = spec.type === "linear" ? 1 : model.degree;
    const r = polyFit(xs, ys, deg);
    if (!r) return { ok: false, error: "singular", ...base };
    params = spec.type === "linear" ? [r.coef[1], r.coef[0]] : r.coef;
    const f = (x, p) => model.f(x, p);
    let sse = 0;
    for (let i = 0; i < n; i++) sse += (ys[i] - f(xs[i], params)) ** 2;
    const s2 = n > m ? sse / (n - m) : NaN;
    // covariance in the scaled variable, unscaled per coefficient
    errors = r.inv.map((row, k) => (n > m ? Math.sqrt(row[k] * s2) / Math.pow(r.s, k) : null));
    if (spec.type === "linear") errors = [errors[1], errors[0]];
  } else {
    let start = p0 && p0.length === m ? [...p0] : null;
    if (!start) start = spec.type === "exp" ? expGuess(xs, ys) : spec.type === "power" ? powerGuess(xs, ys) : new Array(m).fill(1);
    const r = lm(model.f, start, xs, ys);
    if (!Number.isFinite(r.sse)) return { ok: false, error: "diverged", ...base };
    params = r.p;
    converged = r.converged;
    errors = lmErrors(model.f, params, xs, ys, r.sse);
  }
  const yhat = xs.map((x) => model.f(x, params));
  const st = rSquared(ys, yhat);
  return { ok: true, ...base, f: (x) => model.f(x, params), params, errors, r2: st.r2, sse: st.sse, converged };
}

// Evaluates a model at given parameter values (manual mode): no fitting, same output shape.
function evaluate(spec, xs, ys, params) {
  const model = modelOf(spec);
  if (model.error) return { ok: false, error: "formula", formula: model.error };
  if (params.length !== model.names.length) return { ok: false, error: "params" };
  const yhat = xs.map((x) => model.f(x, params));
  if (yhat.some((v) => !Number.isFinite(v))) return { ok: false, error: "diverged", names: model.names, labels: model.labels, units: model.units, n: xs.length };
  const st = rSquared(ys, yhat);
  return {
    ok: true,
    names: model.names,
    labels: model.labels,
    units: model.units,
    n: xs.length,
    params,
    errors: params.map(() => null),
    r2: st.r2,
    sse: st.sse,
    converged: true,
    f: (x) => model.f(x, params),
  };
}

// ---------- text ----------
// The fitted equation in mathtext, using the plot's own names, e.g. "v_y = -9.81·t + 0.0123".
function equationText(spec, params, xName = "x", yName = "y") {
  const num = (v) => fmt(v, 4).replace("-", "−");
  const term = (v, body, first) => {
    const sign = v < 0 ? "−" : "+",
      mag = fmt(Math.abs(v), 4);
    const t = body ? `${mag}·${body}` : mag;
    return first ? (v < 0 ? "−" : "") + t : ` ${sign} ${t}`;
  };
  if (spec.type === "linear") return `${yName} = ${term(params[0], xName, true)}${term(params[1], "", false)}`;
  if (spec.type === "poly") {
    let out = `${yName} = `;
    for (let k = params.length - 1, first = true; k >= 0; k--) {
      out += term(params[k], k === 0 ? "" : k === 1 ? xName : `${xName}^${k}`, first);
      first = false;
    }
    return out;
  }
  if (spec.type === "exp") return `${yName} = ${num(params[0])}·e^{${num(params[1])}·${xName}}`;
  if (spec.type === "power") return `${yName} = ${num(params[0])}·${xName}^{${num(params[1])}}`;
  return `${yName} = ${spec.expr}`.replace(/\bx\b/g, xName);
}

export { TYPES, MAX_DEGREE, modelOf, fit, evaluate, rSquared, polyFit, lm, equationText };
