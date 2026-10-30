// Crackler: Pure formula parser for custom fits and columns. No eval, no Function: a small
// recursive-descent parser that compiles to closures.
// Syntax: numbers, names, + - * / ^ (right associative, -2^2 = -4), parentheses, "2x" for 2*x,
// functions sin cos tan asin acos atan atan2 sinh cosh tanh exp ln log (base 10) log10 sqrt abs
// sign floor ceil round min max pow hypot, constants pi and e.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  atan2: Math.atan2, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp,
  ln: Math.log, log: Math.log10, log10: Math.log10, sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max,
  pow: Math.pow, hypot: Math.hypot,
};
const CONSTS = { pi: Math.PI, e: Math.E };

class FormulaError extends Error {
  constructor(code, pos, detail = "") {
    super(code);
    this.code = code; // empty | unexpected | unclosed | unknownFunc | args | number
    this.pos = pos;
    this.detail = detail;
  }
}

// ---------- tokens ----------
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError("number", i);
      out.push({ t: "num", v: parseFloat(m[0]), pos: i });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i));
      out.push({ t: "id", v: m[0], pos: i });
      i += m[0].length;
    } else if ("+-*/^(),".includes(c)) {
      out.push({ t: c, pos: i });
      i++;
    } else if (c === "×" || c === "·") {
      out.push({ t: "*", pos: i });
      i++;
    } else if (c === "−") {
      out.push({ t: "-", pos: i });
      i++;
    } else throw new FormulaError("unexpected", i, c);
  }
  out.push({ t: "end", pos: src.length });
  return out;
}

// ---------- parser: produces closures (scope) => number ----------
function parse(src) {
  const toks = tokenize(src);
  let k = 0;
  const names = new Set();
  const peek = () => toks[k];
  const next = () => toks[k++];
  const expect = (t) => {
    if (peek().t !== t) throw new FormulaError(t === ")" ? "unclosed" : "unexpected", peek().pos, peek().t);
    return next();
  };

  function expr() {
    let l = term();
    while (peek().t === "+" || peek().t === "-") {
      const op = next().t,
        r = term(),
        a = l;
      l = op === "+" ? (s) => a(s) + r(s) : (s) => a(s) - r(s);
    }
    return l;
  }
  function term() {
    let l = unary();
    for (;;) {
      const t = peek();
      if (t.t === "*" || t.t === "/") {
        next();
        const r = unary(),
          a = l;
        l = t.t === "*" ? (s) => a(s) * r(s) : (s) => a(s) / r(s);
      } else if (isImplicit(t)) {
        // "2x", "3(x+1)": a number directly followed by a name or a bracket
        const r = unary(),
          a = l;
        l = (s) => a(s) * r(s);
      } else return l;
    }
  }
  const isImplicit = (t) => (t.t === "id" || t.t === "(") && toks[k - 1].t === "num";
  function unary() {
    if (peek().t === "-") {
      next();
      const a = unary();
      return (s) => -a(s);
    }
    if (peek().t === "+") {
      next();
      return unary();
    }
    return power();
  }
  function power() {
    const base = atom();
    if (peek().t === "^") {
      next();
      const e = unary(); // right associative, allows 2^-3
      return (s) => Math.pow(base(s), e(s));
    }
    return base;
  }
  function atom() {
    const t = next();
    if (t.t === "num") {
      const v = t.v;
      return () => v;
    }
    if (t.t === "(") {
      const e = expr();
      expect(")");
      return e;
    }
    if (t.t === "id") {
      if (peek().t === "(") {
        const f = FUNCS[t.v];
        if (!f) throw new FormulaError("unknownFunc", t.pos, t.v);
        next();
        const args = [];
        if (peek().t !== ")") {
          args.push(expr());
          while (peek().t === ",") {
            next();
            args.push(expr());
          }
        }
        expect(")");
        const fixed = { atan2: 2, pow: 2 };
        if (t.v in fixed && args.length !== fixed[t.v]) throw new FormulaError("args", t.pos, t.v);
        if (!(t.v in fixed) && !["min", "max", "hypot"].includes(t.v) && args.length !== 1)
          throw new FormulaError("args", t.pos, t.v);
        if (args.length === 0) throw new FormulaError("args", t.pos, t.v);
        return args.length === 1 ? (s) => f(args[0](s)) : (s) => f(...args.map((a) => a(s)));
      }
      if (t.v in CONSTS) {
        const v = CONSTS[t.v];
        return () => v;
      }
      names.add(t.v);
      const n = t.v;
      return (s) => s[n];
    }
    throw new FormulaError(t.t === "end" ? "empty" : "unexpected", t.pos, t.t);
  }

  if (peek().t === "end") throw new FormulaError("empty", 0);
  const f = expr();
  if (peek().t !== "end") throw new FormulaError("unexpected", peek().pos, peek().t);
  return { fn: f, names: [...names].sort() };
}

// Returns { ok: true, fn, names } or { ok: false, error: { code, pos, detail } }.
// fn takes a scope object, e.g. fn({ x: 2, a: 3 }).
function compile(src) {
  try {
    const r = parse(String(src));
    return { ok: true, fn: r.fn, names: r.names };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: { code: e.code, pos: e.pos, detail: e.detail } };
    throw e;
  }
}

export { compile, FormulaError, FUNCS, CONSTS };
