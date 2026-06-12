"use client";

// Stage 07 — the home sky map.

import { Profile } from "@/lib/profile";
import { CategoryKey } from "@/lib/categories";
import { useT } from "@/lib/i18n";
import Constellation from "./Constellation";

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

      {/* sky map */}
      <div className="flex-1 px-2 min-h-0">
        <Constellation onPick={onPick} />
      </div>

      <p className="font-serif-i italic text-xs text-[#b3b3b3] text-center px-8 pb-4">
        {t("For a question that has come to you on its own — try Ask Now.")}
      </p>
    </div>
  );
}
