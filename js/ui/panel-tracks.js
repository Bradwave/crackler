// Crackler: Tracks panel: point masses, centre of mass, vectors, vector sums; appearance, marking options,
// derivative smoothing; and the measuring tools (tape, protractor, circle fitter).
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { trackSeries } from "../derive.js";
import { evalMeasure } from "../measures.js";
import { PRESETS } from "../model.js";
import { toHTML } from "../mathtext.js";
import {
  MAX_TRACKS,
  addMeasure,
  addTrack,
  clearPoints,
  deletePoint,
  editMeasure,
  editModel,
  editTrack,
  ensureParams,
  on,
  removeMeasure,
  removeTrack,
  selectTrack,
  setSetting,
  startCollect,
  st,
  mapper,
  timeAt,
  track,
} from "../state.js";
import { COLORS, KINDS, MARKERS, isMarked, modelErrors, pointCount } from "../tracks.js";
import { fmt } from "../util.js";
import { isOn, numberInput, setToggle, toast } from "./controls.js";

const SYMBOL = { circle: "○", cross: "✕", square: "□", diamond: "◇", triangle: "△" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- the list of tracks ----------
function renderList() {
  $("#trList").innerHTML = st.tracks
    .map(
      (tr, i) => `<div class="trrow${i === st.active ? " on" : ""}">
        <button class="trpick" data-i="${i}" aria-pressed="${i === st.active}">
          <span class="sw dot" style="background:${tr.color}"></span>
          <span class="trname">${esc(tr.name)}</span>
          <small>${isMarked(tr) ? t("pointsShort", { n: pointCount(tr) }) : t("kind_" + tr.kind)}</small>
        </button>
        <button class="btn ic trvis" data-vis="${i}" aria-pressed="${tr.visible}" aria-label="${t("visible")}" title="${t("visible")}">
          <span class="ms">${tr.visible ? "visibility" : "visibility_off"}</span>
        </button>
      </div>`,
    )
    .join("");
  $("#trList")
    .querySelectorAll("[data-i]")
    .forEach((b) => (b.onclick = () => selectTrack(+b.dataset.i)));
  $("#trList")
    .querySelectorAll("[data-vis]")
    .forEach((b) => (b.onclick = () => editTrack({ visible: !st.tracks[+b.dataset.vis].visible }, null, +b.dataset.vis)));
}

// ---------- the selected track ----------
function memberChips(tr, kind) {
  const cands = st.tracks.filter((q) => q.kind === kind);
  if (!cands.length) return `<p class="note">${t(kind === "point" ? "needPoints" : "needVectors")}</p>`;
  return `<div class="members">${cands
    .map((q) => `<button class="lg${tr.members.includes(q.id) ? " on" : ""}" data-mem="${q.id}"><i class="sw sq" style="background:${q.color}"></i>${esc(q.name)}</button>`)
    .join("")}</div>`;
}
// ---------- analytic and dynamic particles ----------
function modelMessage(e) {
  if (!e) return "";
  if (e.code === "unknownName") return t("modelUnknown", { d: e.detail });
  if (e.code === "step") return t("modelStep");
  return t("formulaErr_" + e.code, { pos: e.pos + 1, d: e.detail });
}
function formulaRow(id, label, value, err) {
  return `<label class="num wide"><span>${label}</span> <input type="text" id="${id}" value="${esc(value)}" maxlength="200" spellcheck="false" autocapitalize="off" autocomplete="off" /></label>${
    err ? `<p class="note err">${modelMessage(err)}</p>` : ""
  }`;
}
function numRow(id, label, v, unit) {
  return `<label class="num"><span>${label}</span> <input type="number" id="${id}" value="${v}" step="any" inputmode="decimal" /> ${unit}</label>`;
}
function modelHTML(tr) {
  const errs = modelErrors(tr, st.custom.params),
    m = tr.model;
  if (tr.kind === "analytic")
    return `${formulaRow("mX", "x(t) =", m.x, errs.x)}${formulaRow("mY", "y(t) =", m.y, errs.y)}<p class="note">${t("modelAnalyticHelp")}</p>`;
  const others = st.tracks.filter((q) => q !== tr && ["point", "cm", "analytic", "dynamic"].includes(q.kind));
  return `<div class="row"><span class="sel"><select id="mPreset" aria-label="${t("modelExample")}"><option value="">${t("modelExample")}</option>${Object.entries(PRESETS)
    .map(([k]) => `<option value="${k}">${t("preset_" + k)}</option>`)
    .join("")}</select></span></div>
    ${formulaRow("mFx", "F<sub>x</sub> =", m.fx, errs.fx)}${formulaRow("mFy", "F<sub>y</sub> =", m.fy, errs.fy)}
    <p class="note">${t("modelDynamicHelp")}</p>
    <h3 class="grp">${t("modelInitial")}</h3>
    <div class="row">${numRow("mT0", "t<sub>0</sub>", m.t0, "s")}${numRow("mX0", "x<sub>0</sub>", m.x0, "")}${numRow("mY0", "y<sub>0</sub>", m.y0, "")}</div>
    <div class="row" style="margin-top: 6px">${numRow("mVx0", "v<sub>x0</sub>", m.vx0, "")}${numRow("mVy0", "v<sub>y0</sub>", m.vy0, "")}</div>
    <div class="row" style="margin-top: 8px"><span class="sel"><select id="mFrom" aria-label="${t("modelFrom")}">${others
      .map((q) => `<option value="${q.id}">${esc(q.name)}</option>`)
      .join("")}</select></span><button class="btn" id="mFromBtn"${others.length ? "" : " disabled"}><span class="ms">my_location</span><span>${t("modelFromBtn")}</span></button></div>
    <h3 class="grp">${t("modelMethod")}</h3>
    <div class="row"><div class="seg small" id="mMethod"><button data-v="euler" class="${m.method === "euler" ? "on" : ""}">Euler</button><button data-v="rk4" class="${m.method === "rk4" ? "on" : ""}">RK4</button></div>
    ${numRow("mDt", "dt", m.dt, "s")}</div>${errs.dt ? `<p class="note err">${modelMessage(errs.dt)}</p>` : ""}`;
}
function bindModel(box, tr) {
  const text = (id, key) => {
    const el = box.querySelector("#" + id);
    if (el)
      el.addEventListener("change", () => {
        el.blur(); // so the box can redraw with the new messages
        editModel({ [key]: el.value });
      });
  };
  const number = (id, key) => {
    const el = box.querySelector("#" + id);
    if (el)
      el.addEventListener("change", () => {
        const v = parseFloat(el.value.replace(",", "."));
        el.blur();
        if (Number.isFinite(v)) editModel({ [key]: v });
      });
  };
  text("mX", "x");
  text("mY", "y");
  text("mFx", "fx");
  text("mFy", "fy");
  for (const [id, k] of [["mT0", "t0"], ["mX0", "x0"], ["mY0", "y0"], ["mVx0", "vx0"], ["mVy0", "vy0"], ["mDt", "dt"]]) number(id, k);
  box.querySelectorAll("#mMethod button").forEach((b) => (b.onclick = () => editModel({ method: b.dataset.v })));
  const pre = box.querySelector("#mPreset");
  if (pre)
    pre.onchange = () => {
      const p = PRESETS[pre.value];
      if (!p) return;
      ensureParams(p.params);
      editModel({ fx: p.fx, fy: p.fy });
    };
  const from = box.querySelector("#mFromBtn");
  if (from)
    from.onclick = () => {
      const ref = st.tracks.find((q) => q.id === +box.querySelector("#mFrom").value);
      const s = ref && trackSeries(ref, st.cal, st.clip, (n) => st.src.timeOf(n), st.smooth, st.tracks, st.custom.params);
      const i = s ? s.n.indexOf(st.frame) : -1;
      if (i < 0 || s.vx[i] == null) return toast(t("modelNoData"));
      editModel({ t0: timeAt(st.frame), x0: s.x[i], y0: s.y[i], vx0: s.vx[i], vy0: s.vy[i] });
    };
}
function renderKind(tr) {
  const box = $("#kindBox");
  let html = "";
  if (tr.kind === "cm" || tr.kind === "vsum") {
    const total = tr.members.reduce((s, id) => s + ((st.tracks.find((q) => q.id === id) || {}).mass || 0), 0);
    html = `<div class="ctl"><label><span>${t("members")}</span>${tr.kind === "cm" ? `<b>${fmt(total)} kg</b>` : ""}</label>${memberChips(tr, tr.kind === "cm" ? "point" : "vector")}</div>
      <p class="note">${t("computedNote")}</p>`;
  } else if (tr.kind === "vector") {
    const pts = st.tracks.filter((q) => q.kind === "point");
    html = `<div class="ctl"><label><span>${t("vecTail")}</span></label>
      <span class="sel"><select id="vecTail"><option value="">${t("vecTailMarked")}</option>${pts
        .map((q) => `<option value="${q.id}"${tr.tail === q.id ? " selected" : ""}>${esc(q.name)}</option>`)
        .join("")}</select></span></div><p class="note">${t("vecHelp")}</p>`;
  }
  if (tr.kind === "analytic" || tr.kind === "dynamic") html = modelHTML(tr);
  // do not rebuild while a field in this box is being edited
  if (box.dataset.h !== html && !(box.contains(document.activeElement) && document.activeElement.tagName === "INPUT")) {
    box.innerHTML = html;
    box.dataset.h = html;
    bindModel(box, tr);
    box.querySelectorAll("[data-mem]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = +b.dataset.mem,
            m = tr.members.includes(id) ? tr.members.filter((q) => q !== id) : [...tr.members, id];
          editTrack({ members: m });
        }),
    );
    const sel = box.querySelector("#vecTail");
    if (sel) sel.onchange = () => editTrack({ tail: sel.value === "" ? null : +sel.value });
  }
}
function renderSelected() {
  const tr = track();
  if (!tr) return;
  if (document.activeElement !== $("#trName")) $("#trName").value = tr.name;
  if (document.activeElement !== $("#trMass")) $("#trMass").value = tr.mass;
  $("#trMassWrap").hidden = !["point", "analytic", "dynamic"].includes(tr.kind);
  $("#trMarkerCtl").hidden = tr.kind !== "point";
  $("#trColors").innerHTML = COLORS.map(
    (c) => `<button class="swb${c.toLowerCase() === tr.color.toLowerCase() ? " on" : ""}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`,
  ).join("");
  $("#trColors")
    .querySelectorAll("[data-c]")
    .forEach((b) => (b.onclick = () => editTrack({ color: b.dataset.c })));
  $("#trMarkers").innerHTML = MARKERS.map(
    (m) => `<button data-v="${m}" class="${m === tr.marker ? "on" : ""}" aria-label="${m}">${SYMBOL[m]}</button>`,
  ).join("");
  $("#trMarkers")
    .querySelectorAll("button")
    .forEach((b) => (b.onclick = () => editTrack({ marker: b.dataset.v })));
  $("#trCount").textContent = isMarked(tr) ? t("pointsCount", { n: pointCount(tr) }) : t("computedCount");
  $("#addTrackBtn").disabled = st.tracks.length >= MAX_TRACKS;
  $("#delPtBtn").disabled = !isMarked(tr);
  $("#clearPtsBtn").disabled = !isMarked(tr);
  $("#autoBox").hidden = tr.kind !== "point";
  renderKind(tr);
}
function renderSettings() {
  setToggle($("#advTg"), st.autoAdvance);
  setToggle($("#trailTg"), st.showMarks);
  $("#smoothR").value = st.smooth;
  $("#smoothL").textContent = st.smooth === 1 ? t("smoothOff") : `±${st.smooth}`;
}

