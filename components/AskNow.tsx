"use client";

// Stage 08.3 — conversational Ask Now. Opens with a single fixed message.
// The user writes freeform; the AI extracts question + moment + city,
// asks only for whatever is missing, then answers from the moment-chart.

import { useEffect, useRef, useState } from "react";
import { Profile } from "@/lib/profile";
import { stripMarkdown } from "@/lib/text";
import { ChatMsg, Session as Sess, newId, upsertSession } from "@/lib/sessions";

const OPENING = `Ask Now answers one specific question at a time.

Three things make this work — your question must come to you naturally, you remember the exact moment it arrived in your mind, and you know which city you were in at that moment.

For example: "Will I find my lost ring? I thought of asking this on 02 Jun 2026 at 9:32 PM and I was in Delhi, India."

What's sitting with you?`;

export default function AskNow({ profile }: { profile: Profile }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: OPENING },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [buffer, setBuffer] = useState("");
  const sessionRef = useRef<Sess | null>(null);
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
        category: "surprise",
        isAskNow: true,
        keyword: firstUser ? firstUser.content.slice(0, 40) : "ask now",
        messages: msgs,
        created_at: new Date().toISOString(),
      };
    } else {
      s = { ...s, messages: msgs };
    }
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
          profile: { full_name: profile.full_name, current_city: profile.current_city },
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
              <div key={i} className="advisor-text">
                {stripMarkdown(m.content).split(/\n{2,}/).map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
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
            <p className="advisor-text text-[#b3b3b3] italic">reading this moment…</p>
          )}
        </div>
      </div>

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
            placeholder="your question, the moment it arrived, and the city"
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
