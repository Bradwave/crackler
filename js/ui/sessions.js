// Crackler: Sessions: videos kept in this browser (IndexedDB) with their analysis, listed in a dialog.
// A session is created when a video is loaded with "keep" ticked; its analysis is saved as you work.
import { $ } from "../dom.js";
import { idbBackend } from "../idb.js";
import { getLang, t } from "../i18n.js";
import { createSessions } from "../sessions.js";
import { on, projectText, st } from "../state.js";
import { pointCount } from "../tracks.js";
import { fmtBytes } from "../util.js";
import { toast } from "./controls.js";

let store = null,
  current = null,
  timer = 0,
  openFn = null;
const dlg = $("#sessDlg");
const totalPoints = () => st.tracks.reduce((n, tr) => n + pointCount(tr), 0);
const skip = () => !current || !store || !st.src || st.src.kind === "synthetic";
const available = () => !!store;

// ---------- saving ----------
async function flush() {
  clearTimeout(timer);
  timer = 0;
  if (skip()) return;
  try {
    if (!(await store.save(current, { project: projectText(), points: totalPoints() }))) current = null;
  } catch {
    // out of space: the localStorage autosave still has the work
  }
}
function schedule() {
  if (skip()) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

// Called by the loader once the video is in. adopt: id of the session being reopened.
async function attach({ file, info, extract, keep, adopt }) {
  current = null;
  if (!store) return;
  if (adopt) {
    current = adopt;
    return;
  }
  if (!keep) return;
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    current = await store.create(file, {
      name: file.name.replace(/\.[^.]+$/, ""),
      videoName: file.name,
      size: file.size,
      duration: info.duration,
      extract,
      project: projectText(),
      points: totalPoints(),
    });
    toast(t("sessionKept"));
  } catch {
    toast(t("sessionFull"), 6000);
  }
}

// ---------- the dialog ----------
const when = (ms) =>
  new Date(ms).toLocaleString(getLang() === "it" ? "it-IT" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

async function render() {
  const box = $("#sessList");
  box.textContent = "";
  const list = await store.list();
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = t("sessionsNone");
    box.append(p);
  }
  for (const m of list) {
    const el = document.createElement("div");
    el.className = "sess";
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 80;
    name.value = m.name;
    name.setAttribute("aria-label", t("sessionRename"));
    name.onchange = () => store.rename(m.id, name.value).then(render);
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = t("sessionMeta", { video: m.videoName, size: fmtBytes(m.size), n: m.points || 0, when: when(m.t) });
    const row = document.createElement("div");
    row.className = "row";
    const open = document.createElement("button");
    open.className = "btn primary";
    open.innerHTML = '<span class="ms">play_arrow</span>';
    open.append(t("sessionOpen"));
    open.onclick = async () => {
      const blob = await store.video(m.id);
      if (!blob) return toast(t("sessionGone"), 5000);
      await flush();
      dlg.close();
      openFn(m, blob);
    };
    const del = document.createElement("button");
    del.className = "btn";
    del.innerHTML = '<span class="ms">delete</span>';
    del.append(t("sessionDelete"));
    del.onclick = async () => {
      if (!confirm(t("sessionDeleteQ", { name: m.name }))) return;
      await store.remove(m.id);
      if (m.id === current) current = null;
      render();
    };
    row.append(open, del);
    el.append(name, meta, row);
    box.append(el);
  }
  let usage = "";
  try {
    const e = await navigator.storage.estimate();
    if (e && e.quota) usage = t("sessionUsage", { used: fmtBytes(e.usage || 0), quota: fmtBytes(e.quota) });
  } catch {
    // no estimate available
  }
  $("#sessUsage").textContent = usage;
}
async function openDialog() {
  if (!store) return;
  await flush();
  await render();
  dlg.showModal();
}

function init({ open }) {
  openFn = open;
  $("#sessClose").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
  document.querySelectorAll("#sessBtn, [data-sessions]").forEach((b) => (b.onclick = openDialog));
  on("source", () => (current = null));
  for (const ev of ["history", "settings"]) on(ev, schedule);
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  idbBackend().then((be) => {
    if (!be) return;
    store = createSessions(be);
    document.querySelectorAll("#sessBtn, [data-sessions]").forEach((b) => (b.hidden = false));
    $("#lKeepWrap").hidden = false;
  });
}

export { init, attach, flush, available, openDialog };