// ---------- measuring tools ----------
function measureValue(m, r) {
  if (!r) return `<span class="note">${t("measNone")}</span>`;
  const u = mapper().unit;
  if (m.kind === "tape") return `<div class="mv">${fmt(r.length, 4)} ${toHTML(u)}</div><div class="note">Δx = ${fmt(r.dx, 3)}, Δy = ${fmt(r.dy, 3)} ${toHTML(u)}</div>`;
  if (m.kind === "protractor") return `<div class="mv">${fmt(r.degrees, 4)}°</div>`;
  return `<div class="mv">r = ${fmt(r.r, 4)} ${toHTML(u)}</div><div class="note">${t("circleInfo", { x: fmt(r.cx, 4), y: fmt(r.cy, 4), u, rms: fmt(r.rms, 2), n: r.n })}</div>`;
}
function renderMeasures() {
  const M = mapper(),
    base = st.cal.camera ? st.cal.camera.base : 0;
  const pts = st.tracks.filter((q) => q.kind === "point");
  const html = st.measures
    .map((m) => {
      const r = evalMeasure(m, M, st.tracks, st.clip || { start: 0, end: 0, step: 1, fps: null, tOffset: 0, zero: 0 }, base);
      const src =
        m.kind === "circle"
          ? `<div class="row"><span class="sel"><select data-src="${m.id}">${pts.map((q) => `<option value="${q.id}"${q.id === m.source ? " selected" : ""}>${esc(q.name)}</option>`).join("")}</select></span>
             <label class="num"><span>${t("from")}</span> <input type="number" data-from="${m.id}" value="${m.from ?? ""}" step="1" inputmode="numeric" /></label>
             <label class="num"><span>${t("to")}</span> <input type="number" data-to="${m.id}" value="${m.to ?? ""}" step="1" inputmode="numeric" /></label></div>`
          : "";
      return `<div class="meas"><div class="mh"><span class="ms">${{ tape: "straighten", protractor: "square_foot", circle: "circle" }[m.kind]}</span>
        <span>${t("meas_" + m.kind)}</span><input type="text" data-name="${m.id}" value="${esc(m.name)}" maxlength="12" aria-label="${t("name")}" />
        <button class="btn ic" data-del="${m.id}" aria-label="${t("deleteTrack")}"><span class="ms">delete</span></button></div>${src}${measureValue(m, r)}</div>`;
    })
    .join("");
  const box = $("#measList");
  if (box.dataset.h === html && box.contains(document.activeElement)) return;
  if (box.dataset.h !== html) {
    box.innerHTML = html;
    box.dataset.h = html;
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => removeMeasure(+b.dataset.del)));
    box.querySelectorAll("[data-name]").forEach((el) => el.addEventListener("change", () => editMeasure(+el.dataset.name, { name: el.value.trim() })));
    box.querySelectorAll("[data-src]").forEach((el) => (el.onchange = () => editMeasure(+el.dataset.src, { source: +el.value })));
    const frame = (el, key, attr) =>
      el.addEventListener("change", () => {
        const v = el.value.trim() === "" ? null : Math.round(parseFloat(el.value));
        editMeasure(+el.dataset[attr], { [key]: Number.isFinite(v) ? v : null });
      });
    box.querySelectorAll("[data-from]").forEach((el) => frame(el, "from", "from"));
    box.querySelectorAll("[data-to]").forEach((el) => frame(el, "to", "to"));
  }
}
function newMeasure(kind) {
  if (st.measures.length >= 12) return;
  if (kind === "circle") {
    const src = track().kind === "point" ? track() : st.tracks.find((q) => q.kind === "point");
    if (!src || pointCount(src) < 3) return toast(t("circleNeed"));
    addMeasure({ kind: "circle", source: src.id, from: null, to: null, color: "#00A7C4" });
    return;
  }
  const n = kind === "tape" ? 2 : 3;
  startCollect(kind, n, (pts) => addMeasure({ kind, pts, color: kind === "tape" ? "#F5A623" : "#C2185B" }));
}

