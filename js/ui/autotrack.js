// Crackler: Automatic tracking by template matching, from a point marked by hand.
// The pattern around the marked point is searched for in the next frame within a radius; the track stops
// where the match is weaker than the threshold, so the point can be corrected by hand and the run resumed.
import { cutTemplate, match, prepare, toGray } from "../autotrack.js";
import { frameList } from "../clip.js";
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { checkpoint, emit, gotoFrame, on, setSetting, st, track } from "../state.js";
import { getPoint, setPoint } from "../tracks.js";
import { isOn, segBind, segSet, setToggle, toast } from "./controls.js";

let running = false,
  stopFlag = false;
let scratch = null;

// Grey levels of a frame, read through a canvas (kept for the next call).
function grayOf(n) {
  const w = st.src.width,
    h = st.src.height;
  if (!scratch || scratch.width !== w || scratch.height !== h) {
    scratch = document.createElement("canvas");
    scratch.width = w;
    scratch.height = h;
    scratch.ctx = scratch.getContext("2d", { willReadFrequently: true });
  }
  scratch.ctx.drawImage(st.src.getFrame(n), 0, 0, w, h);
  return toGray(scratch.ctx.getImageData(0, 0, w, h).data, w, h);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function run() {
  if (running || !st.src) return;
  const tr = track(),
    a = st.auto;
  const start = st.frame;
  const p0 = tr.kind === "point" ? getPoint(tr, start) : null;
  if (!p0) return toast(t("autoNeedPoint"));
  const w = st.src.width,
    h = st.src.height;
  let tpl = cutTemplate(grayOf(start), w, h, p0[0], p0[1], a.half);
  if (!tpl) return toast(t("autoEdge"));
  tpl = prepare(tpl);
  const frames = frameList(st.clip);
  const i0 = frames.indexOf(start);
  if (i0 < 0) return toast(t("autoNeedPoint"));
  running = true;
  stopFlag = false;
  $("#autoRun").hidden = true;
  $("#autoStop").hidden = false;
  let pos = p0,
    n = 0,
    msg = "";
  try {
    for (let i = i0 + a.dir; i >= 0 && i < frames.length; i += a.dir) {
      if (stopFlag) {
        msg = t("autoStopped", { n });
        break;
      }
      const f = frames[i],
        gray = grayOf(f),
        m = match(gray, w, h, tpl, pos[0], pos[1], a.radius);
      if (!m || m.score < a.threshold) {
        msg = t("autoLost", { f, s: m ? m.score.toFixed(2) : "–" });
        gotoFrame(f);
        break;
      }
      setPoint(tr, f, [m.x, m.y]);
      pos = [m.x, m.y];
      n++;
      if (a.adapt) {
        const next = cutTemplate(gray, w, h, m.x, m.y, a.half);
        if (next) tpl = prepare(next);
      }
      gotoFrame(f);
      if (n % 4 === 0) emit("tracks");
      $("#autoMsg").textContent = t("autoRunning", { f });
      await tick();
      if (i + a.dir < 0 || i + a.dir >= frames.length) msg = t("autoDone", { n });
    }
    if (!msg) msg = t("autoDone", { n });
  } finally {
    running = false;
    $("#autoRun").hidden = false;
    $("#autoStop").hidden = true;
    emit("tracks");
    if (n) checkpoint();
    $("#autoMsg").textContent = msg;
  }
}

function render() {
  const a = st.auto;
  $("#autoHalf").value = a.half;
  $("#autoHalfL").textContent = `${2 * a.half + 1} px`;
  $("#autoRadius").value = a.radius;
  $("#autoRadiusL").textContent = `±${a.radius} px`;
  $("#autoThr").value = a.threshold;
  $("#autoThrL").textContent = a.threshold.toFixed(2);
  setToggle($("#autoAdapt"), a.adapt);
  segSet($("#autoDir"), String(a.dir));
}

function init() {
  $("#autoHalf").oninput = () => ((st.auto.half = +$("#autoHalf").value), render(), emit("settings"));
  $("#autoRadius").oninput = () => ((st.auto.radius = +$("#autoRadius").value), render(), emit("settings"));
  $("#autoThr").oninput = () => ((st.auto.threshold = +$("#autoThr").value), render());
  $("#autoAdapt").onclick = () => ((st.auto.adapt = !isOn($("#autoAdapt"))), render());
  segBind($("#autoDir"), (v) => (st.auto.dir = +v));
  $("#autoRun").onclick = run;
  $("#autoStop").onclick = () => (stopFlag = true);
  // show the template and search boxes on the video while this section is open
  $("#autoBox").addEventListener("toggle", () => setSetting({ autoShow: $("#autoBox").open }));
  on("lang", render);
  on("source", () => ($("#autoMsg").textContent = ""));
  render();
}

export { init };
