"use client";

// Stage 07 — the home. A gallery of tappable category cards: founder artwork for
// career / relationships / property / health, and the constellation figures
// rendered as matching dark cards for money / life purpose, plus a Surprise Me
// banner. Tapping a card opens that category.
//
// Single-screen, no-scroll (reviewer ask): the whole home fits one viewport.
// The shell is a fixed 100dvh flex column; greeting / Surprise / footer are
// shrink-0, and the 6-tile gallery flexes to fill whatever height is left, so
// the tiles auto-size to the device and nothing ever scrolls.

import { Profile } from "@/lib/profile";
import { CategoryKey, CATEGORIES } from "@/lib/categories";
import { FIGURES, Figure } from "@/lib/constellations";
import { useT } from "@/lib/i18n";

// Categories that have founder-provided artwork in /public/figures.
const IMAGE_FIGURES = new Set<CategoryKey>([
  "career", "relationships", "property", "health", "money", "purpose",
]);

// Neutral salt-and-pepper card fill (spec 7.1a) — no warm/cool tint.
const TILE_BG = "radial-gradient(115% 100% at 50% 36%, #353535 0%, #242424 72%)";

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
    <div className="h-[100dvh] bg-[#2b2b2b] text-white flex flex-col overflow-hidden pb-20">
      {/* greeting */}
      <div className="px-6 pt-8 shrink-0">
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
        <div className="h-px bg-white/10 mt-4" />
        <p className="micro-label text-center mt-4">{t("What do you want to explore")}</p>
      </div>

      {/* gallery — flexes to fill the remaining height; never scrolls */}
      <div className="flex-1 min-h-0 px-4 mt-3 flex flex-col gap-2.5">
        <div className="flex-1 min-h-0 max-w-2xl w-full mx-auto grid grid-cols-2 grid-rows-3 gap-2.5">
          {grid.map((c) =>
            IMAGE_FIGURES.has(c.key) ? (
              <button
                key={c.key}
                onClick={() => onPick(c.key)}
                aria-label={t(c.label)}
                className="relative min-h-0 active:scale-[0.97] transition-transform"
              >
                {/* lighten blend drops the artwork's dark background down to the
                    page colour, so the figure floats on the unified canvas
                    instead of sitting in a distinct card (spec 7.1/7.2).
                    object-contain keeps the whole figure visible as the tile
                    flexes to non-square sizes on short screens. */}
                <img
                  src={`/figures/${c.key}.webp`}
                  alt={t(c.label)}
                  loading="lazy"
                  className="w-full h-full object-contain"
                  style={{ mixBlendMode: "lighten" }}
                />
              </button>
            ) : (
              <FigureTile key={c.key} figKey={c.key} label={t(c.label)} onPick={onPick} />
            )
          )}
        </div>

        {/* Surprise Me — slim full-width bar (founder artwork, merged) */}
        <button
          onClick={() => onPick("surprise")}
          aria-label={t(surprise.label)}
          className="shrink-0 relative flex items-center justify-center active:scale-[0.98] transition-transform"
        >
          <img
            src="/figures/surprise.webp"
            alt={t(surprise.label)}
            loading="lazy"
            className="h-14 w-auto object-contain"
            style={{ mixBlendMode: "lighten" }}
          />
        </button>
      </div>

      <p className="font-serif-i italic text-[11px] leading-snug text-[#b3b3b3] text-center px-8 pt-2 pb-2 shrink-0">
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
      className="relative h-full w-full min-h-0 rounded-2xl overflow-hidden flex flex-col items-center justify-center active:scale-[0.97] transition-transform"
      style={{ background: TILE_BG }}
    >
      <div className="flex-1 w-full flex items-center justify-center p-5 pb-1 min-h-0">
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
      <span className="font-serif-i text-[13px] text-[#d4d4d4] pb-3">{label}</span>
    </button>
  );
}
