// Crackler: Opening a video: file picker, extraction settings with memory estimate, progress, demo clip.
import { $ } from "../dom.js";
import { createFrames, probe, supported } from "../frames.js";
import { createSyntheticFrames, recordSyntheticVideo } from "../frames-synthetic.js";
import { t } from "../i18n.js";
import { parseProject } from "../project.js";
import { setSource, st } from "../state.js";
import { estimate } from "../timing.js";
import { downloadBlob, fmt, fmtBytes, store } from "../util.js";
import { savedExtract } from "./autosave.js";
import { toast } from "./controls.js";
import * as sessions from "./sessions.js";

const dlg = $("#loadDlg"),
  busy = $("#busy");
const WIDTHS = [320, 480, 640, 800, 960, 1280];
const STEPS = [1, 2, 3, 4, 6, 8];
let file = null,
  info = null,
  abort = null,
  adopt = null; // id of the stored session being reopened

// A phone has far less room than a laptop; the budget is adjustable in the dialog.
function defaultBudgetMB() {
  const saved = +store("crackler.budgetMB");
  if (saved > 0) return saved;
  const mem = navigator.deviceMemory || 4,
    phone = /iPhone|iPad|Android/i.test(navigator.userAgent);
  return phone ? 200 : Math.min(800, 100 * mem);
}

// ---------- dialog ----------
function readDlg() {
  const start = Math.max(0, parseFloat($("#lStart").value) || 0),
    end = Math.min(info.duration, parseFloat($("#lEnd").value) || info.duration);
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    maxWidth: +$("#lWidth").value,
    step: +$("#lStep").value,
    budget: Math.max(50, parseFloat($("#lBudget").value) || 200) * 1e6,
  };
}
function updateMem() {
  const o = readDlg();
  const e = estimate({ vw: info.width, vh: info.height, fps: info.fps, ...o });
  const box = $("#lMem");
  box.classList.toggle("over", e.over);
  box.innerHTML =
    t("memEstimate", { frames: e.frames, w: e.width, h: e.height, mem: fmtBytes(e.bytes), budget: fmtBytes(o.budget) }) +
    (e.over ? `<br><b>${t("memOver", { max: Math.floor(o.budget / (e.width * e.height * 4)) })}</b>` : "");
  $("#lGo").disabled = e.frames < 2;
}
function openDialog() {
  const sel = (id, list, def, fmtFn = String) => {
    $(id).innerHTML = list.map((v) => `<option value="${v}"${v === def ? " selected" : ""}>${fmtFn(v)}</option>`).join("");
  };
  const widths = WIDTHS.filter((w) => w <= info.width).concat(info.width < 320 ? [info.width] : []);
  sel("#lWidth", widths, widths.includes(640) ? 640 : widths[widths.length - 1]);
  sel("#lStep", STEPS, 1, (v) => (v === 1 ? t("allFrames") : t("everyN", { n: v })));
  $("#lStart").value = 0;
  $("#lEnd").value = +info.duration.toFixed(3);
  $("#lBudget").value = defaultBudgetMB();
  // a project is waiting for its video: repeat the same extraction so the frame numbers match
  const fromProject = st.pending && st.pending.video.extract;
  const x = fromProject || savedExtract(info);
  if (x) {
    $("#lStart").value = x.start;
    $("#lEnd").value = x.end;
    if (widths.includes(x.maxWidth)) $("#lWidth").value = x.maxWidth;
    if (STEPS.includes(x.step)) $("#lStep").value = x.step;
  }
  $("#loadInfo").textContent = t("loadInfo", {
    name: file.name,
    w: info.width,
    h: info.height,
    fps: fmt(info.fps, 4),
    d: fmt(info.duration, 4),
    measured: info.fpsMeasured ? "" : t("fpsGuess"),
  }) + (x ? " " + t(fromProject ? "projUseSame" : "autoUseSame") : "");
  $("#lKeep").checked = !adopt && store("crackler.keep") !== "0";
  $("#lKeepWrap").style.display = adopt ? "none" : "";
  $("#lKeepText").textContent = t("sessionKeep", { size: fmtBytes(file.size) });
  updateMem();
  dlg.showModal();
}

