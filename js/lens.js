// Crackler: Pure radial lens model r_d = r_u (1 + k1 r_u² + k2 r_u⁴), and estimating k1 from straight lines.
// Radii are measured from the lens centre and divided by `norm` (half the image diagonal), so k1 does not
// depend on the resolution. Applied to coordinates only, never to the video.

// Lens parameters for an image of the given size; centre and norm default to the image centre.
function lensFor(k1, k2, w, h) {
  return { k1, k2, cx: w / 2, cy: h / 2, norm: Math.hypot(w, h) / 2 };
}
const isIdentity = (l) => !l || (!l.k1 && !l.k2) || !(l.norm > 0);

// Ideal (undistorted) point -> where the lens puts it.
function distort(l, p) {
  if (isIdentity(l)) return [p[0], p[1]];
  const dx = p[0] - l.cx,
    dy = p[1] - l.cy,
    r = Math.hypot(dx, dy) / l.norm,
    f = 1 + l.k1 * r * r + l.k2 * r ** 4;
  return [l.cx + dx * f, l.cy + dy * f];
}
// Observed point -> ideal point, by Newton's method on r. Null if the model has no solution there
// (strong barrel distortion folds back beyond a certain radius).
function undistort(l, p) {
  if (isIdentity(l)) return [p[0], p[1]];
  const dx = p[0] - l.cx,
    dy = p[1] - l.cy,
    rd = Math.hypot(dx, dy) / l.norm;
  if (rd === 0) return [p[0], p[1]];
  let r = rd;
  for (let i = 0; i < 40; i++) {
    const g = r * (1 + l.k1 * r * r + l.k2 * r ** 4) - rd,
      dg = 1 + 3 * l.k1 * r * r + 5 * l.k2 * r ** 4;
    if (!(dg > 1e-9)) return null;
    const step = g / dg;
    r -= step;
    if (!Number.isFinite(r) || r < 0) return null;
    if (Math.abs(step) < 1e-13) break;
  }
  // r is the undistorted radius; check it really maps back to rd
  const back = r * (1 + l.k1 * r * r + l.k2 * r ** 4);
  if (Math.abs(back - rd) > 1e-6 * Math.max(1, rd)) return null;
  const s = r / rd;
  return [l.cx + dx * s, l.cy + dy * s];
}

// ---------- estimating k1 from lines that should be straight ----------
// Sum of squared perpendicular distances of the points to their best straight line (total least squares).
function lineScatter(pts) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n,
    my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (const p of pts) {
    sxx += (p[0] - mx) ** 2;
    sxy += (p[0] - mx) * (p[1] - my);
    syy += (p[1] - my) ** 2;
  }
  const tr = sxx + syy,
    det = sxx * syy - sxy * sxy;
  return (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2;
}
// Total straightness error for a lens: sum over the lines; Infinity if a point cannot be undistorted.
function straightness(lines, l) {
  let total = 0,
    count = 0;
  for (const line of lines) {
    const u = [];
    for (const p of line) {
      const q = undistort(l, p);
      if (!q) return Infinity;
      u.push(q);
    }
    total += lineScatter(u);
    count += u.length;
  }
  return { total, count };
}
// lines: arrays of >= 3 observed points each. base: lens with centre and norm (k1 and k2 are replaced).
// Returns { k1, rms } where rms is the remaining distance (pixels) of points from their line, or null.
function fitK1(lines, base, { lo = -1, hi = 1 } = {}) {
  const ok = lines.filter((l) => l.length >= 3);
  if (!ok.length || !(base.norm > 0)) return null;
  const cost = (k1) => {
    const r = straightness(ok, { ...base, k1, k2: 0 });
    return r === Infinity ? Infinity : r.total;
  };
  // coarse scan, then golden-section search around the best cell
  const N = 80;
  let best = 0,
    bc = Infinity;
  for (let i = 0; i <= N; i++) {
    const k = lo + ((hi - lo) * i) / N,
      c = cost(k);
    if (c < bc) {
      bc = c;
      best = k;
    }
  }
  if (!Number.isFinite(bc)) return null;
  let a = Math.max(lo, best - (hi - lo) / N),
    b = Math.min(hi, best + (hi - lo) / N);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c1 = b - phi * (b - a),
    c2 = a + phi * (b - a),
    f1 = cost(c1),
    f2 = cost(c2);
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) {
      b = c2;
      c2 = c1;
      f2 = f1;
      c1 = b - phi * (b - a);
      f1 = cost(c1);
    } else {
      a = c1;
      c1 = c2;
      f1 = f2;
      c2 = a + phi * (b - a);
      f2 = cost(c2);
    }
  }
  const k1 = (a + b) / 2,
    r = straightness(ok, { ...base, k1, k2: 0 });
  if (r === Infinity) return null;
  return { k1, rms: Math.sqrt(r.total / Math.max(1, r.count)) };
}

// The straight line that best fits an observed line once undistorted, drawn back through the lens:
// shows how the model bends a straight line to match the clicked points. Returns pixel points, or null.
function straightGuide(line, l, n = 24) {
  const u = [];
  for (const p of line) {
    const q = undistort(l, p);
    if (!q) return null;
    u.push(q);
  }
  if (u.length < 2) return null;
  const m = u.length,
    mx = u.reduce((s, p) => s + p[0], 0) / m,
    my = u.reduce((s, p) => s + p[1], 0) / m;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (const p of u) {
    sxx += (p[0] - mx) ** 2;
    sxy += (p[0] - mx) * (p[1] - my);
    syy += (p[1] - my) ** 2;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy),
    dx = Math.cos(ang),
    dy = Math.sin(ang);
  const ts = u.map((p) => (p[0] - mx) * dx + (p[1] - my) * dy);
  const lo = Math.min(...ts),
    hi = Math.max(...ts);
  return Array.from({ length: n }, (_, i) => {
    const t = lo + ((hi - lo) * i) / (n - 1);
    return distort(l, [mx + dx * t, my + dy * t]);
  });
}

export { straightGuide, lensFor, isIdentity, distort, undistort, lineScatter, straightness, fitK1 };
