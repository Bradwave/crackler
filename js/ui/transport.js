// Crackler: Frame slider, step and play buttons, speed. Playback steps the frame index, never <video>.
import { gridIndex, frameList } from "../clip.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { emit, gotoFrame, on, st, stepBy, timeAt } from "../state.js";
import { fmt } from "../util.js";
import { segBind } from "./controls.js";

const range = $("#frameRange");
let last = 0,
  acc = 0;

function sync() {
  const has = !!st.src;
  for (const id of ["firstBtn", "prevBtn", "playBtn", "nextBtn", "lastBtn"]) $("#" + id).disabled = !has;
  range.disabled = !has;
  if (!has) {
    $("#frameLbl").textContent = "";
    return;
  }
  const count = frameList(st.clip).length;
  range.max = Math.max(0, count - 1);
  range.value = Math.max(0, gridIndex(st.clip, st.frame));
  $("#frameLbl").textContent = t("frameLbl", {
    n: st.frame,
    last: st.src.frameCount - 1,
    t: fmt(timeAt(st.frame), 4),
  });
  $("#playIcon").textContent = st.playing ? "pause" : "play_arrow";
}
function setPlaying(p) {
  if (!st.src) return;
  if (p && st.frame >= st.clip.end) gotoFrame(st.clip.start);
  st.playing = p;
  if (p) {
    last = performance.now();
    acc = 0;
    requestAnimationFrame(tick);
  }
  emit("play");
}
function tick(now) {
  if (!st.playing) return;
  acc += ((now - last) / 1000) * st.speed;
  last = now;
  for (let i = 0; i < 6; i++) {
    const next = Math.min(st.clip.end, st.frame + st.clip.step);
    if (next === st.frame) {
      st.playing = false;
      emit("play");
      return;
    }
    const need = Math.max(1e-3, st.src.timeOf(next) - st.src.timeOf(st.frame));
    if (acc < need) break;
    acc -= need;
    stepBy(1);
  }
  requestAnimationFrame(tick);
}

function init() {
  range.addEventListener("input", () => gotoFrame(st.clip.start + +range.value * st.clip.step));
  $("#prevBtn").onclick = () => stepBy(-1);
  $("#nextBtn").onclick = () => stepBy(1);
  $("#firstBtn").onclick = () => gotoFrame(st.clip.start);
  $("#lastBtn").onclick = () => gotoFrame(st.clip.end);
  $("#playBtn").onclick = () => setPlaying(!st.playing);
  segBind($("#speedSeg"), (v) => (st.speed = +v));
  for (const e of ["frame", "clip", "source", "play", "lang"]) on(e, sync);
  document.addEventListener("keydown", (e) => {
    if (!st.src || e.target.matches("input,select,textarea") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight") stepBy(1);
    else if (e.key === "ArrowLeft") stepBy(-1);
    else if (e.key === "Home") gotoFrame(st.clip.start);
    else if (e.key === "End") gotoFrame(st.clip.end);
    else if (e.code === "Space") setPlaying(!st.playing);
    else return;
    e.preventDefault();
  });
  sync();
}

export { init, setPlaying };
