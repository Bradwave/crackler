// Crackler: Overlay controls (velocity, acceleration, net force arrows, trails, labels) and snapshot export.
import { $ } from "../dom.js";
import { t } from "../i18n.js";
import { on, setOverlay, st } from "../state.js";
import { isOn, setToggle } from "./controls.js";
import { exportSnapshot } from "./snapshot.js";

const TOGGLES = { ovV: "v", ovA: "a", ovF: "f", ovTrail: "trail", ovLabels: "labels", ovStamp: "stamp" };
const SIZES = { ovSv: ["sv", "ovSvL"], ovSa: ["sa", "ovSaL"], ovSf: ["sf", "ovSfL"] };

function render() {
  const o = st.overlay;
  for (const [id, key] of Object.entries(TOGGLES)) setToggle($("#" + id), o[key]);
  for (const [id, [key, lbl]] of Object.entries(SIZES)) {
    if (document.activeElement !== $("#" + id)) $("#" + id).value = o[key];
    $("#" + lbl).textContent = `×${o[key].toFixed(2)}`;
  }
  $("#ovTrailLen").value = o.trailLen;
  $("#ovTrailLenL").textContent = o.trailLen === 0 ? t("ovAll") : t("ovFrames", { n: o.trailLen });
  $("#ovExport").disabled = !st.src;
  $("#snapBtn").disabled = !st.src;
}

function init() {
  for (const [id, key] of Object.entries(TOGGLES)) $("#" + id).onclick = () => setOverlay({ [key]: !isOn($("#" + id)) });
  for (const [id, [key]] of Object.entries(SIZES)) $("#" + id).oninput = () => setOverlay({ [key]: +$("#" + id).value });
  $("#ovTrailLen").oninput = () => setOverlay({ trailLen: +$("#ovTrailLen").value });
  $("#ovExport").onclick = exportSnapshot;
  $("#snapBtn").onclick = exportSnapshot;
  for (const e of ["source", "settings", "lang"]) on(e, render);
  render();
}

export { init };
