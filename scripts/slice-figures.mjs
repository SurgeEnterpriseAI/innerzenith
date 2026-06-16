import sharp from "sharp";
import fs from "node:fs";

// Slice the founder's combined 7-figure sheet into individual cards.
const SRC = "C:/Users/ADMIN/Downloads/WhatsApp Image 2026-06-16 at 11.12.51 PM.jpeg";
fs.mkdirSync("public/figures", { recursive: true });

// crop boxes on the 768x1375 sheet: [left, top, width, height]
const BOX = {
  career: [12, 28, 384, 384],
  relationships: [372, 28, 384, 384],
  property: [12, 396, 384, 384],
  health: [372, 396, 384, 384],
  money: [12, 766, 384, 360],
  purpose: [372, 766, 384, 360],
  surprise: [216, 1110, 336, 265],
};

for (const [key, [left, top, width, height]] of Object.entries(BOX)) {
  const out = `public/figures/${key}.webp`;
  const info = await sharp(SRC)
    .extract({ left, top, width, height })
    .webp({ quality: 84 })
    .toFile(out);
  console.log(`${key}.webp  ${width}x${height}  ${(info.size / 1024 | 0)}KB`);
}
console.log("done");
