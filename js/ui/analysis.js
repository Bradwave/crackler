// Crackler: Plot analysis tools on one series and one range: slope (tangent or two points), area, fits.
// panel-plot calls attach(spec) while drawing; this module adds overlays and renders the results.
import { $, $$ } from "../dom.js";
import { equationText, evaluate, fit as runFit, MAX_DEGREE, modelOf, TYPES } from "../fit.js";
import { t } from "../i18n.js";
import { localSlope, slope2, trapezoid } from "../integrate.js";
import { toHTML } from "../mathtext.js";
import { nearest } from "../plotmath.js";
import { gotoFrame, on, setAnalysis, st } from "../state.js";
import { unitDiv, unitMul } from "../units.js";
import { copyText, fmt } from "../util.js";
import { numberInput, segBind, segSet, toast } from "./controls.js";

let ctx = null; // result of the last attach
let fitCache = { key: "", res: null };
let sliderRange = {};
let slidersKey = "";
let fitText = "";
let drag = null;

const htmlBox = new Map();
function setHTML(sel, html) {
  if (htmlBox.get(sel) === html) return;
  htmlBox.set(sel, html);
  $(sel).innerHTML = html;
}
const val = (v) => fmt(v, 4).replace("-", "−");

// ---------- computing ----------
function attach(spec) {
  const an = st.analysis,
    C = spec.C;
  const live = spec.series.map((s, i) => ({ s, i })).filter((o) => o.s.pts.length);
  const pick = live[Math.min(an.series, live.length - 1)] || null;
  ctx = { spec, live, pick, calc: {}, P: [], rangePts: [] };
  spec.overlays = {};
  if (pick && an.mode !== "axes") {
    const P = pick.s.pts.slice().sort((a, b) => a.x - b.x);
    const eps = 1e-12;
    const rangePts = an.range ? P.filter((p) => p.x >= an.range[0] - eps && p.x <= an.range[1] + eps) : P;
    Object.assign(ctx, { P, rangePts, xs: P.map((p) => p.x), ys: P.map((p) => p.y) });
    ctx.xu = spec.xUnit;
    ctx.yu = pick.s.yUnit;
    if (an.mode === "area" || an.mode === "fit") if (an.range) spec.overlays.range = [...an.range];
    if (an.mode === "slope") computeSlope(spec, C);
    if (an.mode === "area") computeArea(spec, C);
    if (an.mode === "fit") computeFit(spec, C);
  }
  updateUI();
}

function computeSlope(spec, C) {
  const an = st.analysis,
    { P, xs, ys } = ctx,
    ov = spec.overlays,
    yn = ctx.pick.s.name,
    xn = spec.xName;
  const unit = unitDiv(ctx.yu, ctx.xu);
  const idx = (f) => (f == null ? -1 : P.findIndex((p) => p.frame === f));
  if (an.slopeKind === "tangent") {
    const i = idx(an.slopeFrame);
    const r = i >= 0 ? localSlope(xs, ys, i, an.k) : null;
    if (r) {
      const span = P[r.to].x - P[r.from].x || 1,
        x0 = P[r.from].x - span * 0.35,
        x1 = P[r.to].x + span * 0.35;
      const y = (x) => r.at + r.slope * (x - P[i].x);
      ov.lines = [{ x0, y0: y(x0), x1, y1: y(x1), color: C.accent }];
      ov.marks = [{ x: P[i].x, y: P[i].y, color: C.accent }];
      ctx.calc.slope = { kind: "tangent", value: r.slope, n: r.n, x: P[i].x, r2: r.r2, unit, yn, xn };
    }
  } else {
    const i = idx(an.slopeA),
      j = idx(an.slopeB);
    ov.marks = [];
    if (i >= 0) ov.marks.push({ x: P[i].x, y: P[i].y, color: C.accent });
    if (j >= 0) ov.marks.push({ x: P[j].x, y: P[j].y, color: C.accent });
    if (i >= 0 && j >= 0 && i !== j) {
      const v = slope2(P[i], P[j]);
      if (v != null) {
        const ext = (P[j].x - P[i].x) * 0.25,
          x0 = P[i].x - ext,
          x1 = P[j].x + ext;
        ov.lines = [{ x0, y0: P[i].y + v * (x0 - P[i].x), x1, y1: P[i].y + v * (x1 - P[i].x), color: C.accent }];
        ctx.calc.slope = { kind: "two", value: v, dx: P[j].x - P[i].x, dy: P[j].y - P[i].y, unit, yn, xn };
      }
    }
  }
}

