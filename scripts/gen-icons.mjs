import sharp from "sharp";
import fs from "node:fs";

fs.mkdirSync("assets", { recursive: true });
fs.mkdirSync("public", { recursive: true });

const BG = "#2b2b2b";
const LINE = "#6f6d66";
const DOT = "#ece9e2";
const STAR = "#ffffff";

// The constellation — an ascending asterism of 5 stars, the top one brightest.
// `s` scales the art; `cx,cy` centres it in a 1024 box.
function constellation(scale, ox, oy) {
  const pts = [
    [310, 660], [440, 548], [560, 612], [664, 452], [742, 330],
  ].map(([x, y]) => [ox + (x - 512) * scale + 512, oy + (y - 512) * scale + 512]);
  const lines = pts.slice(1).map((p, i) =>
    `<line x1="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="${LINE}" stroke-width="${5 * scale}" stroke-linecap="round"/>`
  ).join("");
  const r = [16, 13, 17, 13, 0];
  const dots = pts.map(([x, y], i) =>
    i === 4 ? "" : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r[i] * scale).toFixed(1)}" fill="${DOT}"/>`
  ).join("");
  const [bx, by] = pts[4];
  const bright = `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${28 * scale}" fill="${STAR}" filter="url(#glow)"/>
                  <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${18 * scale}" fill="${STAR}"/>`;
  return lines + dots + bright;
}

const defs = `<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="65%">
    <stop offset="0%" stop-color="#36342f"/><stop offset="100%" stop-color="${BG}"/>
  </radialGradient>
  <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>`;

const iconFull = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${defs}<rect width="1024" height="1024" fill="url(#bg)"/>${constellation(0.92, 0, 0)}</svg>`;

const iconFg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${defs}${constellation(0.60, 0, 0)}</svg>`;

const iconBg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${defs}<rect width="1024" height="1024" fill="url(#bg)"/></svg>`;

const splash = `<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  ${defs}<rect width="2732" height="2732" fill="url(#bg)"/>
  <g transform="translate(854,820) scale(1.0)">${constellation(0.92, 0, 0)}</g>
  <text x="1366" y="1820" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="150" letter-spacing="6" fill="${DOT}">dotit</text>
</svg>`;

async function png(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}

await png(iconFull, "assets/icon-only.png", 1024);
await png(iconFg, "assets/icon-foreground.png", 1024);
await png(iconBg, "assets/icon-background.png", 1024);
await png(splash, "assets/splash.png", 2732);
await png(splash, "assets/splash-dark.png", 2732);
// Fix the PWA icons too (manifest references these but they were missing)
await png(iconFull, "public/icon-192.png", 192);
await png(iconFull, "public/icon-512.png", 512);
await png(iconFull, "public/apple-touch-icon.png", 180);
console.log("done");
