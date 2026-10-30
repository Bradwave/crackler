// Crackler: UI helpers shared by the panels: toast, segmented buttons, toggles.
import { $, $$ } from "../dom.js";

// ---------- toast ----------
let toastT = 0;
function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- segmented buttons ----------
function segBind(root, fn) {
  $$("button", root).forEach(
    (b) =>
      (b.onclick = () => {
        segSet(root, b.dataset.v);
        fn(b.dataset.v, b);
      }),
  );
}
function segSet(root, v) {
  $$("button", root).forEach((x) => x.classList.toggle("on", x.dataset.v === String(v)));
}

// ---------- toggles ----------
function setToggle(el, on) {
  el.setAttribute("aria-pressed", on ? "true" : "false");
}
const isOn = (el) => el.getAttribute("aria-pressed") === "true";

// Number input that commits on change/Enter, and ignores empty or invalid text.
function numberInput(el, onCommit) {
  el.addEventListener("change", () => {
    const v = parseFloat(el.value.replace(",", "."));
    if (Number.isFinite(v)) onCommit(v);
  });
}

export { toast, segBind, segSet, setToggle, isOn, numberInput };