function computeArea(spec, C) {
  const { rangePts, xu, yu } = ctx;
  if (rangePts.length < 2) return;
  spec.overlays.area = { pts: rangePts, color: C.vel };
  ctx.calc.area = {
    value: trapezoid(
      rangePts.map((p) => p.x),
      rangePts.map((p) => p.y),
    ),
    n: rangePts.length,
    x0: rangePts[0].x,
    x1: rangePts[rangePts.length - 1].x,
    unit: unitMul(yu, xu),
    yn: ctx.pick.s.name,
    xn: spec.xName,
  };
}

function fitSpec() {
  const f = st.analysis.fit;
  return { type: f.type, degree: f.degree, expr: f.expr };
}
function computeFit(spec, C) {
  const f = st.analysis.fit,
    fs = fitSpec(),
    pts = ctx.rangePts,
    xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const model = modelOf(fs);
  const calc = { xu: ctx.xu, yu: ctx.yu, yn: ctx.pick.s.name, xn: spec.xName, spec: fs };
  ctx.calc.fit = calc;
  if (model.error) {
    calc.error = "formula";
    calc.formula = model.error;
    return;
  }
  calc.names = model.names;
  const stored = model.names.every((n) => n in f.values) ? model.names.map((n) => f.values[n]) : null;
  const key = JSON.stringify([fs, f.manual, f.manual ? stored : null, xs.length, xs[0], xs.at(-1), ys.reduce((a, b) => a + b, 0), ys[0], ys.at(-1)]);
  let res;
  if (fitCache.key === key) res = fitCache.res;
  else {
    if (f.manual) res = evaluate(fs, xs, ys, stored || model.names.map(() => 1));
    else res = runFit(fs, xs, ys, fs.type === "linear" || fs.type === "poly" ? undefined : stored || undefined);
    fitCache = { key, res };
    if (!f.manual && res.ok) f.values = Object.fromEntries(model.names.map((n, i) => [n, res.params[i]]));
  }
  calc.res = res;
  if (res.ok && xs.length > 1) {
    const a = xs[0],
      b = xs[xs.length - 1],
      curve = [];
    for (let i = 0; i <= 120; i++) {
      const x = a + ((b - a) * i) / 120,
        y = res.f(x);
      if (Number.isFinite(y)) curve.push([x, y]);
    }
    spec.overlays.curve = { pts: curve, color: C.acc };
  }
}

// ---------- results ----------
const unitHTML = (u) => (u ? toHTML(u) : "");
function slopeHTML(c) {
  if (!c) return `<span class="note">${t("slopeNone")}</span>`;
  const head =
    c.kind === "tangent"
      ? `d${c.yn}/d${c.xn} = ${val(c.value)} ${c.unit}`
      : `Δ${c.yn}/Δ${c.xn} = ${val(c.dy)}/${val(c.dx)} = ${val(c.value)} ${c.unit}`;
  const sub =
    c.kind === "tangent"
      ? t("slopeTangentInfo", { x: fmt(c.x, 4), n: c.n, r2: fmt(c.r2, 4) })
      : t("slopeTwoInfo");
  return `<div class="big">${toHTML(head)}</div><div class="note">${sub}</div>`;
}
function areaHTML(c) {
  if (!c) return `<span class="note">${t("areaNone")}</span>`;
  const head = `∫ ${c.yn} d${c.xn} = ${val(c.value)} ${c.unit}`;
  return `<div class="big">${toHTML(head)}</div><div class="note">${t("areaInfo", { a: fmt(c.x0, 4), b: fmt(c.x1, 4), n: c.n })}</div>`;
}
function fitHTML(c) {
  if (!c) return "";
  if (c.error === "formula") {
    fitText = "";
    return `<div class="note err">${t("formulaErr_" + c.formula.code, { pos: c.formula.pos + 1, d: c.formula.detail })}</div>`;
  }
  const r = c.res;
  if (!r || !r.ok) {
    fitText = "";
    return `<div class="note err">${t("fitErr_" + (r ? r.error : "points"), { n: r ? r.n : 0, k: c.names.length })}</div>`;
  }
  const eq = equationText(c.spec, r.params, c.xn, c.yn);
  const units = r.units(c.xu, c.yu);
  const rows = r.params
    .map(
      (p, i) =>
        `<tr><td>${toHTML(r.labels[i])}</td><td>${val(p)}${r.errors[i] != null ? ` <small>± ${fmt(r.errors[i], 2)}</small>` : ""}</td><td>${unitHTML(units[i])}</td></tr>`,
    )
    .join("");
  const r2 = Number.isFinite(r.r2) ? fmt(r.r2, 5) : "–";
  fitText =
    `${eq.replace(/[{}]/g, "")}\nR² = ${r2}, N = ${r.n}\n` +
    r.params.map((p, i) => `${r.labels[i].replace(/[{}]/g, "")} = ${val(p)}${r.errors[i] != null ? " ± " + fmt(r.errors[i], 2) : ""} ${units[i].replace(/[{}]/g, "")}`).join("\n");
  fitText = fitText.replace(/−/g, "-");
  return `<div class="big">${toHTML(eq)}</div>
    <div class="note"><b>R<sup>2</sup> = ${r2}</b> · ${t("fitPoints", { n: r.n })}${r.converged ? "" : " · <span class='err'>" + t("fitNoConv") + "</span>"}</div>
    <table class="ptable ptab"><tbody>${rows}</tbody></table>`;
}

