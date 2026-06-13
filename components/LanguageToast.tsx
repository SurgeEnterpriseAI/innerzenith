"use client";

// A small, auto-disappearing nudge. dotit loads in English by default; if we
// detect the visitor's regional language (from their location, e.g. Bengaluru
// → Kannada), this offers a one-tap switch into it. The native script name is
// shown so a regional speaker recognises it instantly. Shows once per device.

import { useEffect, useState } from "react";
import { languageByCode } from "@/lib/languages";

const SEEN_KEY = "dotit.langOfferSeen";

export default function LanguageToast({
  locale,
  suggested,
  onSwitch,
}: {
  locale: string;
  suggested: string;
  onSwitch: () => void;
}) {
  const [show, setShow] = useState(false);

  const offerBase = (suggested || "").split("-")[0];
  const currentBase = (locale || "").split("-")[0];
  // Only offer when there's a non-English regional language AND we're currently
  // showing English (don't nudge if they're already in their language).
  const eligible = offerBase && offerBase !== "en" && currentBase === "en";

  useEffect(() => {
    if (!eligible) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {}
    setShow(true);
    const id = setTimeout(() => {
      setShow(false);
      seen();
    }, 8000);
    return () => clearTimeout(id);
  }, [eligible]);

  function seen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }

  function pick() {
    seen();
    setShow(false);
    onSwitch();
  }

  if (!show) return null;

  const lang = languageByCode(suggested);
  const native = lang?.native || "";
  const english = lang?.name || "";

  return (
    <div
      dir="ltr"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 fade-up
                 flex items-center gap-2 max-w-[94vw]
                 bg-[#1e1e1e]/95 backdrop-blur border border-white/15
                 rounded-full pl-2 pr-2 py-2 shadow-lg"
    >
      <button
        onClick={pick}
        className="flex items-center gap-2 text-[13px] text-white bg-white/12 hover:bg-white/22
                   rounded-full px-3.5 py-1.5 transition whitespace-nowrap"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
        <span>Read in <span className="font-medium">{native}</span></span>
      </button>
      <button
        onClick={() => {
          seen();
          setShow(false);
        }}
        aria-label="dismiss"
        className="text-[#888] hover:text-white px-1.5 text-sm"
      >
        ✕
      </button>
    </div>
  );
}