function render() {
  renderList();
  renderSelected();
  renderSettings();
  renderMeasures();
}

function init() {
  $("#addKind").innerHTML = KINDS.map((k) => `<option value="${k}">${t("kind_" + k)}</option>`).join("");
  numberInput($("#trMass"), (v) => v >= 0 && editTrack({ mass: v }, "mass"));
  $("#trName").addEventListener("change", () => {
    const v = $("#trName").value.trim();
    if (v) editTrack({ name: v.slice(0, 12) });
  });
  $("#addTrackBtn").onclick = () => addTrack($("#addKind").value);
  $("#delTrackBtn").onclick = () => {
    const tr = track();
    if (pointCount(tr) && !confirm(t("confirmDeleteTrack", { name: tr.name }))) return;
    removeTrack(st.active);
  };
  $("#advTg").onclick = () => setSetting({ autoAdvance: !isOn($("#advTg")) });
  $("#trailTg").onclick = () => setSetting({ showMarks: !isOn($("#trailTg")) });
  $("#smoothR").oninput = () => setSetting({ smooth: +$("#smoothR").value });
  $("#delPtBtn").onclick = deletePoint;
  $("#clearPtsBtn").onclick = () => {
    if (!st.src || !pointCount(track())) return;
    if (!confirm(t("confirmClear"))) return;
    clearPoints();
    toast(t("cleared"));
  };
  $("#addTape").onclick = () => newMeasure("tape");
  $("#addProt").onclick = () => newMeasure("protractor");
  $("#addCircle").onclick = () => newMeasure("circle");
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && st.src && !e.target.matches("input,select,textarea")) {
      deletePoint();
      e.preventDefault();
    }
  });
  for (const e of ["source", "tracks", "lang", "settings", "calib", "clip"]) on(e, render);
  render();
}

export { init };
