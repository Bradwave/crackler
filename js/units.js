// Crackler: Pure unit algebra for results: slope = y unit / x unit, area = y unit · x unit.
// Units are strings like "m/s^2" or "kg·px^2/s^2". Output is in mathtext markup.

const ORDER = ["kg", "m", "cm", "mm", "km", "in", "ft", "px", "J", "N", "s"];

function parseUnit(str) {
  const u = {};
  if (!str) return u;
  const [num, ...den] = String(str).split("/");
  const add = (part, sign) => {
    for (const tok of part.split(/[·*\s()]+/).filter(Boolean)) {
      const m = /^([^\^]+)(?:\^\{?(-?\d+)\}?)?$/.exec(tok);
      if (!m) continue;
      const e = (m[2] ? parseInt(m[2], 10) : 1) * sign;
      u[m[1]] = (u[m[1]] || 0) + e;
      if (u[m[1]] === 0) delete u[m[1]];
    }
  };
  add(num, 1);
  for (const d of den) add(d, -1);
  return u;
}
function mul(a, b) {
  const u = { ...a };
  for (const [k, e] of Object.entries(b)) {
    u[k] = (u[k] || 0) + e;
    if (u[k] === 0) delete u[k];
  }
  return u;
}
function pow(a, n) {
  const u = {};
  for (const [k, e] of Object.entries(a)) if (e * n !== 0) u[k] = e * n;
  return u;
}
const div = (a, b) => mul(a, pow(b, -1));

function format(u) {
  const keys = Object.keys(u).sort((p, q) => {
    const i = ORDER.indexOf(p),
      j = ORDER.indexOf(q);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || (p < q ? -1 : 1);
  });
  const tok = (k, e) => (e === 1 ? k : e < 10 ? `${k}^${e}` : `${k}^{${e}}`);
  const top = keys.filter((k) => u[k] > 0).map((k) => tok(k, u[k]));
  const bot = keys.filter((k) => u[k] < 0).map((k) => tok(k, -u[k]));
  if (!top.length && !bot.length) return "";
  const num = top.length ? top.join("·") : "1";
  if (!bot.length) return num;
  return num + "/" + (bot.length > 1 ? `(${bot.join("·")})` : bot[0]);
}

// Convenience on strings.
const unitMul = (a, b) => format(mul(parseUnit(a), parseUnit(b)));
const unitDiv = (a, b) => format(div(parseUnit(a), parseUnit(b)));
const unitPow = (a, n) => format(pow(parseUnit(a), n));

export { parseUnit, mul, div, pow, format, unitMul, unitDiv, unitPow };
