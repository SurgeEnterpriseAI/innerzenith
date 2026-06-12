"use client";

// A small, auto-disappearing nudge shown when dotit opened in a non-English
// language (auto-detected from location). Gives a one-tap escape hatch back to
// English. The text stays in English on purpose — it's the fallback offer, so
// an English-preferring user must be able to read it. Shows once per device.

import { useEffect, useState } from "react";
import { languageByCode } from "@/lib/languages";

const SEEN_KEY = "dotit.langToastSeen";

export default function LanguageToast({
  locale,
  onEnglish,
}: {
  locale: string;
  onEnglish: () => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!locale || locale.split("-")[0] === "en") return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {}
    setShow(true);
    const id = setTimeout(() => {
      setShow(false);
      seen();
    }, 8000);
    return () => clearTimeout(id);
  }, [locale]);

  function seen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }

  function pickEnglish() {
    seen();
    setShow(false);
    onEnglish();
  }

  if (!show) return null;

  const native = languageByCode(locale)?.native || "";

  return (
    <div
      dir="ltr"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 fade-up
                 flex items-center gap-3 max-w-[92vw]
                 bg-[#1e1e1e]/95 backdrop-blur border border-white/15
                 rounded-full pl-4 pr-2 py-2 shadow-lg"
    >
      <span className="text-[13px] text-[#d4d4d4] whitespace-nowrap">
        Showing in {native}. Continue in English?
      </span>
      <button
        onClick={pickEnglish}
        className="text-[13px] font-medium text-white bg-white/15 hover:bg-white/25 rounded-full px-3 py-1 transition whitespace-nowrap"
      >
        English
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
