"use client";

// Spec 13.6 — the "forming" screen. A constellation draws itself and the line
// "Connecting your dots." sits beneath it. Shown while the FIRST reading on a
// topic is being drawn (and after onboarding while the chart computes). The
// default shape is the butterfly (spec 13.6).

import { useT } from "@/lib/i18n";

const BUTTERFLY: [number, number][] = [
  [50, 18], [34, 30], [30, 48], [50, 40], [70, 30], [66, 48], [50, 62],
];

/** A constellation: dashed lines between lit dots, dots glowing white. */
export function FormingShape({
  dots,
  litCount,
}: {
  dots: [number, number][];
  litCount: number;
}) {
  return (
    <svg viewBox="0 0 100 80" className="w-44 h-36">
      {dots.slice(0, litCount).map((d, i) => {
        if (i === 0) return null;
        const prev = dots[i - 1];
        return (
          <line
            key={`l${i}`}
            x1={prev[0]} y1={prev[1]} x2={d[0]} y2={d[1]}
            stroke="#b3b3b3" strokeWidth={0.4} strokeDasharray="1.4 1.4" opacity={0.6}
          />
        );
      })}
      {dots.map((d, i) => (
        <circle
          key={`d${i}`}
          cx={d[0]} cy={d[1]}
          r={1.6}
          fill={i < litCount ? "#ffffff" : "#b3b3b3"}
          className={i < litCount ? "dot-lit" : ""}
          style={i < litCount ? { filter: "drop-shadow(0 0 2px rgba(255,255,255,0.7))" } : undefined}
        />
      ))}
    </svg>
  );
}

export default function FormingScreen({ dots = BUTTERFLY }: { dots?: [number, number][] }) {
  const { t } = useT();
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#0D0D0D] text-white">
      <div className="dot-breathe">
        <FormingShape dots={dots} litCount={dots.length} />
      </div>
      <p className="font-serif-i text-[20px] mt-12 text-white fade-up">
        {t("Connecting your dots.")}
      </p>
    </div>
  );
}
