// Crackler: Clip panel: video info, warnings, start/end/step, frame rate, time offset, t = 0 frame.
import { frameList } from "../clip.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { loadProjectText, on, projectText, st, timeAt, updateClip } from "../state.js";
import { downloadText, fmt, fmtBytes } from "../util.js";
import { isOn, numberInput, setToggle, toast } from "./controls.js";

function warningText(w) {
  return t("warn_" + w.type, { count: w.count, at: w.at });
}
function renderInfo() {
  const el = $("#clipInfo"),
    box = $("#warnBox");
  if (!st.src) {
    el.textContent = t("noVideo");
    box.innerHTML = "";
    return;
  }
  const s = st.src,
    i = s.info || {};
  const parts = [
    i.name && i.name !== "synthetic" ? i.name : t("syntheticName"),
    `${s.width}×${s.height}`,
    t("framesInfo", { n: s.frameCount, fps: fmt(s.fps, 4) }),
    t("durationInfo", { s: fmt(s.timeOf(s.frameCount - 1), 4) }),
  ];
  if (i.size) parts.push(fmtBytes(i.size));
  el.textContent = parts.join(" · ");
  box.innerHTML = s.warnings
    .map((w) => `<div class="warn"><span class="ms">warning</span><span>${warningText(w)}</span></div>`)
    .join("");
}
function renderFields() {
  if (!st.src) return;
  const c = st.clip,
    set = (id, v) => {
      const el = $(id);
      if (document.activeElement !== el) el.value = v;
    };
  const last = st.src.frameCount - 1;
  for (const id of ["#cStart", "#cEnd", "#cZero"]) {
    $(id).min = 0;
    $(id).max = last;
  }
  set("#cStart", c.start);
  set("#cEnd", c.end);
  set("#cStep", c.step);
  set("#cZero", c.zero);
  set("#cOff", +c.tOffset.toFixed(6));
  setToggle($("#fpsTg"), c.fps > 0);
  $("#cFps").disabled = !(c.fps > 0);
  set("#cFps", c.fps > 0 ? c.fps : +st.src.fps.toFixed(3));
  const n = frameList(c).length;
  $("#clipTimes").textContent = t("clipTimes", {
    n,
    t0: fmt(timeAt(c.start), 4),
    t1: fmt(timeAt(c.end), 4),
  });
}

// ---------- project file ----------
function renderProject() {
  $("#saveProjBtn").disabled = !st.src;
  const p = st.pending;
  $("#projNote").textContent = p ? t("projPending", { name: p.video.name || "?", n: p.video.frames }) : t("projHint");
}
async function onProjectFile(file) {
  if (!file) return;
  const r = loadProjectText(await file.text());
  if (r.error) return toast(t("projErr_" + r.error), 5000);
  toast(t(r.applied ? "projLoaded" : "projWaiting", { name: r.project.video.name || "?" }), 5000);
}
function saveProject() {
  if (!st.src) return;
  const base = ((st.src.info && st.src.info.name) || "crackler").replace(/\.[^.]+$/, "");
  downloadText(`${base}.crackler.json`, projectText(), "application/json");
  toast(t("projSaved"));
}

function init() {
  $("#saveProjBtn").onclick = saveProject;
  $("#loadProjBtn").onclick = () => $("#projIn").click();
  $("#projIn").onchange = () => {
    onProjectFile($("#projIn").files[0]);
    $("#projIn").value = "";
  };
  for (const e of ["source", "settings", "lang"]) on(e, renderProject);
  renderProject();
  const num = (id, key) =>
    numberInput($(id), (v) => st.src && updateClip({ [key]: key === "tOffset" ? v : Math.round(v) }));
  num("#cStart", "start");
  num("#cEnd", "end");
  num("#cStep", "step");
  num("#cZero", "zero");
  num("#cOff", "tOffset");
  numberInput($("#cFps"), (v) => st.src && v > 0 && updateClip({ fps: v }));
  $("#fpsTg").onclick = () => {
    if (!st.src) return;
    updateClip({ fps: isOn($("#fpsTg")) ? null : +st.src.fps.toFixed(3) });
  };
  $("#zeroHere").onclick = () => st.src && updateClip({ zero: st.frame });
  for (const e of ["source", "clip", "lang"]) on(e, () => (renderInfo(), renderFields()));
  renderInfo();
}

export { init };
