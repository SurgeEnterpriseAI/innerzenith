"use client";

// Surprise Me (spec 7.5) — a two-layer reading generated fresh on the first
// open each calendar day; repeat opens the same day show the stored reading
// with a brief welcome-back (no regeneration).

import { useEffect, useRef, useState } from "react";
import { Profile } from "@/lib/profile";
import { stripMarkdown } from "@/lib/text";
import { getTodaySurprise, saveTodaySurprise } from "@/lib/surprise";
import { languageByCode } from "@/lib/languages";
import { useT } from "@/lib/i18n";
import ReadAloud from "./ReadAloud";

export default function SurpriseMe({
  profile,
  onBack,
}: {
  profile: Profile;
  onBack: () => void;
}) {
  const { t } = useT();
  const lang = profile.language ?? null;
  const rtl = Boolean(languageByCode(lang)?.rtl);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const existing = getTodaySurprise();
    if (existing) {
      setText(existing);
      setWelcomeBack(true); // already received today → no regeneration
      return;
    }
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "__begin_surprise__" }],
          mode: "surprise",
          profile: {
            full_name: profile.full_name,
            current_city: profile.current_city,
            birth_date: profile.birth_date,
            birth_time_known: profile.birth_time_known,
            profile_fidelity: profile.profile_fidelity,
          },
          language: profile.language ?? null,
          chartProfile: profile.chart_profile ?? null,
        }),
      });
      if (!res.ok || !res.body) throw new Error("error");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setText(acc);
      }
      saveTodaySurprise(acc);
    } catch {
      setText("[paused — try once more]");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#2b2b2b] text-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button onClick={onBack} className="text-[#b3b3b3] hover:text-white text-lg leading-none px-1">‹</button>
        <h1 className="font-serif-i text-base">Surprise Me</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="max-w-2xl mx-auto">
          {welcomeBack && (
            <p className="font-serif-i italic text-sm text-[#b3b3b3] mb-5">
              {t("You've already drawn today's reading — here it is again. A fresh one arrives tomorrow.")}
            </p>
          )}
          {!text && streaming && (
            <p className="advisor-text text-[#b3b3b3] italic">{t("reading the sky over you today…")}</p>
          )}
          <div className={`advisor-text group ${streaming ? "cursor-blink" : ""}`} dir={rtl ? "rtl" : undefined}>
            {stripMarkdown(text).split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {!streaming && text.length > 0 && <ReadAloud text={stripMarkdown(text)} lang={lang} />}
          </div>
        </div>
      </div>
    </div>
  );
}
