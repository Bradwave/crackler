// Crackler: Tiny maths markup: v_x, a_{xy}, m/s^2, \theta. Renders to HTML, SVG, plain text and canvas.
// No dependencies; this is not LaTeX, only subscripts, superscripts and Greek letters.

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Sigma: "Σ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

// ---------- parsing ----------
// Returns [{ t: text, m: "" | "sub" | "sup" }].
function parse(src) {
  const out = [];
  const s = String(src);
  const push = (t, m) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.m === m) last.t += t;
    else out.push({ t, m });
  };
  const readGroup = (i) => {
    // reads {...} or a single token after _ or ^; returns [text, nextIndex]
    if (s[i] === "{") {
      const j = s.indexOf("}", i);
      const end = j < 0 ? s.length : j;
      return [s.slice(i + 1, end), end + 1];
    }
    if (s[i] === "\\") {
      const m = /^\\[A-Za-z]+/.exec(s.slice(i));
      return m ? [m[0], i + m[0].length] : [s[i] ?? "", i + 1];
    }
    if (i >= s.length) return ["", i];
    return [s[i], i + 1];
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "_" || c === "^") {
      const [g, j] = readGroup(i + 1);
      push(greek(g), c === "_" ? "sub" : "sup");
      i = j;
    } else if (c === "\\") {
      const m = /^\\([A-Za-z]+)/.exec(s.slice(i));
      if (m) {
        push(GREEK[m[1]] ?? m[0], "");
        i += m[0].length;
      } else {
        push(c, "");
        i++;
      }
    } else {
      push(c, "");
      i++;
    }
  }
  return out;
}
function greek(g) {
  return g.replace(/\\([A-Za-z]+)/g, (m, n) => GREEK[n] ?? m);
}

// ---------- renderers ----------
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function toHTML(src) {
  return parse(src)
    .map((p) => (p.m ? `<${p.m}>${esc(p.t)}</${p.m}>` : esc(p.t)))
    .join("");
}
function toSVG(src, size = 11) {
  const small = Math.round(size * 0.72);
  return parse(src)
    .map((p) =>
      p.m
        ? `<tspan baseline-shift="${p.m === "sub" ? "sub" : "super"}" font-size="${small}">${esc(p.t)}</tspan>`
        : esc(p.t),
    )
    .join("");
}
// "v_x" -> "v_x", "\theta" -> "θ": readable in CSV headers and aria-labels.
function plain(src) {
  return parse(src)
    .map((p) => (p.m === "sub" ? "_" + p.t : p.m === "sup" ? "^" + p.t : p.t))
    .join("");
}

// ---------- canvas ----------
// opts: size (px), weight, family, align ("left" | "center" | "right"), color
const FAMILY = '"Space Mono", ui-monospace, Menlo, Consolas, monospace';
function fontOf(opts, px) {
  return `${opts.weight || 400} ${px}px ${opts.family || FAMILY}`;
}
function measureMath(ctx, src, opts = {}) {
  const size = opts.size || 12;
  let w = 0;
  for (const p of parse(src)) {
    ctx.font = fontOf(opts, p.m ? size * 0.72 : size);
    w += ctx.measureText(p.t).width;
  }
  return w;
}
// Draws at (x, y) on the text baseline; returns the width.
function drawMath(ctx, src, x, y, opts = {}) {
  const size = opts.size || 12,
    total = measureMath(ctx, src, opts);
  let cx = x;
  if (opts.align === "center") cx = x - total / 2;
  else if (opts.align === "right") cx = x - total;
  const startX = cx;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const p of parse(src)) {
    ctx.font = fontOf(opts, p.m ? size * 0.72 : size);
    const dy = p.m === "sub" ? size * 0.22 : p.m === "sup" ? -size * 0.4 : 0;
    if (opts.halo) {
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = opts.halo;
      ctx.strokeText(p.t, cx, y + dy);
    }
    if (opts.color) ctx.fillStyle = opts.color;
    ctx.fillText(p.t, cx, y + dy);
    cx += ctx.measureText(p.t).width;
  }
  return cx - startX;
}

export { parse, toHTML, toSVG, plain, measureMath, drawMath, GREEK };
