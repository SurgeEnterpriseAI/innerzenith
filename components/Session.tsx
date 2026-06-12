"use client";

// A conversation screen. Handles natal categories AND Ask Now.
// First-time topics open broad+deep; returning topics open "Welcome back".

import { useEffect, useRef, useState } from "react";
import { Profile } from "@/lib/profile";
import { categoryByKey, CategoryKey } from "@/lib/categories";
import {
  Session as Sess,
  ChatMsg,
  newId,
  upsertSession,
  topicSeen,
} from "@/lib/sessions";
import { stripMarkdown } from "@/lib/text";
import { languageByCode } from "@/lib/languages";
import ReadAloud from "./ReadAloud";

export default function Session({
  profile,
  category,
  isAskNow,
  askMoment,
  existing,
  onBack,
}: {
  profile: Profile;
  category: CategoryKey;
  isAskNow: boolean;
  askMoment?: Sess["askMoment"];
  existing?: Sess | null;
  onBack: () => void;
}) {
  const cat = categoryByKey(category);
  const title = isAskNow ? "Ask Now" : cat?.title ?? "Session";
  const lang = profile.language ?? null;
  const rtl = Boolean(languageByCode(lang)?.rtl);

  const [messages, setMessages] = useState<ChatMsg[]>(existing?.messages ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [buffer, setBuffer] = useState("");

  const sessionRef = useRef<Sess | null>(existing ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, buffer]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (existing && existing.messages.length > 0) return; // resume
    // open the conversation
    const sentinel = isAskNow
      ? "__begin_asknow__"
      : topicSeen(category, profile.chart_computed_at)
      ? "__begin_returning__"
      : "__begin_first__";
    void stream([{ role: "user", content: sentinel }], { hideOpening: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(msgs: ChatMsg[]) {
    let s = sessionRef.current;
    if (!s) {
      const firstUser = msgs.find((m) => m.role === "user" && !m.content.startsWith("__begin"));
      s = {
        id: newId(),
        category,
        isAskNow,
        keyword: firstUser ? firstUser.content.slice(0, 40) : title.toLowerCase(),
        messages: msgs,
        created_at: new Date().toISOString(),
        askMoment,
      };
    } else {
      s = { ...s, messages: msgs };
    }
    sessionRef.current = s;
    upsertSession(s);
  }

  async function stream(thread: ChatMsg[], opts?: { hideOpening?: boolean }) {
    setStreaming(true);
    setBuffer("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: thread,
          mode: isAskNow ? "asknow" : "natal",
          category,
          returning: !isAskNow && topicSeen(category, profile.chart_computed_at),
          profile,
          language: profile.language ?? null,
          // Prefer the chart computed once at onboarding (no per-session
          // recompute / cold start). Fall back to birth data if absent.
          chartProfile: profile.chart_profile ?? null,
          birth:
            !profile.chart_profile && profile.birth_date
              ? {
                  birth_date: profile.birth_date,
                  birth_time: profile.birth_time_local,
                  birth_place: profile.birth_city ?? "",
                  latitude: profile.birth_lat,
                  longitude: profile.birth_lng,
                  timezone: profile.birth_timezone,
                }
              : null,
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "error"));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setBuffer(acc);
      }
      const visibleThread = opts?.hideOpening ? [] : thread;
      const final: ChatMsg[] = [...visibleThread, { role: "assistant", content: acc }];
      setMessages(final);
      setBuffer("");
      persist(final);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "[paused — try once more]" }]);
    } finally {
      setStreaming(false);
    }
  }

  function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    void stream(next);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#2b2b2b] text-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button onClick={onBack} className="text-[#b3b3b3] hover:text-white text-lg leading-none px-1">‹</button>
        <h1 className="font-serif-i text-base">{title}</h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {!isAskNow && (
            <p className="font-serif-i text-xs text-[#b3b3b3] italic text-center">
              For a question that has come to you on its own — try Ask Now.
            </p>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} content={m.content} lang={lang} rtl={rtl} />
          ))}
          {streaming && buffer && <Bubble role="assistant" content={buffer} streaming lang={lang} rtl={rtl} />}
          {streaming && !buffer && (
            <p className="advisor-text text-[#b3b3b3] italic">reading your dots…</p>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-4">
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
            placeholder={isAskNow ? "your one specific question" : "share what's true for you"}
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

function Bubble({ role, content, streaming, lang, rtl }: { role: "user" | "assistant"; content: string; streaming?: boolean; lang?: string | null; rtl?: boolean }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] bg-white/10 border border-white/10 rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-relaxed">
          {content}
        </div>
      </div>
    );
  }
  const clean = stripMarkdown(content);
  return (
    <div className={`advisor-text group ${streaming ? "cursor-blink" : ""}`} dir={rtl ? "rtl" : undefined}>
      {clean.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {!streaming && clean.length > 0 && <ReadAloud text={clean} lang={lang} />}
    </div>
  );
}

