// Crackler: Touch magnifier. Appears above the finger while a point is being placed.
import { $ } from "../dom.js";
import { st } from "../state.js";

const SIZE = 120,
  GAP = 56;
let cv = null,
  ctx = null,
  dpr = 1;

function ensure() {
  if (cv) return;
  cv = document.createElement("canvas");
  cv.className = "loupe";
  cv.hidden = true;
  cv.setAttribute("aria-hidden", "true");
  dpr = window.devicePixelRatio || 1;
  cv.width = cv.height = Math.round(SIZE * dpr);
  $("#wrap").appendChild(cv);
  ctx = cv.getContext("2d");
}

// ip: image point under the finger; s: its screen position inside the stage; view: [W, H]
function show(ip, s, zoom, view, color) {
  ensure();
  const bmp = st.src.getFrame(st.frame);
  const eff = Math.max(zoom * 3, 5), // magnification in screen px per image px
    side = SIZE / eff;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, ip[0] - side / 2, ip[1] - side / 2, side, side, 0, 0, SIZE, SIZE);
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 3.5;
  cross();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  cross();
  // above the finger; if there is no room, beside it
  let x = s[0] - SIZE / 2,
    y = s[1] - SIZE - GAP;
  if (y < 4) {
    y = Math.max(4, s[1] - SIZE / 2);
    x = s[0] < view[0] / 2 ? s[0] + GAP : s[0] - GAP - SIZE;
  }
  x = Math.min(view[0] - SIZE - 4, Math.max(4, x));
  y = Math.min(view[1] - SIZE - 4, Math.max(4, y));
  cv.style.left = x + "px";
  cv.style.top = y + "px";
  cv.hidden = false;
}
function cross() {
  const c = SIZE / 2;
  ctx.beginPath();
  ctx.moveTo(c - 14, c);
  ctx.lineTo(c - 4, c);
  ctx.moveTo(c + 4, c);
  ctx.lineTo(c + 14, c);
  ctx.moveTo(c, c - 14);
  ctx.lineTo(c, c - 4);
  ctx.moveTo(c, c + 4);
  ctx.lineTo(c, c + 14);
  ctx.stroke();
}
function hide() {
  if (cv) cv.hidden = true;
}

export { show, hide };
