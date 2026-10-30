// Crackler: Pure data table: column choice, rows from tracks, CSV and clipboard text.
import { plain } from "./mathtext.js";
import { GENERAL, NO_CUSTOM, PER_TRACK, allKeys, appliesTo, label, seriesOfTracks, unitOf } from "./quantities.js";

// Adds the track name as a subscript: v_x -> v_{x,A}, x -> x_{A}.
function named(l, name) {
  const m = /^(.+?)_(.+)$/.exec(l);
  return m ? `${m[1]}_{${m[2]},${name}}` : `${l}_{${name}}`;
}

// Labels use the mathtext markup; `plain` is the same text for CSV headers.
// columns: { key: bool } for every quantity (including custom keys "c:<id>").
function buildTable({ tracks, cal, clip, timeOf, columns, smooth = 1, custom = NO_CUSTOM }) {
  const { list, errors } = seriesOfTracks({ tracks, cal, clip, timeOf, smooth, custom });
  const series = list
    .filter(({ track, s }) => track.visible && s.n.length)
    .map(({ track, s }) => ({ tr: track, s, at: new Map(s.n.map((f, i) => [f, i])) }));
  const multi = series.length > 1;
  const keys = allKeys(custom).filter((k) => !GENERAL.includes(k));
  const cols = [];
  for (const k of GENERAL)
    if (columns[k]) cols.push({ key: k, label: label(k, custom), unit: unitOf(k, cal, custom) });
  for (const item of series) {
    for (const k of keys) {
      if (!columns[k] || !appliesTo(item.tr.kind, k)) continue;
      // a custom column that gives nothing for this track (e.g. a kinetic energy of an arrow) is left out
      if (k.startsWith("c:") && !(item.s[k] || []).some((v) => v != null)) continue;
      const l = label(k, custom);
      cols.push({ key: k, label: multi ? named(l, item.tr.name) : l, unit: unitOf(k, cal, custom), track: item.tr.id });
    }
  }
  const frames = [...new Set(series.flatMap((it) => it.s.n))].sort((a, b) => a - b);
  const rows = [];
  for (const n of frames) {
    const values = cols.map((c) => {
      if (c.key === "n") return n;
      if (c.key === "t") {
        for (const it of series) if (it.at.has(n)) return it.s.t[it.at.get(n)];
        return null;
      }
      const it = series.find((q) => q.tr.id === c.track),
        i = it.at.get(n);
      return i == null || !it.s[c.key] ? null : it.s[c.key][i];
    });
    rows.push({ frame: n, values });
  }
  for (const c of cols) c.plain = plain(c.label) + (c.unit ? ` (${plain(c.unit)})` : "");
  return { columns: cols, rows, errors };
}
function num(v, decimal) {
  if (v == null || !Number.isFinite(v)) return "";
  const s = String(+v.toPrecision(10));
  return decimal === "," ? s.replace(".", ",") : s;
}
// sep "," for CSV, "\t" for pasting into a spreadsheet; decimal "," for Italian locales.
function toDelimited(table, { sep = ",", decimal = "." } = {}) {
  const quote = (s) => (/[",;\t\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [table.columns.map((c) => quote(c.plain)).join(sep)];
  for (const r of table.rows) lines.push(r.values.map((v) => num(v, decimal)).join(sep));
  return lines.join("\n") + "\n";
}

export { GENERAL, PER_TRACK, buildTable, toDelimited };
