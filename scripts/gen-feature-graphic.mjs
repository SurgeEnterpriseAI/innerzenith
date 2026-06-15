import sharp from "sharp";
import fs from "node:fs";
fs.mkdirSync("assets", { recursive: true });

const W = 1024, H = 500;
const BG = "#2b2b2b", LINE = "#6f6d66", DOT = "#ece9e2", STAR = "#ffffff", SUB = "#a9a6a0";

// Ascending constellation on the right; wordmark + tagline on the left.
const pts = [[600, 360], [690, 300], [760, 330], [840, 250], [910, 150]];
const lines = pts.slice(1).map((p, i) =>
  `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${p[0]}" y2="${p[1]}" stroke="${LINE}" stroke-width="2.5" stroke-linecap="round"/>`).join("");
const r = [8, 6.5, 8.5, 6.5, 0];
const dots = pts.map(([x, y], i) => i === 4 ? "" : `<circle cx="${x}" cy="${y}" r="${r[i]}" fill="${DOT}"/>`).join("");
const [bx, by] = pts[4];

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="62%" cy="38%" r="75%"><stop offset="0%" stop-color="#36342f"/><stop offset="100%" stop-color="${BG}"/></radialGradient>
    <filter id="glow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${lines}${dots}
  <circle cx="${bx}" cy="${by}" r="20" fill="${STAR}" filter="url(#glow)"/>
  <circle cx="${bx}" cy="${by}" r="12" fill="${STAR}"/>
  <text x="80" y="240" font-family="Georgia, 'Times New Roman', serif" font-size="92" letter-spacing="2" fill="${DOT}">dotit</text>
  <text x="82" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${SUB}">Your dots were placed the</text>
  <text x="82" y="342" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${SUB}">moment you were born.</text>
</svg>`;

await sharp(Buffer.from(svg)).resize(W, H).png().toFile("assets/play-feature-graphic.png");
console.log("wrote assets/play-feature-graphic.png (1024x500)");
