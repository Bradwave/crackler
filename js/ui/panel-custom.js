// Crackler: Custom table columns defined by formulas, and the user parameters they can use.
import { $ } from "../dom.js";
import { keyOf, nameProblem } from "../custom.js";
import { t } from "../i18n.js";
import { seriesOfTracks } from "../quantities.js";
import { addDef, addParam, editDef, editParam, on, removeDef, removeParam, st } from "../state.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function formulaMessage(e) {
  if (!e) return "";
  if (e.code === "unknownName") return t("customUnknown", { d: e.detail });
  return t("formulaErr_" + e.code, { pos: e.pos + 1, d: e.detail });
}

function render() {
  const { params, defs } = st.custom;
  // errors of the formulas, from a real evaluation
  let errors = {};
  if (defs.length && st.src)
    errors = seriesOfTracks({ tracks: st.tracks, cal: st.cal, clip: st.clip, timeOf: (n) => st.src.timeOf(n), smooth: st.smooth, custom: st.custom }).errors;
  const pHtml = params
    .map((p, i) => {
      const prob = nameProblem(p.name, params.filter((_, j) => j !== i).map((q) => q.name));
      return `<div class="crow"><input type="text" data-pn="${i}" value="${esc(p.name)}" maxlength="12" aria-label="${t("name")}" />
        <span>=</span><input type="number" data-pv="${i}" value="${p.value}" step="any" inputmode="decimal" aria-label="${t("value")}" />
        <input type="text" data-pu="${i}" value="${esc(p.unit)}" maxlength="16" placeholder="${t("unit")}" aria-label="${t("unit")}" />
        <button class="btn ic" data-pd="${i}" aria-label="${t("deleteTrack")}"><span class="ms">delete</span></button>
        ${prob ? `<div class="note err cerr">${t("nameErr_" + prob)}</div>` : ""}</div>`;
    })
    .join("");
  const dHtml = defs
    .map((d, i) => {
      const prob = nameProblem(d.name, [...params.map((q) => q.name), ...defs.filter((_, j) => j !== i).map((q) => q.name)]);
      const err = errors[d.id];
      return `<div class="crow"><input type="text" data-dn="${i}" value="${esc(d.name)}" maxlength="16" aria-label="${t("name")}" />
        <span>=</span><input type="text" class="wide" data-de="${i}" value="${esc(d.expr)}" maxlength="200" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="0.5*m*v^2" aria-label="${t("formula")}" />
        <input type="text" data-du="${i}" value="${esc(d.unit)}" maxlength="16" placeholder="${t("unit")}" aria-label="${t("unit")}" />
        <button class="btn ic" data-dd="${i}" aria-label="${t("deleteTrack")}"><span class="ms">delete</span></button>
        ${prob ? `<div class="note err cerr">${t("nameErr_" + prob)}</div>` : ""}
        ${err && d.expr.trim() ? `<div class="note err cerr">${formulaMessage(err)}</div>` : ""}</div>`;
    })
    .join("");
  for (const [sel, html, bind] of [["#paramList", pHtml, bindParams], ["#defList", dHtml, bindDefs]]) {
    const box = $(sel);
    if (box.dataset.h === html) continue;
    // do not rebuild while typing in a field of this list
    if (box.contains(document.activeElement) && document.activeElement.tagName === "INPUT") continue;
    box.innerHTML = html;
    box.dataset.h = html;
    bind(box);
  }
}
function bindParams(box) {
  box.querySelectorAll("[data-pn]").forEach((el) => el.addEventListener("change", () => editParam(+el.dataset.pn, { name: el.value.trim() })));
  box.querySelectorAll("[data-pv]").forEach((el) =>
    el.addEventListener("change", () => {
      const v = parseFloat(el.value.replace(",", "."));
      if (Number.isFinite(v)) editParam(+el.dataset.pv, { value: v });
    }),
  );
  box.querySelectorAll("[data-pu]").forEach((el) => el.addEventListener("change", () => editParam(+el.dataset.pu, { unit: el.value.trim() })));
  box.querySelectorAll("[data-pd]").forEach((el) => (el.onclick = () => removeParam(+el.dataset.pd)));
}
function bindDefs(box) {
  box.querySelectorAll("[data-dn]").forEach((el) => el.addEventListener("change", () => editDef(+el.dataset.dn, { name: el.value.trim() })));
  box.querySelectorAll("[data-de]").forEach((el) => el.addEventListener("change", () => editDef(+el.dataset.de, { expr: el.value })));
  box.querySelectorAll("[data-du]").forEach((el) => el.addEventListener("change", () => editDef(+el.dataset.du, { unit: el.value.trim() })));
  box.querySelectorAll("[data-dd]").forEach((el) => (el.onclick = () => removeDef(+el.dataset.dd)));
}

function init() {
  $("#addParam").onclick = addParam;
  $("#addDef").onclick = () => addDef();
  for (const e of ["source", "settings", "tracks", "calib", "clip", "lang"]) on(e, render);
  render();
}

export { init, keyOf };
