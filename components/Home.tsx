"use client";

// Stage 07 — the home. A gallery of tappable category cards: founder artwork for
// career / relationships / property / health, and the constellation figures
// rendered as matching dark cards for money / life purpose, plus a Surprise Me
// banner. Tapping a card opens that category.

import { Profile } from "@/lib/profile";
import { CategoryKey, CATEGORIES } from "@/lib/categories";
import { FIGURES, Figure } from "@/lib/constellations";
import { useT } from "@/lib/i18n";

// Categories that have founder-provided artwork in /public/figures.
const IMAGE_FIGURES = new Set<CategoryKey>([
  "career", "relationships", "property", "health", "money", "purpose",
]);

const TILE_BG = "radial-gradient(115% 100% at 50% 36%, #36343c 0%, #201f23 72%)";

export default function Home({
  profile,
  onPick,
  onProfile,
}: {
  profile: Profile;
  onPick: (key: CategoryKey) => void;
  onProfile: () => void;
}) {
  const { t } = useT();
  const initial = (profile.full_name || "?").trim().charAt(0).toUpperCase();
  const grid = CATEGORIES.filter((c) => c.key !== "surprise");
  const surprise = CATEGORIES.find((c) => c.key === "surprise")!;

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2b] text-white flex flex-col pb-20">
      {/* greeting */}
      <div className="px-6 pt-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="micro-label">{t("Hi")}</p>
            <h1 className="font-serif-i text-3xl mt-0.5">{profile.full_name}.</h1>
          </div>
          <button
            onClick={onProfile}
            className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center text-sm text-[#d4d4d4]"
          >
            {initial}
          </button>
        </div>
        <div className="h-px bg-white/10 mt-5" />
        <p className="micro-label text-center mt-5">{t("What do you want to explore")}</p>
      </div>

      {/* gallery */}
      <div className="flex-1 overflow-y-auto px-4 mt-4">
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3">
          {grid.map((c) =>
            IMAGE_FIGURES.has(c.key) ? (
              <button
                key={c.key}
                onClick={() => onPick(c.key)}
                aria-label={t(c.label)}
                className="relative aspect-square rounded-2xl overflow-hidden bg-[#201f23] active:scale-[0.97] transition-transform"
              >
                <img
                  src={`/figures/${c.key}.webp`}
                  alt={t(c.label)}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <FigureTile key={c.key} figKey={c.key} label={t(c.label)} onPick={onPick} />
            )
          )}

          {/* Surprise Me — full-width banner */}
          <button
            onClick={() => onPick("surprise")}
            aria-label={t(surprise.label)}
            className="col-span-2 relative h-28 rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
            style={{ background: TILE_BG }}
          >
            <span className="relative flex items-center justify-center">
              <span
                className="block w-3 h-3 rounded-full bg-white dot-breathe"
                style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.8))" }}
              />
              <span className="absolute -top-4 font-serif-i italic text-[#d4d4d4] text-sm">?</span>
            </span>
            <span className="font-serif-i text-[15px] text-[#a9a6a0] mt-1.5">{t(surprise.label)}</span>
          </button>
        </div>
      </div>

      <p className="font-serif-i italic text-xs text-[#b3b3b3] text-center px-8 pt-3 pb-3">
        {t("For a question that has come to you on its own — try Ask Now.")}
      </p>
    </div>
  );
}

/** One constellation figure rendered as a dark card (for categories without artwork). */
function FigureTile({
  figKey,
  label,
  onPick,
}: {
  figKey: CategoryKey;
  label: string;
  onPick: (key: CategoryKey) => void;
}) {
  const fig = FIGURES.find((f) => f.key === figKey) as Figure;
  if (!fig) return null;
  const xs = fig.dots.map((d) => d[0]);
  const ys = fig.dots.map((d) => d[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(8, (maxX - minX) * 0.18, (maxY - minY) * 0.18);
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;
  const span = Math.max(w, h);
  const r = span * 0.04;
  const vb = `${minX - pad} ${minY - pad} ${w} ${h}`;

  return (
    <button
      onClick={() => onPick(figKey)}
      aria-label={label}
      className="relative aspect-square rounded-2xl overflow-hidden flex flex-col items-center justify-center active:scale-[0.97] transition-transform"
      style={{ background: TILE_BG }}
    >
      <div className="flex-1 w-full flex items-center justify-center p-7 pb-2 min-h-0">
        <svg viewBox={vb} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {fig.edges.map(([a, b], i) => (
            <line
              key={i}
              x1={fig.dots[a][0]} y1={fig.dots[a][1]}
              x2={fig.dots[b][0]} y2={fig.dots[b][1]}
              stroke="#b3b3b3" strokeWidth={span * 0.012} strokeDasharray={`${span * 0.03} ${span * 0.03}`}
              opacity={0.5}
            />
          ))}
          {fig.dots.map(([x, y], i) => (
            <circle
              key={i}
              cx={x} cy={y} r={r}
              fill="#ffffff"
              style={{ filter: "drop-shadow(0 0 1.5px rgba(255,255,255,0.6))" }}
            />
          ))}
        </svg>
      </div>
      <span className="font-serif-i text-[15px] text-[#a9a6a0] pb-4">{label}</span>
    </button>
  );
}
