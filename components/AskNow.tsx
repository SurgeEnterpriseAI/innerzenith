"use client";

// Stage 08.3 — conversational Ask Now. Opens with a single fixed message.
// The user writes freeform; the AI extracts question + moment + city,
// asks only for whatever is missing, then answers from the moment-chart.

import { useEffect, useRef, useState } from "react";
import { Profile } from "@/lib/profile";
import { stripMarkdown } from "@/lib/text";
import { ChatMsg, Session as Sess, newId, upsertSession } from "@/lib/sessions";
import { extractGlyphKey, stripLeadingGlyph } from "@/lib/symbols";
import { languageByCode } from "@/lib/languages";
import { useT } from "@/lib/i18n";
import ReadAloud from "./ReadAloud";

const OPENING = `Ask Now answers one specific question at a time.

Three things make this work — your question must come to you naturally, you remember the exact moment it arrived in your mind, and you know which city you were in at that moment.

For example: "Will I find my lost ring? I thought of asking this on 02 Jun 2026 at 9:32 PM and I was in Delhi, India."

What's sitting with you?`;

// A concrete one-line sample for the "how to ask" hint card — shows the three
// parts (question · exact date & time · city) so the format is obvious at a glance.
const SAMPLE = "Will I get this opportunity? The question came to me on 18 Jun 2026, 9:30 PM, in Mumbai.";

// Disclaimer pinned to the base of every Ask Now response (spec 13.11).
const DISCLAIMER =
  "Ask Now reads the moment your question crystallised. It works only when the question arrived on its own — the time and city you were in when it did.";

