"use client";

// Stage 08.3 — conversational Ask Now. Opens with a single fixed message.
// The user writes freeform; the AI extracts question + moment + city,
// asks only for whatever is missing, then answers from the moment-chart.

import { useEffect, useRef, useState } from "react";
import { Profile } from "@/lib/profile";
import { stripMarkdown } from "@/lib/text";
import { ChatMsg, Session as Sess, newId, upsertSession } from "@/lib/sessions";
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
      const final = [...next, { role: "assistant" as const, content: acc }];
      setMessages(final);
      setBuffer("");
      persist(final);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "[paused — try once more]" }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2b] text-white flex flex-col pb-20">
      <header className="px-6 pt-8 pb-3">
        <h1 className="font-serif-i text-2xl">Ask Now</h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[82%] bg-white/10 border border-white/10 rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-relaxed">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="advisor-text group" dir={rtl ? "rtl" : undefined}>
                {stripMarkdown(m.content).split(/\n{2,}/).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
                <ReadAloud text={stripMarkdown(m.content)} lang={lang} />
              </div>
            )
          )}
          {streaming && buffer && (
            <div className="advisor-text cursor-blink">
              {stripMarkdown(buffer).split(/\n{2,}/).map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          )}
          {streaming && !buffer && (
            <p className="advisor-text text-[#b3b3b3] italic">{t("reading this moment…")}</p>
          )}
        </div>
      </div>

      {showHint && messages.length <= 1 && !streaming && !input.trim() && (
        <div className="px-4 pb-2">
          <div className="max-w-2xl mx-auto relative bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 pr-9">
            <button
              onClick={() => setShowHint(false)}
              aria-label={t("Dismiss")}
              className="absolute top-1.5 right-2.5 text-[#777] hover:text-white text-lg leading-none w-6 h-6"
            >
              ×
            </button>
            <p className="micro-label mb-2">{t("How to ask")}</p>
            <p className="text-[12.5px] text-[#a9a6a0] leading-relaxed mb-2.5">
              {t("One sentence, three things:")}{" "}
              <span className="text-[#e8e6e1]">{t("your question")}</span> ·{" "}
              <span className="text-[#e8e6e1]">{t("the exact date & time it came to you")}</span> ·{" "}
              <span className="text-[#e8e6e1]">{t("the city you were in")}</span>.
            </p>
            <button
              onClick={() => { setInput(t(SAMPLE)); setShowHint(false); }}
              className="text-left font-serif-i italic text-[13px] text-[#b3b3b3] hover:text-white transition"
            >
              “{t(SAMPLE)}”{" "}
              <span className="not-italic text-[11px] text-[#777]">— {t("tap to try")}</span>
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pb-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 focus-within:border-white/30 transition">
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
            placeholder={t("your question, the moment it arrived, and the city")}
            disabled={streaming}
            className="flex-1 bg-transparent outline-none text-[15px] py-1.5 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="text-[#2b2b2b] bg-white disabled:opacity-30 rounded-lg px-3.5 py-1.5 text-sm transition"
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}
