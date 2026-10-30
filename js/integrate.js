// Crackler: Pure analysis of a series y(x): trapezoid area, two-point slope, local tangent.
// Points must be sorted by x for the area and for the neighbour search.

// Area under the polyline through the points (signed), by the trapezoid rule.
function trapezoid(xs, ys) {
  let s = 0;
  for (let i = 1; i < xs.length; i++) s += ((xs[i] - xs[i - 1]) * (ys[i] + ys[i - 1])) / 2;
  return s;
}
// Slope between two points; null if they share the same x.
function slope2(p, q) {
  const dx = q.x - p.x;
  return dx === 0 ? null : (q.y - p.y) / dx;
}
// Least-squares line through points i-k..i+k (clipped to the series). Returns null if fewer than 2
// points or no spread in x. `at` is the fitted value at x_i, so the tangent is y = at + slope (x - x_i).
function localSlope(xs, ys, i, k = 2) {
  const lo = Math.max(0, i - k),
    hi = Math.min(xs.length - 1, i + k),
    n = hi - lo + 1;
  if (n < 2) return null;
  let sx = 0,
    sy = 0;
  for (let j = lo; j <= hi; j++) {
    sx += xs[j];
    sy += ys[j];
  }
  const mx = sx / n,
    my = sy / n;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (let j = lo; j <= hi; j++) {
    sxx += (xs[j] - mx) ** 2;
    sxy += (xs[j] - mx) * (ys[j] - my);
    syy += (ys[j] - my) ** 2;
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  return {
    slope,
    at: my + slope * (xs[i] - mx),
    n,
    from: lo,
    to: hi,
    r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1,
  };
}

export { trapezoid, slope2, localSlope };
