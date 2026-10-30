// Crackler: Small shared helpers: math, number formatting, clipboard, download, safe storage.

const TAU = Math.PI * 2,
  DEG = 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- formatting ----------
function fmt(v, d = 3) {
  if (v == null || !Number.isFinite(v)) return "–";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(Math.max(0, d - 1));
  return String(+v.toPrecision(d));
}
function fmtBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(0) + " MB";
  return (b / 1e3).toFixed(0) + " kB";
}
function fmtTime(s) {
  return (+s.toFixed(4)).toString();
}

// ---------- browser helpers (call only from the UI) ----------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
function downloadText(name, text, type = "text/csv") {
  downloadBlob(name, new Blob([text], { type: type + ";charset=utf-8" }));
}
function downloadBlob(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch {
    return null;
  }
}

export { TAU, DEG, clamp, fmt, fmtBytes, fmtTime, copyText, downloadText, downloadBlob, store };
