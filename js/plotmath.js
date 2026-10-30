// Crackler: Pure plot helpers: tick positions, axis ranges, tick text, nearest-point search.

// "Nice" tick values covering [lo, hi], about n of them.
function niceTicks(lo, hi, n = 6) {
  const span = hi - lo;
  if (!(span > 0)) return { ticks: [lo], step: 1 };
  const raw = span / n,
    p = Math.pow(10, Math.floor(Math.log10(raw))),
    m = raw / p,
    step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p,
    ticks = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
  return { ticks, step };
}
// Automatic range of a list of values, with a margin. Handles empty and constant data.
function extent(values, pad = 0.06) {
  let lo = Infinity,
    hi = -Infinity;
  for (const v of values)
    if (Number.isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (!Number.isFinite(lo)) return [0, 1];
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(lo))) {
    const d = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1;
    return [lo - d, hi + d];
  }
  const m = (hi - lo) * pad;
  return [lo - m, hi + m];
}
// Text of a tick value for the given tick spacing.
function fmtTick(v, step) {
  if (Math.abs(v) < step * 1e-9) return "0";
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0)) return v.toExponential(1);
  return v.toFixed(Math.min(dec, 8));
}
// The point nearest to (x, y) among items with screen coordinates sx, sy; null if none within maxDist.
function nearest(items, x, y, maxDist = 24) {
  let best = null,
    bd = maxDist;
  for (const it of items) {
    const d = Math.hypot(it.sx - x, it.sy - y);
    if (d <= bd) {
      bd = d;
      best = it;
    }
  }
  return best;
}

export { niceTicks, extent, fmtTick, nearest };
