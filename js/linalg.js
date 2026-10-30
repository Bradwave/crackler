// Crackler: Pure small linear algebra: solve A x = b and invert A (Gauss-Jordan, partial pivoting).

// Returns the inverse of a square matrix, or null if it is singular.
function invert(A) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  let scale = 0;
  for (const r of A) for (const v of r) scale = Math.max(scale, Math.abs(v));
  if (!(scale > 0)) return null;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-13 * scale) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f !== 0) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r) => r.slice(n));
}
function solve(A, b) {
  const inv = invert(A);
  return inv ? inv.map((r) => r.reduce((s, v, j) => s + v * b[j], 0)) : null;
}

export { solve, invert };
