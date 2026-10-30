// Crackler: Keyboard shortcuts for tools, tabs and common actions. Arrows, Space, Home/End and undo live elsewhere.
// Letters are ignored while typing in a field, with a dialog open, or together with Ctrl/Cmd/Alt (except Ctrl+S, Ctrl+O).
import { $ } from "../dom.js";
import { addTrack, setTool, st } from "../state.js";
import { zoomAt, fitCam, viewSize } from "./stage.js";

const TABS = ["clip", "calib", "tracks", "table", "plot"];
const zoom = (f) => zoomAt(viewSize()[0] / 2, viewSize()[1] / 2, f);

function init() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,select,textarea") || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === "s" && st.src) $("#saveProjBtn").click();
      else if (k === "o") $("#fileIn").click();
      else return;
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === "?" || (k === "/" && e.shiftKey)) $("#help").showModal();
    else if (!st.src) return;
    else if (k === "m") setTool("mark");
    else if (k === "c") setTool("calib", st.cal.stick ? null : "stickA");
    else if (k === "v") setTool("view");
    else if (k === "n") addTrack("point");
    else if (k === "f") fitCam();
    else if (k === "+" || k === "=") zoom(1.4);
    else if (k === "-" || k === "_") zoom(1 / 1.4);
    else if (k === "g") $("#snapBtn").click();
    else if (k >= "1" && k <= "5") document.querySelector(`.tab[data-tab="${TABS[+k - 1]}"]`).click();
    else return;
    e.preventDefault();
  });
}

export { init };
