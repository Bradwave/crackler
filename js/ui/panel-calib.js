// Crackler: Calibration panel: stick and length, origin, axes, y inversion, perspective rectangle, lens, camera motion.
import { UNITS, createCalibration, hasPersp, scale, stickAngle, stickPixels } from "../calibration.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { fitK1, lensFor } from "../lens.js";
import { on, setTool, startCollect, st, touchCal } from "../state.js";
import { pointCount } from "../tracks.js";
import { DEG, fmt } from "../util.js";
import { isOn, numberInput, setToggle, toast } from "./controls.js";

let lastLensFit = null; // { k1, rms } of the last estimate, for the note
const draft = { w: 1, h: 1 }; // rectangle size typed before the corners are placed

function setVal(id, v) {
  const el = $(id);
  if (document.activeElement !== el) el.value = v;
}
function render() {
  const c = st.cal;
  setVal("#stickLen", c.length);
  $("#unitSel").value = c.unit;
  setVal("#oX", +c.origin[0].toFixed(2));
  setVal("#oY", +c.origin[1].toFixed(2));
  const deg = c.angle * DEG;
  setVal("#angR", +deg.toFixed(1));
  $("#angL").textContent = deg.toFixed(1) + "°";
  setToggle($("#invYTg"), c.invertY);
  $("#scaleNote").textContent = hasPersp(c)
    ? t("scaleNotePersp")
    : c.stick
      ? t("scaleNote", { len: fmt(stickPixels(c), 4), k: fmt(scale(c), 4), unit: c.unit })
      : t("noScale");
  $("#stickBtn").disabled = !st.src;
  $("#alignBtn").disabled = !c.stick && !hasPersp(c);
  renderPersp();
  renderLens();
  renderCamera();
}

// ---------- perspective ----------
function renderPersp() {
  const c = st.cal,
    p = c.persp;
  setVal("#perspW", p ? p.w : draft.w);
  setVal("#perspH", p ? p.h : draft.h);
  $("#perspUnit").textContent = c.unit;
  $("#perspBtn").disabled = !st.src;
  $("#perspClear").disabled = !p;
  $("#perspNote").textContent = !p ? "" : hasPersp(c) ? t("perspOk") : t("perspBad");
}
// ---------- lens ----------
function renderLens() {
  const l = st.cal.lens;
  setVal("#lensK1", +l.k1.toFixed(4));
  setVal("#lensK2", +l.k2.toFixed(4));
  setVal("#lensR", l.k1);
  $("#lensL").textContent = l.k1.toFixed(3);
  $("#lensAdd").disabled = !st.src;
  $("#lensFit").disabled = l.lines.filter((x) => x.length >= 3).length === 0;
  $("#lensNote").textContent =
    t("lensLines", { n: l.lines.length }) + (lastLensFit ? " " + t("lensFitted", { k1: fmt(lastLensFit.k1, 3), rms: fmt(lastLensFit.rms, 2) }) : "");
}
// ---------- camera motion ----------
function renderCamera() {
  const cam = st.cal.camera,
    pts = st.tracks.filter((tr) => tr.kind === "point");
  const opts = (sel, none) =>
    `<option value="">${none}</option>` +
    pts.map((tr) => `<option value="${tr.id}"${tr.id === sel ? " selected" : ""}>${tr.name.replace(/[<&]/g, "")}</option>`).join("");
  const a = $("#camA"),
    b = $("#camB");
  const ha = opts(cam ? cam.a : null, t("camNone")),
    hb = opts(cam ? cam.b : null, t("camNone"));
  if (a.dataset.h !== ha) (a.innerHTML = ha), (a.dataset.h = ha);
  if (b.dataset.h !== hb) (b.innerHTML = hb), (b.dataset.h = hb);
  a.value = cam ? String(cam.a) : "";
  b.value = cam && cam.b != null ? String(cam.b) : "";
  b.disabled = !cam;
  setVal("#camBase", cam ? cam.base : st.frame);
  $("#camBase").disabled = !cam;
  $("#camHere").disabled = !cam;
  const ref = cam && st.tracks.find((tr) => tr.id === cam.a);
  $("#camNote").textContent = !cam ? "" : ref && pointCount(ref) >= 2 ? t("camOk", { n: pointCount(ref) }) : t("camFew");
}
function setCamera(patch) {
  const cur = st.cal.camera;
  const a = patch.a !== undefined ? patch.a : cur ? cur.a : null;
  if (a == null) st.cal.camera = null;
  else st.cal.camera = { a, b: patch.b !== undefined ? patch.b : cur ? cur.b : null, base: patch.base !== undefined ? patch.base : cur ? cur.base : st.frame };
  if (st.cal.camera && st.cal.camera.b === st.cal.camera.a) st.cal.camera.b = null;
  touchCal();
}

