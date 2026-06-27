"use client";

// The silver relief glyph that crowns a reading (Pankhuri's symbol set).
// Rendered with mixBlendMode "lighten" so the dark plate drops down to the page
// colour and the silver figure floats on the canvas — same treatment as the
// constellation artwork on the home (spec 7.1/7.2). Purely decorative: aria-hidden,
// never named in words (Rule 1).

import { symbolSrc } from "@/lib/symbols";

export default function SymbolGlyph({
  keyName,
  size = 76,
  className = "",
}: {
  keyName?: string | null;
  size?: number;
  className?: string;
}) {
  if (!keyName) return null;
  return (
    <div className={`flex justify-center ${className}`}>
      <img
        src={symbolSrc(keyName)}
        alt=""
        aria-hidden
        draggable={false}
        width={size}
        height={size}
        style={{ width: size, height: size, mixBlendMode: "lighten" }}
        className="object-contain opacity-95 select-none fade-up"
      />
    </div>
  );
}
