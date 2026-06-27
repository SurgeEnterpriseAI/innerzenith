"use client";

// Stage 7.3 — bottom navigation, 4 items. Plus a one-time coachmark that, on the
// first home screen after onboarding, points at the Ask Now tab and explains it,
// then disappears (auto after a few seconds, or on tap / any navigation).

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

export type Tab = "home" | "asknow" | "history" | "profile";

const COACH_KEY = "dotit.asknowCoach.v1";

export default function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const { t } = useT();

  // One-time Ask Now coachmark (client-only; localStorage gates it to once ever).
  const [showCoach, setShowCoach] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(COACH_KEY)) {
        setShowCoach(true);
        const timer = setTimeout(() => dismissCoach(), 9000);
        return () => clearTimeout(timer);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function dismissCoach() {
    setShowCoach(false);
    try { localStorage.setItem(COACH_KEY, "1"); } catch {}
  }
  function handleChange(tab: Tab) {
    if (showCoach) dismissCoach();
    onChange(tab);
  }
  const items: { key: Tab; label: string; icon: JSX.Element }[] = [
    { key: "home", label: t("Home"), icon: <HomeIcon /> },
    { key: "asknow", label: t("Ask Now"), icon: <BoltIcon /> },
    { key: "history", label: t("History"), icon: <HistoryIcon /> },
    { key: "profile", label: t("Profile"), icon: <UserIcon /> },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#0D0D0D] border-t border-[#d4d4d4]/30 z-20">
      <div className="max-w-md mx-auto flex relative">
        {showCoach && active === "home" && (
          <div className="absolute z-30 inset-x-3" style={{ bottom: "calc(100% + 10px)" }}>
            <button
              onClick={dismissCoach}
              aria-label={t("Got it")}
              className="relative block w-full text-left bg-[#0D0D0D] border border-[#d4d4d4]/30 text-[#d4d4d4] rounded-md px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-[#b3b3b3] mb-1">{t("New here?")}</p>
              <p className="text-[13px] leading-snug font-light">
                {t("Tap")} <span className="text-white">{t("Ask Now")}</span>{" "}
                {t("to ask one spontaneous question — give it the exact time and city the question came to you.")}
              </p>
              {/* arrow pointing down to the Ask Now tab (2nd of 4 → 37.5%) */}
              <span
                className="absolute w-3.5 h-3.5 bg-[#0D0D0D] border-b border-r border-[#d4d4d4]/30"
                style={{ bottom: "-7px", left: "37.5%", transform: "translateX(-50%) rotate(45deg)" }}
              />
            </button>
          </div>
        )}
        {items.map((it) => {
          const on = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => handleChange(it.key)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5"
            >
              <span style={{ color: on ? "#fff" : "#b3b3b3" }}>
                {it.icon}
              </span>
              <span className="text-[11px] font-light" style={{ color: on ? "#fff" : "#b3b3b3" }}>
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
