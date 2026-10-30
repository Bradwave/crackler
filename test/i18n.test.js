// Crackler: Tests for i18n.js: both languages complete, and every key used in markup and code exists.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DICT, t } from "../js/i18n.js";

const keys = (l) => Object.keys(DICT[l]).sort();
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const jsFiles = ["js", "js/ui"].flatMap((d) =>
  readdirSync(new URL(`../${d}/`, import.meta.url))
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(new URL(`../${d}/${f}`, import.meta.url), "utf8")),
);

test("Italian and English have the same keys", () => {
  assert.deepEqual(keys("it"), keys("en"));
});

test("no empty translations except hintNoVideo", () => {
  for (const l of ["it", "en"])
    for (const [k, v] of Object.entries(DICT[l])) if (k !== "hintNoVideo") assert.ok(v.trim(), `${l}.${k}`);
});

test("placeholders match between languages", () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of keys("en")) assert.equal(ph(DICT.it[k]), ph(DICT.en[k]), k);
});

test("every data-i18n key in index.html exists", () => {
  const used = [...html.matchAll(/data-i18n(?:-html|-title|-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 50);
  for (const k of used) assert.ok(DICT.en[k] !== undefined, `missing key ${k}`);
});

test("every t('key') call in the code exists", () => {
  const used = new Set();
  for (const src of jsFiles) for (const m of src.matchAll(/\bt\(\s*"([A-Za-z_]+)"/g)) used.add(m[1]);
  for (const k of used) if (!k.endsWith("_")) assert.ok(DICT.en[k] !== undefined, `missing key ${k}`);
  for (const k of ["warn_duplicate", "warn_dropped", "warn_budget", "warn_stalled"]) assert.ok(DICT.en[k]);
  for (const k of ["hintMark", "hintMarkTouch", "hintStickA", "hintStickB", "hintOrigin", "hintCalib", "hintView"])
    assert.ok(DICT.en[k]);
});

test("no unused keys", () => {
  const all = html + jsFiles.join("\n");
  const dynamic = /^(warn_|hint|projErr_|fitType_|fitErr_|formulaErr_|kind_|meas_|collect_|nameErr_|preset_)/;
  for (const k of keys("en")) {
    if (dynamic.test(k)) continue;
    assert.ok(all.includes(`"${k}"`), `unused key ${k}`);
  }
});

test("t() fills parameters and falls back", () => {
  assert.equal(t("frameLbl", { n: 3, last: 9, t: "0.1" }).includes("3/9"), true);
  assert.equal(t("nonexistent_key"), "nonexistent_key");
});