// ---------- controls ----------
function rangeText() {
  const an = st.analysis;
  if (!ctx || !ctx.pick) return t("rangeAll", { n: 0 });
  return an.range
    ? t("rangeSel", { a: fmt(an.range[0], 4), b: fmt(an.range[1], 4), n: ctx.rangePts.length })
    : t("rangeAll", { n: ctx.P.length });
}
function sliderRow(name, label, v) {
  const [lo, hi] = sliderRange[name];
  return `<div class="slrow"><label>${toHTML(label)}</label>
    <input type="range" data-p="${name}" min="${lo}" max="${hi}" step="${(hi - lo) / 2000}" value="${v}" aria-label="${name}" />
    <input type="number" data-n="${name}" step="any" inputmode="decimal" value="${+v.toPrecision(6)}" /></div>`;
}
function resetRanges(values) {
  sliderRange = {};
  for (const [n, v] of Object.entries(values)) {
    const span = Math.max(Math.abs(v), 0.5) * 2;
    sliderRange[n] = [+(v - span).toPrecision(6), +(v + span).toPrecision(6)];
  }
  slidersKey = "";
}
function renderSliders(calc) {
  const f = st.analysis.fit,
    box = $("#fitSliders");
  const show = f.manual && calc && calc.names && calc.names.length;
  $("#fitFromWrap").hidden = !show;
  if (!show) {
    box.innerHTML = "";
    slidersKey = "";
    return;
  }
  const names = calc.names,
    labels = f.type === "custom" ? names : (calc.res && calc.res.labels) || names;
  for (const n of names) {
    const v = f.values[n] ?? 1;
    if (!sliderRange[n]) {
      const span = Math.max(Math.abs(v), 0.5) * 2;
      sliderRange[n] = [+(v - span).toPrecision(6), +(v + span).toPrecision(6)];
    }
  }
  const key = f.type + names.join() + f.degree;
  if (key !== slidersKey) {
    slidersKey = key;
    box.innerHTML = names.map((n, i) => sliderRow(n, labels[i], f.values[n] ?? 1)).join("");
    box.querySelectorAll("[data-p]").forEach((el) => {
      el.oninput = () => setValue(el.dataset.p, +el.value, false);
    });
    box.querySelectorAll("[data-n]").forEach((el) => {
      el.onchange = () => {
        const v = parseFloat(el.value.replace(",", "."));
        if (Number.isFinite(v)) setValue(el.dataset.n, v, true);
      };
    });
  } else {
    // keep the controls in step with the values without rebuilding them
    for (const n of names) {
      const v = f.values[n] ?? 1,
        r = box.querySelector(`[data-p="${n}"]`),
        q = box.querySelector(`[data-n="${n}"]`);
      if (r && document.activeElement !== r) r.value = v;
      if (q && document.activeElement !== q) q.value = +v.toPrecision(6);
    }
  }
}
function setValue(name, v, extend) {
  const f = st.analysis.fit;
  const values = { ...f.values, [name]: v };
  const r = sliderRange[name];
  if (r && (v < r[0] || v > r[1])) {
    const span = Math.max(Math.abs(v), 0.5) * 2;
    sliderRange[name] = [+(v - span).toPrecision(6), +(v + span).toPrecision(6)];
    slidersKey = "";
  } else if (extend) slidersKey = "";
  setAnalysis({ fit: { values } });
}