export default function AskNow({ profile }: { profile: Profile }) {
  const { t } = useT();
  const lang = profile.language ?? null;
  const rtl = Boolean(languageByCode(lang)?.rtl);
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { role: "assistant", content: t(OPENING) },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [showHint, setShowHint] = useState(true);
  const sessionRef = useRef<Sess | null>(null);
  const symbolRef = useRef<string | null>(null);
  // Frozen resolved Ask Now inputs (moment/city/question) — set from the server's
  // X-AskNow-Resolved header on the first answer, reused on every follow-up so the
  // chart never silently re-extracts to a different moment.
  const askNowRef = useRef<Sess["askNow"] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, buffer]);

  function persist(msgs: ChatMsg[]) {
    let s = sessionRef.current;
    const firstUser = msgs.find((m) => m.role === "user");
    if (!s) {
      s = {
        id: newId(),
        category: "asknow",
        isAskNow: true,
        keyword: firstUser ? firstUser.content.slice(0, 40) : "ask now",
        messages: msgs,
        created_at: new Date().toISOString(),
      };
    } else {
      s = { ...s, messages: msgs };
    }
    if (askNowRef.current) s = { ...s, askNow: askNowRef.current };
    if (symbolRef.current) s = { ...s, symbol: symbolRef.current };
    sessionRef.current = s;
    upsertSession(s);
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setBuffer("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          mode: "asknow",
          profile: { full_name: profile.full_name, current_city: profile.current_city, language: profile.language },
          language: profile.language ?? null,
          // Natal chart enters quietly as a second layer (spec 8.10) — never announced.
          chartProfile: profile.chart_profile ?? null,
          // Reuse the frozen moment/question if this session already resolved one.
          askNow: askNowRef.current ?? sessionRef.current?.askNow ?? null,
        }),
      });
      if (!res.ok || !res.body) throw new Error("error");
      // Freeze the resolved inputs the server echoed back, for follow-up turns.
      const resolvedHdr = res.headers.get("X-AskNow-Resolved");
      if (resolvedHdr) {
        try { askNowRef.current = JSON.parse(decodeURIComponent(resolvedHdr)); } catch {}
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setBuffer(acc);
      }
      // A real answer (not a "missing piece" prompt) carries a glyph control
      // line — crown the session the first time one arrives.
      const key = extractGlyphKey(acc);
      if (key && !symbolRef.current) symbolRef.current = key;
      const final = [...next, { role: "assistant" as const, content: stripLeadingGlyph(acc) }];
      setMessages(final);
      setBuffer("");
      persist(final);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "[paused — try once more]" }]);
    } finally {
      setStreaming(false);
    }
  }

  // The first assistant message is the fixed OPENING — never rendered (the HOW TO
  // ASK card replaces it, spec 13.10). The screen starts clean with hint + card.
  const firstUserIdx = messages.findIndex((m) => m.role === "user");

  return (
    <div className="min-h-[100dvh] bg-[#0D0D0D] text-white flex flex-col pb-20">
      {/* top bar — 'Ask Now' centred in Cormorant Italic 18px (spec 13.10). No
          back arrow: this is a bottom-nav tab, not a pushed screen. */}
      <header className="flex items-center justify-center px-6 py-4 shrink-0">
        <h1 className="font-serif-i text-[18px]">{t("Ask Now")}</h1>
      </header>

      {/* upper-third hint line + full-width 40%-opacity divider (spec 13.10). */}
      <div className="px-6 pt-1 pb-4">
        <div className="max-w-2xl mx-auto">
          <p className="font-light text-[12px] text-[#b3b3b3]">
            {t("Your question · the exact moment it came to you · your city")}
          </p>
          <hr className="mt-3 border-0 border-t border-[#d4d4d4]/40" />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="max-w-2xl mx-auto">
          {messages.map((m, i) => {
            // Skip the fixed opening assistant message before any user turn.
            if (i === 0 && m.role === "assistant" && (firstUserIdx === -1 || i < firstUserIdx)) {
              return null;
            }
            return m.role === "user" ? (
              // Follow-up: thin full-width divider then a single italic line (spec 13.8).
              <div key={i} className="mt-8">
                <hr className="reading-divider mb-4" />
                <p className="font-light italic text-[15px] text-[#b3b3b3]" dir={rtl ? "rtl" : undefined}>
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={i} className="mt-8 first:mt-0">
                <div className="advisor-text group" dir={rtl ? "rtl" : undefined}>
                  {stripMarkdown(stripLeadingGlyph(m.content)).split(/\n{2,}/).map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                  <ReadAloud text={stripMarkdown(stripLeadingGlyph(m.content))} lang={lang} />
                </div>
                {/* Disclaimer at the base of every response (spec 13.11). */}
                <p className="font-light text-[11px] text-[#b3b3b3] leading-[1.7] mt-5" dir={rtl ? "rtl" : undefined}>
                  {t(DISCLAIMER)}
                </p>
              </div>
            );
          })}
          {streaming && buffer && (
            <div className="advisor-text cursor-blink mt-8" dir={rtl ? "rtl" : undefined}>
              {stripMarkdown(stripLeadingGlyph(buffer)).split(/\n{2,}/).map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          )}
          {streaming && !buffer && (
            <p className="advisor-text text-[#b3b3b3] italic mt-8">{t("reading this moment…")}</p>
          )}
        </div>
      </div>

      {/* HOW TO ASK card — square corners, thin 30%-opacity #D4D4D4 border, no fill
          (spec 13.10). Sits just above the input; × dismisses for this session. */}
      {showHint && firstUserIdx === -1 && !streaming && (
        <div className="px-6 pb-3">
          <div className="max-w-2xl mx-auto relative rounded-none border border-[#d4d4d4]/30 bg-[#0D0D0D] px-4 py-3.5 pr-9">
            <button
              onClick={() => setShowHint(false)}
              aria-label={t("Dismiss")}
              className="absolute top-2.5 right-3 text-[#b3b3b3] hover:text-white text-lg leading-none w-6 h-6"
            >
              ×
            </button>
            <p className="section-header mb-2.5">{t("How to ask")}</p>
            <p className="font-light text-[13px] text-[#b3b3b3] leading-relaxed">
              {t("Ask Now answers one specific question at a time. Three things make this work — your question must come to you naturally, you remember the exact moment it arrived in your mind, and you know which city you were in at that moment.")}
            </p>
            <button
              onClick={() => { setInput(t(SAMPLE)); setShowHint(false); }}
              className="block text-left font-light italic text-[13px] text-[#b3b3b3] hover:text-white transition mt-2.5"
            >
              {t("For example: Will I find my lost ring? I thought of asking this on 02 Jun 2026 at 9:32 PM and I was in Delhi, India.")}
            </button>
          </div>
        </div>
      )}

      <div className="px-6 pt-3 pb-4 border-t border-[#d4d4d4]/30">
        <div className="max-w-2xl mx-auto flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={t("Share what's true to you.")}
            disabled={streaming}
            className="flex-1 bg-transparent outline-none text-[13px] font-light text-white placeholder:text-[#b3b3b3] py-1.5 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            aria-label={t("Send")}
            className="text-white disabled:opacity-30 pb-1.5 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="6 11 12 5 18 11" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
