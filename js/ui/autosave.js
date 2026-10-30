// Crackler: Autosave of the analysis in this browser, and the offer to restore it for the same video.
// Nothing is written until the offer (if any) has been answered, so a blank start never overwrites saved work.
import { createAutosave, videoId, videoPrefix } from "../autosave.js";
import { $ } from "../dom.js";
import { getLang, t } from "../i18n.js";
import { loadProjectText, on, projectText, st } from "../state.js";
import { pointCount } from "../tracks.js";
import { toast } from "./controls.js";

const storage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => localStorage.setItem(k, v), // may throw: the store handles it
};
const store = createAutosave(storage);
let enabled = false,
  timer = 0,
  offered = null; // the entry being offered

const skip = () => !st.src || st.src.kind === "synthetic";
const idNow = () => videoId(st.src.info, st.src.frameCount);
const totalPoints = () => st.tracks.reduce((n, tr) => n + pointCount(tr), 0);

// ---------- saving ----------
function save() {
  clearTimeout(timer);
  timer = 0;
  if (!enabled || skip()) return;
  store.save(idNow(), projectText(), { points: totalPoints() });
}
function schedule() {
  if (!enabled || skip()) return;
  clearTimeout(timer);
  timer = setTimeout(save, 1200);
}

// ---------- the restore offer ----------
function showOffer(entry) {
  offered = entry;
  const when = new Date(entry.t).toLocaleString(getLang() === "it" ? "it-IT" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  $("#restoreText").textContent = t("restoreFound", { n: entry.meta.points || 0, when });
  $("#restoreBar").hidden = false;
}
function closeOffer() {
  offered = null;
  $("#restoreBar").hidden = true;
  enabled = true;
}
function onSource() {
  clearTimeout(timer);
  enabled = false;
  $("#restoreBar").hidden = true;
  offered = null;
  if (skip()) return;
  const e = store.find(idNow());
  // offer only if there is real work to bring back and the screen is still empty
  if (e && (e.meta.points || 0) > 0 && totalPoints() === 0) showOffer(e);
  else enabled = true;
}

// Autosaved extraction settings for a video (before its frames are loaded), or null.
function savedExtract(info) {
  const e = store.findPrefix(videoPrefix(info));
  if (!e) return null;
  try {
    const v = JSON.parse(e.text).video;
    return v && v.extract ? v.extract : null;
  } catch {
    return null;
  }
}

function init() {
  $("#restoreYes").onclick = () => {
    const e = offered;
    closeOffer();
    if (e && loadProjectText(e.text).applied) toast(t("restored"));
  };
  $("#restoreNo").onclick = () => {
    if (offered) store.remove(offered.id);
    closeOffer();
  };
  on("source", onSource);
  for (const ev of ["history", "settings"]) on(ev, schedule);
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => document.hidden && save());
}

export { init, savedExtract };
