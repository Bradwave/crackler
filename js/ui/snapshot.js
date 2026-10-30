// Crackler: Export the current frame with its overlays as a PNG picture.
// Drawn again from the data at a size of about 1280 px (never smaller than the video), not copied from the
// screen, so the zoom and pan of the stage do not matter and interface-only parts (handles, boxes) are left out.
import { t } from "../i18n.js";
import { st, timeAt } from "../state.js";
import { downloadBlob, fmt } from "../util.js";
import { toast } from "./controls.js";
import { makeToolbox } from "./draw.js";
import { drawOverlays } from "./overlay.js";
import { C } from "./stage.js";

async function exportSnapshot() {
  if (!st.src) return toast(t("noVideo"));
  const src = st.src,
    k = Math.min(3, Math.max(1, 1280 / src.width));
  const W = Math.round(src.width * k),
    H = Math.round(src.height * k);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src.getFrame(st.frame), 0, 0, W, H);
  // The overlays are drawn in "screen pixels" as on the stage; u makes those pixels as large, relative to
  // the picture, as they look on an 800 px wide stage, so lines and text stay readable in a big picture.
  const u = Math.max(1, W / 800),
    zoom = k / u;
  ctx.setTransform(u, 0, 0, u, 0, 0);
  const cam = { zoom, x: 0, y: 0 };
  const g = makeToolbox(ctx, C, cam, (p) => [p[0] * zoom, p[1] * zoom], true);
  drawOverlays(g);
  if (st.overlay.stamp) {
    const text = `t = ${fmt(timeAt(st.frame), 4)} s`;
    g.label(text, 12, H / u - 14, "#ffffff", { size: 16 });
  }
  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  if (!blob) return toast(t("snapFail"), 4000);
  const base = ((src.info && src.info.name) || "crackler").replace(/\.[^.]+$/, "");
  downloadBlob(`${base}-frame${st.frame}.png`, blob);
  toast(t("snapDone", { w: W, h: H }));
}

export { exportSnapshot };
