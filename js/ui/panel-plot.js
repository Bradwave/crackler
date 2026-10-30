// Crackler: Plot panel: any quantity against any other, several series, autoscale or manual limits.
// Tap or drag over the plot to jump to the frame of the nearest point.
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { toHTML } from "../mathtext.js";
import { drawPlot } from "../plot.js";
import { nearest } from "../plotmath.js";
import { allKeys, label as qLabel, plotSeries, unitOf as qUnit } from "../quantities.js";
import { MARKERS, pointCount } from "../tracks.js";
import { gotoFrame, on, setAnalysis, setSetting, st } from "../state.js";
import * as analysis from "./analysis.js";
import { isOn, numberInput, setToggle } from "./controls.js";

const label = (k) => qLabel(k, st.custom),
  unitOf = (k, cal) => qUnit(k, cal, st.custom),
  ALL_KEYS = () => allKeys(st.custom);
const cv = $("#plotCv"),
  ctx = cv.getContext("2d");
const C = {};
let dpr = 1,
  layout = null,
  specNow = null,
  raf = 0,
  down = false;

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["surface", "ink", "muted", "gridline", "accent", "pos", "vel", "acc", "tile2"])
    C[k] = cs.getPropertyValue("--" + k).trim();
  req();
}
const SERIES_COLORS = () => [C.pos, C.vel, C.acc, C.accent, C.tile2, C.muted];

// ---------- data ----------
function buildSpec() {
  const p = st.plot,
    ys = p.y.filter((k) => ALL_KEYS().includes(k));
  const xKey = ALL_KEYS().includes(p.x) ? p.x : "t";
  const shown = st.tracks.filter((tr) => tr.visible && pointCount(tr));
  const multi = shown.length > 1;
  const raw = plotSeries({
    tracks: st.tracks,
    cal: st.cal,
    clip: st.clip,
    timeOf: (n) => st.src.timeOf(n),
    smooth: st.smooth,
    xKey,
    yKeys: ys,
    custom: st.custom,
  });
  const palette = SERIES_COLORS();
  const series = raw.map((s) => {
    const yi = ys.indexOf(s.yKey);
    const name = multi ? `${label(s.yKey)}_{${s.track.name}}` : label(s.yKey);
    return {
      ...s,
      yUnit: unitOf(s.yKey, st.cal),
      name,
      color: multi ? s.track.color : palette[yi % palette.length],
      marker: multi ? MARKERS[yi % MARKERS.length] : s.track.marker,
    };
  });
  const units = [...new Set(ys.map((k) => unitOf(k, st.cal)).filter(Boolean))];
  const labs = ys.map(label);
  const unitTxt = (u) => (u.length ? ` (${u.join(" | ")})` : "");
  const xu = unitOf(xKey, st.cal);
  return {
    C,
    xKey,
    xName: label(xKey),
    xUnit: xu,
    series,
    xLabel: label(xKey) + (xu ? ` (${xu})` : ""),
    yLabel: labs.join(", ") + unitTxt(units),
    xlim: p.auto ? null : [p.lim[0], p.lim[1]],
    ylim: p.auto ? null : [p.lim[2], p.lim[3]],
    connect: p.connect,
    curFrame: st.frame,
    emptyText: st.src ? t("plotEmpty") : t("noVideo"),
  };
}

// ---------- drawing ----------
function req() {
  if (!raf) raf = requestAnimationFrame(draw);
}
function resize() {
  dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth,
    h = cv.clientHeight;
  if (!w || !h) return;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  req();
}
function draw() {
  raf = 0;
  if ($("#pane-plot").hidden || !cv.clientWidth) return;
  if (cv.width !== Math.round(cv.clientWidth * dpr)) resize();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!st.src) {
    specNow = { series: [], xLabel: "x", yLabel: "y", curFrame: -1, emptyText: t("noVideo") };
  } else {
    specNow = buildSpec();
    analysis.attach(specNow);
  }
  cv.classList.toggle("analysing", analysis.handlesPointer());
  layout = drawPlot(ctx, cv.clientWidth, cv.clientHeight, specNow, C);
  renderLegend();
  if (isOn($("#plotAuto")) === false) return;
  syncLimits();
}
function renderLegend() {
  const el = $("#plotLegend");
  const html = specNow.series
    .filter((s) => s.pts.length)
    .map((s) => `<span class="lg on lgs"><i class="sw sq" style="background:${s.color}"></i>${toHTML(s.name)}</span>`)
    .join("");
  if (el.dataset.h !== html) {
    el.innerHTML = html;
    el.dataset.h = html;
  }
}
// While autoscale is on, the limit boxes show the current range.
function syncLimits() {
  if (!layout) return;
  const { x, y } = layout.range,
    f = (v) => +v.toPrecision(5);
  const vals = [x[0], x[1], y[0], y[1]];
  ["#limX0", "#limX1", "#limY0", "#limY1"].forEach((id, i) => {
    if (document.activeElement !== $(id)) $(id).value = f(vals[i]);
  });
}