function init() {
  $("#unitSel").innerHTML = UNITS.map((u) => `<option value="${u}">${u}</option>`).join("");
  $("#stickBtn").onclick = () => {
    st.cal.stick = null;
    st.pendingA = null;
    setTool("calib", "stickA");
    touchCal();
  };
  $("#originBtn").onclick = () => setTool("calib", "origin");
  numberInput($("#stickLen"), (v) => {
    if (v > 0) {
      st.cal.length = v;
      touchCal("len");
    }
  });
  $("#unitSel").onchange = () => {
    st.cal.unit = $("#unitSel").value;
    touchCal();
  };
  numberInput($("#oX"), (v) => ((st.cal.origin[0] = v), touchCal("origin")));
  numberInput($("#oY"), (v) => ((st.cal.origin[1] = v), touchCal("origin")));
  $("#angR").oninput = () => {
    st.cal.angle = +$("#angR").value / DEG;
    touchCal("angle");
  };
  $("#alignBtn").onclick = () => {
    st.cal.angle = stickAngle(st.cal);
    touchCal();
  };
  $("#angZero").onclick = () => {
    st.cal.angle = 0;
    touchCal();
  };
  $("#invYTg").onclick = () => {
    st.cal.invertY = !isOn($("#invYTg"));
    touchCal();
  };
  $("#clearCalTg").onclick = () => {
    if (!st.src) return;
    st.cal = createCalibration(st.src.width, st.src.height);
    lastLensFit = null;
    setTool("calib", null);
    touchCal();
  };

  // perspective
  $("#perspBtn").onclick = () =>
    startCollect("persp", 4, (pts) => {
      const old = st.cal.persp;
      st.cal.persp = { pts, w: old ? old.w : draft.w, h: old ? old.h : draft.h };
      touchCal();
    });
  numberInput($("#perspW"), (v) => {
    if (v <= 0) return;
    draft.w = v;
    if (st.cal.persp) (st.cal.persp.w = v), touchCal("persp");
  });
  numberInput($("#perspH"), (v) => {
    if (v <= 0) return;
    draft.h = v;
    if (st.cal.persp) (st.cal.persp.h = v), touchCal("persp");
  });
  $("#perspClear").onclick = () => {
    st.cal.persp = null;
    touchCal();
  };

  // lens
  const setLens = (patch, key) => {
    Object.assign(st.cal.lens, patch);
    touchCal(key);
  };
  numberInput($("#lensK1"), (v) => setLens({ k1: Math.max(-2, Math.min(2, v)) }, "lens"));
  numberInput($("#lensK2"), (v) => setLens({ k2: Math.max(-2, Math.min(2, v)) }, "lens"));
  $("#lensR").oninput = () => setLens({ k1: +$("#lensR").value }, "lens");
  $("#lensAdd").onclick = () =>
    startCollect("lens", 0, (pts) => {
      if (pts.length < 3) return toast(t("lensFew"));
      st.cal.lens.lines.push(pts);
      lastLensFit = null;
      touchCal();
    });
  $("#lensFit").onclick = () => {
    const r = fitK1(st.cal.lens.lines, lensFor(0, 0, st.cal.width, st.cal.height));
    if (!r) return toast(t("lensFitFail"));
    lastLensFit = r;
    setLens({ k1: r.k1, k2: 0 });
  };
  $("#lensReset").onclick = () => {
    lastLensFit = null;
    setLens({ k1: 0, k2: 0, lines: [] });
  };

  // camera motion
  $("#camA").onchange = () => setCamera({ a: $("#camA").value === "" ? null : +$("#camA").value, base: st.cal.camera ? st.cal.camera.base : st.frame });
  $("#camB").onchange = () => setCamera({ b: $("#camB").value === "" ? null : +$("#camB").value });
  numberInput($("#camBase"), (v) => setCamera({ base: Math.max(0, Math.round(v)) }));
  $("#camHere").onclick = () => setCamera({ base: st.frame });

  for (const e of ["source", "calib", "lang", "tracks"]) on(e, render);
  on("frame", () => !st.cal.camera && setVal("#camBase", st.frame));
  render();
}

export { init };
