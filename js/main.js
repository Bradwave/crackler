// Crackler: Entry point: wires the language, theme, tabs, toolbar and the UI modules together.
import { $, $$ } from "./dom.js";
import { applyI18n, getLang, onLangChange, setLang, t } from "./i18n.js";
import { canRedo, canUndo, emit, finishCollect, on, redo, setTool, st, undo } from "./state.js";
import { segBind, segSet } from "./ui/controls.js";
import * as autosave from "./ui/autosave.js";
import * as autotrack from "./ui/autotrack.js";
import * as loader from "./ui/loader.js";
import * as panelCalib from "./ui/panel-calib.js";
import * as panelClip from "./ui/panel-clip.js";
import * as panelCustom from "./ui/panel-custom.js";
import * as panelOverlay from "./ui/panel-overlay.js";
import * as panelPlot from "./ui/panel-plot.js";
import * as panelTable from "./ui/panel-table.js";
import * as panelTracks from "./ui/panel-tracks.js";
import * as pointer from "./ui/pointer.js";
import * as stage from "./ui/stage.js";
import * as transport from "./ui/transport.js";
import { store } from "./util.js";

// ---------- language ----------
function syncLang() {
  for (const seg of $$("[data-lang-seg]")) segSet(seg, getLang());
  updateHint();
}
function initLang() {
  for (const seg of $$("[data-lang-seg]")) segBind(seg, (v) => setLang(v));
  onLangChange(() => {
    syncLang();
    emit("lang");
  });
  applyI18n();
  syncLang();
}

// ---------- theme: auto, light, dark ----------
const THEMES = ["auto", "light", "dark"];
function setTheme(v) {
  if (v === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", v);
  store("crackler.theme", v);
  segSet($("#themeSeg"), v);
}
function initTheme() {
  const saved = store("crackler.theme");
  setTheme(THEMES.includes(saved) ? saved : "auto");
  segBind($("#themeSeg"), setTheme);
  $("[data-theme-btn]").onclick = () => {
    const cur = store("crackler.theme") || "auto";
    setTheme(THEMES[(THEMES.indexOf(cur) + 1) % 3]);
  };
}

// ---------- tabs and tools ----------
function initTabs() {
  $$(".tab").forEach(
    (tab) =>
      (tab.onclick = () => showTab(tab.dataset.tab)),
  );
}
function showTab(name) {
  $$(".tab").forEach((x) => {
    x.classList.toggle("on", x.dataset.tab === name);
    x.setAttribute("aria-selected", x.dataset.tab === name);
  });
  $$(".tabpane").forEach((p) => (p.hidden = p.id !== "pane-" + name));
  emit("tab");
}
function initTools() {
  segBind($("#toolSeg"), (v) => setTool(v, v === "calib" && !st.cal.stick ? "stickA" : null));
  on("tool", () => {
    segSet($("#toolSeg"), st.tool === "collect" ? "calib" : st.tool);
    renderCollect();
    const cv = stage.cv;
    cv.classList.toggle("calib", st.tool === "calib");
    cv.classList.toggle("view", st.tool === "view");
    if (st.tool === "calib" && st.calibStep) showTab("calib");
    updateHint();
  });
  on("source", updateHint);
  $("#collectDone").onclick = () => finishCollect();
  $("#collectCancel").onclick = () => finishCollect(true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && st.collect) finishCollect(true);
  });
  $("#zoomInBtn").onclick = () => stage.zoomAt(stage.viewSize()[0] / 2, stage.viewSize()[1] / 2, 1.4);
  $("#zoomOutBtn").onclick = () => stage.zoomAt(stage.viewSize()[0] / 2, stage.viewSize()[1] / 2, 1 / 1.4);
  $("#zoomFitBtn").onclick = stage.fitCam;
}
// The bar that says what to click while points are being collected (rectangle corners, tape ends ...).
function renderCollect() {
  const c = st.collect;
  $("#collectBar").hidden = !c;
  if (!c) return;
  $("#collectText").textContent = t("collect_" + c.kind, { n: c.pts.length + 1, of: c.need });
  $("#collectDone").hidden = c.need !== 0;
  $("#collectDone").disabled = c.pts.length < 3;
}
function updateHint() {
  const touch = matchMedia("(pointer: coarse)").matches;
  let key = "hintNoVideo";
  if (st.src) {
    if (st.tool === "mark") key = touch ? "hintMarkTouch" : "hintMark";
    else if (st.tool === "view") key = "hintView";
    else if (st.tool === "collect") key = "hintCollect";
    else key = st.calibStep ? { stickA: "hintStickA", stickB: "hintStickB", origin: "hintOrigin" }[st.calibStep] : "hintCalib";
  }
  $("#hint").textContent = t(key);
}

// ---------- bigger panel on phones ----------
function initPanelGrow() {
  const btn = $("#panelGrow"),
    layout = $(".layout");
  btn.onclick = () => {
    const on = !layout.classList.contains("panel-big");
    layout.classList.toggle("panel-big", on);
    btn.setAttribute("aria-pressed", on);
    $("#panelGrowIcon").textContent = on ? "unfold_less" : "unfold_more";
    window.dispatchEvent(new Event("resize"));
  };
}

// ---------- undo and redo ----------
function initUndo() {
  $("#undoBtn").onclick = undo;
  $("#redoBtn").onclick = redo;
  const sync = () => {
    $("#undoBtn").disabled = !st.src || !canUndo();
    $("#redoBtn").disabled = !st.src || !canRedo();
  };
  on("history", sync);
  on("source", sync);
  sync();
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.matches("input,select,textarea") || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (k === "z") (e.shiftKey ? redo : undo)();
    else if (k === "y") redo();
    else return;
    e.preventDefault();
  });
}

// ---------- help ----------
function initHelp() {
  const dlg = $("#help");
  $$("[data-help-btn]").forEach((b) => (b.onclick = () => dlg.showModal()));
  $("#helpClose").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
}

// ---------- start ----------
initLang();
initTheme();
initTabs();
initHelp();
initUndo();
initPanelGrow();
stage.init();
pointer.init();
transport.init();
panelClip.init();
panelCalib.init();
panelTracks.init();
panelTable.init();
panelCustom.init();
panelOverlay.init();
panelPlot.init();
loader.init();
autosave.init();
autotrack.init();
initTools();
updateHint();