function updateUI() {
  const an = st.analysis;
  segSet($("#anSeg"), an.mode);
  const panels = ["axes", "slope", "area", "fit"];
  for (const p of panels) $("#an-" + p).hidden = an.mode !== p;
  const multi = ctx && ctx.live.length > 1 && an.mode !== "axes";
  $("#anSeriesWrap").hidden = !multi;
  if (multi) {
    const html = ctx.live.map((o, k) => `<option value="${k}">${plainName(o.s)}</option>`).join("");
    const sel = $("#anSeries");
    if (sel.dataset.h !== html) {
      sel.innerHTML = html;
      sel.dataset.h = html;
    }
    sel.value = Math.min(an.series, ctx.live.length - 1);
  }
  $$(".range-info").forEach((el) => (el.textContent = rangeText()));
  $$(".range-clear").forEach((el) => (el.disabled = !an.range));
  if (an.mode === "slope") {
    segSet($("#slopeKind"), an.slopeKind);
    $("#slopeKCtl").hidden = an.slopeKind !== "tangent";
    $("#slopeK").value = an.k;
    $("#slopeKL").textContent = `±${an.k}`;
    $("#slopeHint").textContent = t(an.slopeKind === "tangent" ? "slopeHintTangent" : an.slopeA != null && an.slopeB == null ? "slopeHintTwo2" : "slopeHintTwo");
    setHTML("#slopeRes", slopeHTML(ctx && ctx.calc.slope));
  } else if (an.mode === "area") setHTML("#areaRes", areaHTML(ctx && ctx.calc.area));
  else if (an.mode === "fit") {
    const f = an.fit;
    $("#fitType").value = f.type;
    $("#fitDegWrap").hidden = f.type !== "poly";
    $("#fitDeg").value = f.degree;
    $("#fitExprWrap").hidden = f.type !== "custom";
    if (document.activeElement !== $("#fitExpr")) $("#fitExpr").value = f.expr;
    segSet($("#fitMode"), f.manual ? "manual" : "auto");
    const c = ctx && ctx.calc.fit;
    $("#fitExprMsg").textContent = f.type === "custom" ? t("fitExprHelp") : "";
    renderSliders(c);
    setHTML("#fitRes", c ? fitHTML(c) : `<span class="note">${t("fitNone")}</span>`);
    $("#fitCopy").disabled = !fitText;
  }
}
const plainName = (s) => s.name.replace(/[_^{}]/g, "").replace(/\\/g, "");