// ---------- controls ----------
function renderControls() {
  $("#plotX").innerHTML = ALL_KEYS().map((k) => `<option value="${k}">${plainOption(k)}</option>`).join("");
  $("#plotX").value = st.plot.x;
  $("#plotYChips").innerHTML = ALL_KEYS().filter((k) => k !== "n")
    .map((k) => `<button class="lg${st.plot.y.includes(k) ? " on" : ""}" data-y="${k}">${toHTML(label(k))}</button>`)
    .join("");
  $("#plotYChips")
    .querySelectorAll(".lg")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset.y,
            y = st.plot.y.includes(k) ? st.plot.y.filter((q) => q !== k) : [...st.plot.y, k];
          setSetting({ plot: { ...st.plot, y: y.slice(-4) } });
          resetAnalysis();
        }),
    );
  setToggle($("#plotConnect"), st.plot.connect);
  setToggle($("#plotAuto"), st.plot.auto);
  $("#limRow").hidden = st.plot.auto;
  if (!st.plot.auto) {
    ["#limX0", "#limX1", "#limY0", "#limY1"].forEach((id, i) => {
      if (document.activeElement !== $(id)) $(id).value = st.plot.lim[i];
    });
  }
}
const plainOption = (k) => `${label(k).replace(/_/g, "")}`;

// Range and chosen points belong to one set of axes.
function resetAnalysis() {
  setAnalysis({ series: 0, range: null, slopeFrame: null, slopeA: null, slopeB: null });
}

// ---------- pointer: tap or drag selects the nearest point ----------
function pick(e) {
  if (!layout) return;
  const r = cv.getBoundingClientRect();
  const hit = nearest(layout.items, e.clientX - r.left, e.clientY - r.top, e.pointerType === "mouse" ? 22 : 34);
  if (hit) gotoFrame(hit.frame);
}

function init() {
  readColors();
  analysis.init();
  new ResizeObserver(resize).observe(cv);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  new MutationObserver(readColors).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const loc = (e) => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const route = (kind, e) => {
    if (analysis.handlesPointer() && layout && st.src) analysis.pointer(kind, loc(e), layout, e.pointerType !== "mouse");
    else if (kind !== "up") pick(e);
  };
  cv.addEventListener("pointerdown", (e) => {
    down = true;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // not capturable: dragging still works while inside the canvas
    }
    route("down", e);
  });
  cv.addEventListener("pointermove", (e) => down && route("move", e));
  for (const ev of ["pointerup", "pointercancel"])
    cv.addEventListener(ev, (e) => {
      if (down) route("up", e);
      down = false;
    });
  $("#plotX").onchange = () => {
    setSetting({ plot: { ...st.plot, x: $("#plotX").value } });
    resetAnalysis();
  };
  $("#plotConnect").onclick = () => setSetting({ plot: { ...st.plot, connect: !isOn($("#plotConnect")) } });
  $("#plotAuto").onclick = () => {
    const auto = !isOn($("#plotAuto"));
    const lim = !auto && layout ? [...layout.range.x, ...layout.range.y] : st.plot.lim;
    setSetting({ plot: { ...st.plot, auto, lim } });
  };
  ["#limX0", "#limX1", "#limY0", "#limY1"].forEach((id, i) =>
    numberInput($(id), (v) => {
      const lim = [...st.plot.lim];
      lim[i] = v;
      if (lim[0] < lim[1] && lim[2] < lim[3]) setSetting({ plot: { ...st.plot, lim } });
    }),
  );
  for (const e of ["source", "frame", "tracks", "calib", "clip", "lang", "tab", "settings"]) on(e, req);
  for (const e of ["lang", "settings"]) on(e, renderControls);
  renderControls();
  req();
}

export { init };
