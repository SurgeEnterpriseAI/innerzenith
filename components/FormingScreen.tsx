"use client";

// Spec 13.6 — the "forming" / loading screen (Pankhuri, 2026-06-30). Whenever the
// app makes the user wait while a calculation runs, it picks ONE shape at random
// from the dot-shape library and loops its draw: seven dots glow, smooth lines
// connect them into the figure, the complete figure holds, then it resets back to
// dots and redraws — looping until the wait ends. "Connecting your dots." sits
// beneath. One shape is chosen per mount and loops (it does not switch mid-wait).

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { ConstellationShape, randomShape } from "@/lib/shapes";

export default function FormingScreen({
  shape,
  label,
}: {
  shape?: ConstellationShape;
  label?: string;
}) {
  const { t } = useT();
  // Locked once per mount so the figure stays put and just loops its draw.
  const [pick] = useState<ConstellationShape>(() => shape ?? randomShape());

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#0D0D0D] text-white">
      <svg viewBox="0 0 100 100" className="w-44 h-44" aria-hidden>
        <path className="forming-fig" pathLength={1} d={pick.path} />
        {pick.dots.map(([x, y], i) => (
          <circle key={i} className="forming-dot" cx={x} cy={y} r={1.7} />
        ))}
      </svg>
      <p className="font-serif-i text-[20px] mt-10 text-white fade-up">
        {t(label ?? "Connecting your dots.")}
      </p>
    </div>
  );
}