// ---------- extraction ----------
function showBusy(title) {
  $("#busyTitle").textContent = title;
  $("#busyBar").style.width = "0%";
  $("#busyNote").textContent = "";
  $("#busyCancel").hidden = false;
  busy.hidden = false;
}
async function extract() {
  const o = readDlg();
  store("crackler.budgetMB", String(Math.round(o.budget / 1e6)));
  const keep = $("#lKeep").checked && !$("#lKeepWrap").hidden;
  if (!$("#lKeepWrap").hidden && !adopt) store("crackler.keep", keep ? "1" : "0");
  dlg.close();
  await runExtract(o, keep);
}
async function runExtract(o, keep) {
  await sessions.flush();
  const reopened = adopt;
  abort = new AbortController();
  showBusy(t("extracting"));
  try {
    const src = createFrames();
    await src.load(file, {
      info,
      ...o,
      signal: abort.signal,
      onProgress: (f, n, attempt) => {
        $("#busyBar").style.width = Math.round(f * 100) + "%";
        $("#busyNote").textContent =
          t("extractProgress", { n }) +
          (attempt ? " · " + t("retrySlower", { k: attempt }) : "") +
          (document.hidden ? " · " + t("keepVisible") : "");
      },
    });
    src.info = { ...src.info, extract: { start: o.start, end: o.end, maxWidth: o.maxWidth, step: o.step } };
    const r = setSource(src);
    toast(r ? t(r === "applied" ? "projApplied" : "projMismatch") : t("loaded", { n: src.frameCount }), r ? 6000 : 2200);
    await sessions.attach({ file, info, extract: src.info.extract, keep, adopt: reopened });
  } catch (e) {
    if (e.name !== "AbortError") toast(t(e.message === "unsupported" ? "errUnsupported" : "errDecode"), 5000);
  } finally {
    busy.hidden = true;
    abort = null;
    adopt = null;
  }
}

// Reopens a stored session: the same extraction as before, then its analysis is applied.
async function openStored(rec, blob) {
  if (!supported()) return toast(t("errUnsupported"), 6000);
  file = new File([blob], rec.videoName, { type: blob.type });
  showBusy(t("reading"));
  $("#busyCancel").hidden = true;
  try {
    info = await probe(file);
    if (!(info.duration > 0) || !info.width) throw new Error("decode");
  } catch {
    busy.hidden = true;
    return toast(t("errDecode"), 5000);
  }
  busy.hidden = true;
  const parsed = parseProject(rec.project);
  st.pending = parsed.error ? null : parsed.project;
  adopt = rec.id;
  const x = rec.extract;
  if (!x) return openDialog();
  const o = { start: x.start, end: Math.min(x.end, info.duration), maxWidth: Math.min(x.maxWidth, info.width), step: x.step, budget: defaultBudgetMB() * 1e6 };
  const e = estimate({ vw: info.width, vh: info.height, fps: info.fps, ...o });
  if (e.over) return openDialog();
  await runExtract(o, false);
}

// ---------- entry points ----------
async function onFile(f) {
  if (!f) return;
  if (!supported()) return toast(t("errUnsupported"), 6000);
  if (adopt) {
    adopt = null;
    st.pending = null;
  }
  file = f;
  showBusy(t("reading"));
  $("#busyCancel").hidden = true;
  try {
    info = await probe(f);
    if (!(info.duration > 0) || !info.width) throw new Error("decode");
    busy.hidden = true;
    openDialog();
  } catch (e) {
    busy.hidden = true;
    toast(t("errDecode"), 5000);
  }
}
async function demo() {
  showBusy(t("makingDemo"));
  $("#busyCancel").hidden = true;
  try {
    const src = createSyntheticFrames();
    await src.load();
    setSource(src);
    toast(t("demoLoaded"), 4500);
  } finally {
    busy.hidden = true;
  }
}
async function downloadDemoVideo() {
  showBusy(t("recordingDemo"));
  $("#busyCancel").hidden = true;
  try {
    const { blob, ext } = await recordSyntheticVideo({}, (f) => ($("#busyBar").style.width = Math.round(f * 100) + "%"));
    downloadBlob(`crackler-free-fall.${ext}`, blob);
  } catch {
    toast(t("errRecord"), 5000);
  } finally {
    busy.hidden = true;
  }
}

function init() {
  const input = $("#fileIn");
  document.querySelectorAll("[data-open], #openBtn").forEach((b) => (b.onclick = () => input.click()));
  document.querySelectorAll("[data-demo], #demoBtn").forEach((b) => (b.onclick = demo));
  input.onchange = () => {
    onFile(input.files[0]);
    input.value = "";
  };
  for (const id of ["#lStart", "#lEnd", "#lWidth", "#lStep", "#lBudget"]) $(id).addEventListener("input", updateMem);
  $("#lGo").onclick = extract;
  $("#lCancel").onclick = () => {
    dlg.close();
    if (adopt) {
      adopt = null;
      st.pending = null;
    }
  };
  $("#busyCancel").onclick = () => abort && abort.abort();
  // drag and drop a file onto the stage
  const wrap = $("#wrap");
  wrap.addEventListener("dragover", (e) => e.preventDefault());
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    onFile(e.dataTransfer.files[0]);
  });
  $("#demoVideoBtn").onclick = downloadDemoVideo;
}

export { init, openStored };
