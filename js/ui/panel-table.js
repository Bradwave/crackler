// Crackler: Table panel: column chips, live table linked to the frame, copy and CSV export.
import { $, $$ } from "../dom.js";
import { getLang, t } from "../i18n.js";
import { toHTML } from "../mathtext.js";
import { gotoFrame, on, st } from "../state.js";
import { allKeys, label } from "../quantities.js";
import { buildTable, toDelimited } from "../table.js";
import { copyText, downloadText, fmt } from "../util.js";
import { toast } from "./controls.js";

const table = () =>
  buildTable({
    tracks: st.tracks,
    cal: st.cal,
    clip: st.clip,
    timeOf: (n) => st.src.timeOf(n),
    columns: st.cols,
    smooth: st.smooth,
    custom: st.custom,
  });
let current = null;

function chips() {
  $("#colChips").innerHTML = allKeys(st.custom)
    .map((k) => `<button class="lg${st.cols[k] ? " on" : ""}" data-col="${k}">${toHTML(label(k, st.custom))}</button>`)
    .join("");
  $$("#colChips .lg").forEach(
    (b) =>
      (b.onclick = () => {
        st.cols[b.dataset.col] = !st.cols[b.dataset.col];
        chips();
        render();
      }),
  );
}
function render() {
  const el = $("#dataTable");
  if (!st.src) {
    el.innerHTML = "";
    $("#tblNote").textContent = t("noVideo");
    return;
  }
  current = table();
  const head = current.columns
    .map((c) => `<th>${toHTML(c.label)}${c.unit ? ` <small>(${toHTML(c.unit)})</small>` : ""}</th>`)
    .join("");
  const body = current.rows
    .map(
      (r) =>
        `<tr data-f="${r.frame}">` +
        r.values.map((v, i) => `<td>${cell(current.columns[i].key, v)}</td>`).join("") +
        "</tr>",
    )
    .join("");
  el.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  $$("tbody tr", el).forEach((tr) => (tr.onclick = () => gotoFrame(+tr.dataset.f)));
  $("#tblNote").textContent = current.rows.length ? t("tableRows", { n: current.rows.length }) : t("tableEmpty");
  highlight();
}
const cell = (key, v) => (v == null ? "" : key === "n" ? v : fmt(v, 5));
function highlight() {
  let row = null;
  $$("#dataTable tbody tr").forEach((tr) => {
    const on = +tr.dataset.f === st.frame;
    tr.classList.toggle("cur", on);
    if (on) row = tr;
  });
  if (row && !$("#pane-table").hidden) row.scrollIntoView({ block: "nearest" });
}
const locale = () => ({ decimal: getLang() === "it" ? "," : "." });

function init() {
  chips();
  $("#copyBtn").onclick = async () => {
    if (!st.src) return;
    const text = toDelimited(table(), { sep: "\t", ...locale() });
    const ok = await copyText(text);
    const ta = $("#csvOut");
    if (ok) {
      ta.hidden = true;
      toast(t("copied", { n: current.rows.length }));
    } else {
      ta.hidden = false;
      ta.value = text;
      ta.focus();
      ta.select();
      toast(t("copyBlocked"));
    }
  };
  $("#csvBtn").onclick = () => {
    if (!st.src) return;
    downloadText("crackler.csv", toDelimited(table(), { sep: ",", decimal: "." }));
  };
  for (const e of ["source", "tracks", "calib", "clip", "lang", "settings"]) on(e, render);
  on("settings", chips);
  on("frame", highlight);
  on("tab", highlight);
  render();
}

export { init };
