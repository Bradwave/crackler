// Crackler: Drawing primitives for the overlays (halo lines, markers, arrows, labels), bound to a canvas
// context. The stage and the snapshot export each make their own toolbox over their own canvas.
import { drawMath } from "../mathtext.js";

// ctx: a 2D context; C: colours { surface, ink, accent, tile2, vel, acc, ... }; cam: { zoom };
// toScreen: image pixel -> canvas pixel. Set `exporting` for the snapshot (UI-only parts are skipped).
function makeToolbox(ctx, C, cam, toScreen, exporting = false) {
  function halo(fn, color, w = 2) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = w + 2.5;
    fn();
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    fn();
    ctx.stroke();
  }
  function markerPath(kind, x, y, r) {
    ctx.beginPath();
    if (kind === "cross") {
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
    } else if (kind === "square") ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else if (kind === "diamond") {
      ctx.moveTo(x, y - r * 1.3);
      ctx.lineTo(x + r * 1.3, y);
      ctx.lineTo(x, y + r * 1.3);
      ctx.lineTo(x - r * 1.3, y);
      ctx.closePath();
    } else if (kind === "triangle") {
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.1, y + r * 0.9);
      ctx.lineTo(x - r * 1.1, y + r * 0.9);
      ctx.closePath();
    } else ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  function drawMarker(kind, s, color, r) {
    halo(() => markerPath(kind, s[0], s[1], r), color);
    // a dot in the centre shows exactly where the point is
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s[0], s[1], 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawArrow(a, b, color, w = 2) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    halo(() => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.moveTo(b[0] - 9 * Math.cos(ang - 0.4), b[1] - 9 * Math.sin(ang - 0.4));
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(b[0] - 9 * Math.cos(ang + 0.4), b[1] - 9 * Math.sin(ang + 0.4));
    }, color, w);
  }
  function handleDot(s, color, active) {
    halo(() => {
      ctx.beginPath();
      ctx.arc(s[0], s[1], active ? 11 : 6, 0, Math.PI * 2);
    }, color, 2);
  }
  function label(text, x, y, color, opts = {}) {
    drawMath(ctx, text, x, y, { size: 12, weight: 700, color, halo: "rgba(0,0,0,0.7)", ...opts });
  }

  function dot(s, color, r, thin = false) {
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = thin ? 1.5 : 2;
    ctx.beginPath();
    ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  function crosshair(s, color) {
    halo(() => {
      ctx.beginPath();
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        ctx.moveTo(s[0] + dx * 11, s[1] + dy * 11);
        ctx.lineTo(s[0] + dx * 18, s[1] + dy * 18);
      }
    }, color, 1.5);
  }
  // What the overlay module may use to draw.
  return { ctx, C, cam, toScreen, exporting, halo, dot, crosshair, marker: drawMarker, arrow: drawArrow, handle: handleDot, label };
}

export { makeToolbox };