// ---------- pointer ----------
const handlesPointer = () => st.analysis.mode !== "axes";
function itemsOfSeries(layout) {
  return ctx && ctx.pick ? layout.items.filter((it) => it.si === ctx.pick.i) : [];
}
function nearestIdx(xs, x) {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  return best;
}
// kind: "down" | "move" | "up"; loc: [x, y] inside the canvas; touch: finger or pen.
function pointer(kind, loc, layout, touch) {
  const an = st.analysis;
  if (!ctx || !ctx.pick) return true;
  const hit = () => nearest(itemsOfSeries(layout), loc[0], loc[1], touch ? 40 : 26);
  if (an.mode === "slope") {
    if (kind === "up") {
      drag = null;
      if (an.slopeKind === "two" && an.slopeA != null && an.slopeB === an.slopeA) setAnalysis({ slopeB: null });
      return true;
    }
    const h = hit();
    if (!h) return true;
    if (an.slopeKind === "tangent") {
      if (an.slopeFrame !== h.frame) setAnalysis({ slopeFrame: h.frame });
      gotoFrame(h.frame);
    } else if (kind === "down") {
      drag = true;
      if (an.slopeA == null || an.slopeB != null) setAnalysis({ slopeA: h.frame, slopeB: null });
      else setAnalysis({ slopeB: h.frame === an.slopeA ? null : h.frame });
    } else if (drag && an.slopeA != null && an.slopeB !== h.frame && h.frame !== an.slopeA) setAnalysis({ slopeB: h.frame });
    return true;
  }
  // area and fit: drag selects the range, a tap jumps to the frame
  if (kind === "down") drag = { x: loc[0], moved: false };
  else if (kind === "move" && drag) {
    if (Math.abs(loc[0] - drag.x) > 5) drag.moved = true;
    if (drag.moved) {
      const xa = layout.invX(drag.x),
        xb = layout.invX(loc[0]);
      const ia = nearestIdx(ctx.xs, Math.min(xa, xb)),
        ib = nearestIdx(ctx.xs, Math.max(xa, xb));
      if (ib > ia) {
        const r = [ctx.xs[ia], ctx.xs[ib]];
        if (!an.range || an.range[0] !== r[0] || an.range[1] !== r[1]) setAnalysis({ range: r });
      }
    }
  } else if (kind === "up") {
    if (drag && !drag.moved) {
      const h = hit();
      if (h) gotoFrame(h.frame);
    }
    drag = null;
  }
  return true;
}

// ---------- init ----------
function init() {
  segBind($("#anSeg"), (v) => setAnalysis({ mode: v }));
  $("#anSeries").onchange = () =>
    setAnalysis({ series: +$("#anSeries").value, slopeFrame: null, slopeA: null, slopeB: null, range: null });
  segBind($("#slopeKind"), (v) => setAnalysis({ slopeKind: v, slopeA: null, slopeB: null }));
  $("#slopeK").oninput = () => setAnalysis({ k: +$("#slopeK").value });
  $("#slopeClear").onclick = () => setAnalysis({ slopeFrame: null, slopeA: null, slopeB: null });
  $$(".range-clear").forEach((b) => (b.onclick = () => setAnalysis({ range: null })));

  $("#fitType").innerHTML = TYPES.map((k) => `<option value="${k}">${t("fitType_" + k)}</option>`).join("");
  $("#fitDeg").innerHTML = Array.from({ length: MAX_DEGREE - 1 }, (_, i) => `<option value="${i + 2}">${i + 2}</option>`).join("");
  $("#fitType").onchange = () => {
    setAnalysis({ fit: { type: $("#fitType").value, values: {} } });
    resetRanges({});
  };
  $("#fitDeg").onchange = () => {
    setAnalysis({ fit: { degree: +$("#fitDeg").value, values: {} } });
    resetRanges({});
  };
  $("#fitExpr").oninput = () => {
    setAnalysis({ fit: { expr: $("#fitExpr").value } });
  };
  segBind($("#fitMode"), (v) => {
    const manual = v === "manual";
    if (manual) resetRanges(st.analysis.fit.values);
    setAnalysis({ fit: { manual } });
  });
  $("#fitFrom").onclick = () => {
    const f = st.analysis.fit,
      c = ctx && ctx.calc.fit;
    if (!c || !c.names) return;
    const pts = ctx.rangePts,
      res = runFit(fitSpec(), pts.map((p) => p.x), pts.map((p) => p.y), c.names.map((n) => f.values[n] ?? 1));
    if (res.ok) {
      const values = Object.fromEntries(c.names.map((n, i) => [n, res.params[i]]));
      resetRanges(values);
      setAnalysis({ fit: { values } });
    } else toast(t("fitErr_" + res.error, { n: res.n || 0, k: c.names.length }));
  };
  $("#fitCopy").onclick = async () => {
    if (!fitText) return;
    if (await copyText(fitText)) toast(t("fitCopied"));
    else toast(t("copyBlocked"));
  };
  on("lang", () => {
    $("#fitType").innerHTML = TYPES.map((k) => `<option value="${k}">${t("fitType_" + k)}</option>`).join("");
    htmlBox.clear();
    fitCache = { key: "", res: null };
    updateUI();
  });
  on("source", () => {
    fitCache = { key: "", res: null };
  });
}

export { init, attach, pointer, handlesPointer };
