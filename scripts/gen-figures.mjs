import sharp from "sharp";
import fs from "node:fs";

// Founder-provided category artwork (Gemini). Optimize the 1MB PNGs into small
// webp for the home gallery. Map each source file to its category key.
const SRC = "C:/Users/ADMIN/Downloads";
const MAP = {
  career: "Gemini_Generated_Image_bpu4qcbpu4qcbpu4.png",
  relationships: "Gemini_Generated_Image_uatof0uatof0uato.png",
  health: "Gemini_Generated_Image_xaanbcxaanbcxaan.png",
  property: "Gemini_Generated_Image_tu7jgvtu7jgvtu7j.png",
  money: "Gemini_Generated_Image_3vokoi3vokoi3vok.png",
  purpose: "Gemini_Generated_Image_tu8erwtu8erwtu8e.png",
};

fs.mkdirSync("public/figures", { recursive: true });
for (const [key, file] of Object.entries(MAP)) {
  const out = `public/figures/${key}.webp`;
  const info = await sharp(`${SRC}/${file}`)
    .resize(760, 760, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toFile(out);
  console.log(`${key}.webp  ${(info.size / 1024 | 0)}KB`);
}
console.log("done");
