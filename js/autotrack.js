// Crackler: Pure template matching for automatic tracking, on grey-level images (Float32Array).
// Zero-mean normalised cross-correlation (NCC): insensitive to brightness and contrast changes.

// RGBA bytes (ImageData.data) -> luminance.
function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  return g;
}

// Copy of the (2r+1)×(2r+1) window centred on (cx, cy) (rounded); null if it does not fit in the image.
function cutTemplate(gray, w, h, cx, cy, r) {
  const x0 = Math.round(cx) - r,
    y0 = Math.round(cy) - r,
    s = 2 * r + 1;
  if (x0 < 0 || y0 < 0 || x0 + s > w || y0 + s > h) return null;
  const t = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) t[y * s + x] = gray[(y0 + y) * w + x0 + x];
  return { data: t, size: s, r };
}

// Prepares a template once: zero mean, and its norm.
function prepare(tpl) {
  const n = tpl.data.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += tpl.data[i];
  m /= n;
  const z = new Float32Array(n);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    z[i] = tpl.data[i] - m;
    ss += z[i] * z[i];
  }
  return { ...tpl, z, norm: Math.sqrt(ss) };
}

// Best match of the prepared template near (px, py): search window of ± radius pixels around that point.
// Returns { x, y, score } (centre of the match, sub-pixel) or null if the search window is outside the image.
function match(gray, w, h, tpl, px, py, radius) {
  const r = tpl.r,
    s = tpl.size,
    n = s * s;
  const cx0 = Math.round(px),
    cy0 = Math.round(py);
  const xa = Math.max(r, cx0 - radius),
    xb = Math.min(w - 1 - r, cx0 + radius),
    ya = Math.max(r, cy0 - radius),
    yb = Math.min(h - 1 - r, cy0 + radius);
  if (xb < xa || yb < ya || !(tpl.norm > 0)) return null;
  const W = xb - xa + 1,
    H = yb - ya + 1,
    score = new Float32Array(W * H);
  let best = -2,
    bx = xa,
    by = ya;
  for (let cy = ya; cy <= yb; cy++) {
    for (let cx = xa; cx <= xb; cx++) {
      let sum = 0,
        sq = 0,
        dot = 0;
      for (let y = 0; y < s; y++) {
        const row = (cy - r + y) * w + cx - r;
        for (let x = 0; x < s; x++) {
          const v = gray[row + x];
          sum += v;
          sq += v * v;
          dot += v * tpl.z[y * s + x];
        }
      }
      const varr = sq - (sum * sum) / n,
        sc = varr > 1e-9 ? dot / (Math.sqrt(varr) * tpl.norm) : 0;
      score[(cy - ya) * W + (cx - xa)] = sc;
      if (sc > best) {
        best = sc;
        bx = cx;
        by = cy;
      }
    }
  }
  // sub-pixel peak: a parabola through the logarithms of three scores (a Gaussian peak), else a plain parabola
  const at = (x, y) => (x < xa || x > xb || y < ya || y > yb ? null : score[(y - ya) * W + (x - xa)]);
  const peak = (m, c, p) => {
    if (m == null || p == null) return 0;
    if (m > 1e-6 && c > 1e-6 && p > 1e-6) {
      const lm = Math.log(m),
        lc = Math.log(c),
        lp = Math.log(p),
        d = lm - 2 * lc + lp;
      if (d < -1e-9) return Math.max(-0.5, Math.min(0.5, (0.5 * (lm - lp)) / d));
    }
    const d = m - 2 * c + p;
    return d < -1e-9 ? Math.max(-0.5, Math.min(0.5, (0.5 * (m - p)) / d)) : 0;
  };
  const sx = peak(at(bx - 1, by), best, at(bx + 1, by)),
    sy = peak(at(bx, by - 1), best, at(bx, by + 1));
  return { x: bx + sx, y: by + sy, score: best };
}

export { toGray, cutTemplate, prepare, match };
