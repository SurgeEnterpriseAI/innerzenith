"use client";

// A conversation screen (spec 13.7/13.8). Handles natal categories AND Ask Now.
// First-visit category readings render in four labelled sections with a single
// inline illustration floated between the first two; return visits and follow-ups
// render as flowing prose. No bubbles, no cards — text sits on the black canvas.

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
import { resolveGlyph, stripLeadingGlyph, symbolSrc } from "@/lib/symbols";
import { languageByCode } from "@/lib/languages";
import { useT } from "@/lib/i18n";
import ReadAloud from "./ReadAloud";

// The four first-visit section labels (spec 11.3 / 13.7). Matched case-insensitively
// so the producer's plain-text labels render as styled section headers.
const SECTION_LABELS = [
  "the picture so far",
  "where your dots sit now",
  "the line forming",
  "your next dot",
];
const isSectionHeader = (s: string) =>
  SECTION_LABELS.includes(s.trim().toLowerCase().replace(/[.:]+$/, ""));

export default function Session({
  profile,
  category,
  isAskNow,
  askMoment,
  existing,
  onBack,
}: {
  profile: Profile;
  category: CategoryKey | "asknow";
  isAskNow: boolean;
  askMoment?: Sess["askMoment"];
  existing?: Sess | null;
  onBack: () => void;
}) {
  const { t } = useT();
  const cat = categoryByKey(category);
  const title = isAskNow ? t("Ask Now") : t(cat?.title ?? "Session");
  const lang = profile.language ?? null;
  const rtl = Boolean(languageByCode(lang)?.rtl);

  const [messages, setMessages] = useState<ChatMsg[]>(existing?.messages ?? []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [buffer, setBuffer] = useState("");
  const [symbol, setSymbol] = useState<string | null>(existing?.symbol ?? null);

  const sessionRef = useRef<Sess | null>(existing ?? null);
  const symbolRef = useRef<string | null>(existing?.symbol ?? null);
  // Frozen Ask Now inputs — seeded from a reopened session, refreshed from the
  // server's X-AskNow-Resolved header, so follow-ups reuse the same moment-chart.
  const askNowRef = useRef<Sess["askNow"] | null>(existing?.askNow ?? null);
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
        keyword: firstUser ? firstUser.content.slice(0, 40) : "Initial",
        messages: msgs,
        created_at: new Date().toISOString(),
        askMoment,
      };
    } else {
      s = { ...s, messages: msgs };
    }
    if (askNowRef.current) s = { ...s, askNow: askNowRef.current };
    if (symbolRef.current) s = { ...s, symbol: symbolRef.current };
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
          // Frozen Ask Now moment/question (reused on follow-up turns).
          askNow: isAskNow ? askNowRef.current ?? sessionRef.current?.askNow ?? null : null,
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
      if (isAskNow) {
        const resolvedHdr = res.headers.get("X-AskNow-Resolved");
        if (resolvedHdr) {
          try { askNowRef.current = JSON.parse(decodeURIComponent(resolvedHdr)); } catch {}
        }
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
      // The opening reading carries the session's inline glyph (the producer named
      // one via a leading control line; theme-fallback if it didn't). Ask Now
      // responses carry no illustration (spec 13.11).
      if (opts?.hideOpening && !isAskNow && !symbolRef.current) {
        const g = resolveGlyph(acc, category);
        symbolRef.current = g;
        setSymbol(g);
      }
      const visibleThread = opts?.hideOpening ? [] : thread;
      const final: ChatMsg[] = [...visibleThread, { role: "assistant", content: stripLeadingGlyph(acc) }];
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

  // Glyph + the four-section layout apply ONLY to a first-visit category reading.
  // A first-visit reading carries the section headers (THE PICTURE SO FAR …); a
  // return-visit welcome-back and every follow-up are plain prose with no
  // illustration (spec 13.4 / 13.8). Detect by structure so reopened sessions
  // render correctly regardless of how they were created.
  const firstAssistantIdx = messages.findIndex((m) => m.role === "assistant");
  const firstVisit =
    !isAskNow &&
    firstAssistantIdx >= 0 &&
    stripMarkdown(messages[firstAssistantIdx].content)
      .split(/\n{2,}/)
      .some((b) => isSectionHeader(b));
  const displaySymbol = firstVisit
    ? symbol ?? resolveGlyph(messages[firstAssistantIdx].content, category)
    : null;

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0D0D0D] text-white">
      {/* top bar — back arrow + centred Cormorant title (spec 13.7) */}
      <header className="relative flex items-center justify-center px-6 py-4 shrink-0">
        <button
          onClick={onBack}
          aria-label={t("Back")}
          className="absolute left-5 text-[#d4d4d4] hover:text-white text-2xl leading-none"
        >
          ‹
        </button>
        <h1 className="font-serif-r text-[18px]">{title}</h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-8">
        <div className="max-w-2xl mx-auto pt-2">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <FollowUp key={i} text={m.content} />
            ) : (
              <Reading
                key={i}
                text={m.content}
                lang={lang}
                rtl={rtl}
                structured={i === firstAssistantIdx && firstVisit}
                glyph={i === firstAssistantIdx && firstVisit ? displaySymbol : null}
              />
            )
          )}
          {streaming && buffer && (
            <Reading text={stripLeadingGlyph(buffer)} lang={lang} rtl={rtl} structured={false} glyph={null} streaming />
          )}
          {streaming && !buffer && (
            <p className="advisor-text text-[#b3b3b3]">{t("reading your dots…")}</p>
          )}
        </div>
      </div>

      {/* sticky underline input — single #D4D4D4 top line, no pill (spec 13.7) */}
      <div className="shrink-0 px-6 pt-3 pb-4 border-t border-[#d4d4d4]/30">
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
            <SendArrow />
          </button>
        </div>
      </div>
    </div>
  );
}

/** A reading: structured four-section layout (first visit) or flowing prose. */
function Reading({
  text,
  lang,
  rtl,
  structured,
  glyph,
  streaming,
}: {
  text: string;
  lang?: string | null;
  rtl?: boolean;
  structured: boolean;
  glyph: string | null;
  streaming?: boolean;
}) {
  const clean = stripMarkdown(text);

  if (!structured) {
    return (
      <div className={`advisor-text ${streaming ? "cursor-blink" : ""}`} dir={rtl ? "rtl" : undefined}>
        {clean.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {!streaming && clean.length > 0 && <ReadAloud text={clean} lang={lang} />}
      </div>
    );
  }

  // Parse into sections by the four labels; glyph floats into the second section.
  const blocks = clean.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const sections: { header: string | null; paras: string[] }[] = [];
  for (const b of blocks) {
    if (isSectionHeader(b)) sections.push({ header: b, paras: [] });
    else if (sections.length) sections[sections.length - 1].paras.push(b);
    else sections.push({ header: null, paras: [b] });
  }

  // The illustration sits in WHERE YOUR DOTS SIT NOW — the second named section
  // (Pankhuri's intent). Locate it by header so a leading paragraph can't shift
  // it into THE PICTURE SO FAR; fall back to the second headered section.
  const headered = sections.map((s, i) => ({ s, i })).filter((x) => x.s.header);
  let glyphIdx = headered.find(
    (x) => x.s.header!.trim().toLowerCase().replace(/[.:]+$/, "") === SECTION_LABELS[1]
  )?.i;
  if (glyphIdx == null) glyphIdx = headered[1]?.i ?? (sections.length > 1 ? 1 : 0);

  return (
    <div className="advisor-text" dir={rtl ? "rtl" : undefined}>
      {sections.map((sec, si) => (
        <div key={si} className="overflow-hidden">
          {sec.header && <div className="section-header mb-3">{sec.header}</div>}
          {glyph && si === glyphIdx && (
            <img src={symbolSrc(glyph)} alt="" aria-hidden className="reading-glyph" draggable={false} />
          )}
          {sec.paras.map((p, pi) => (
            <p key={pi}>{p}</p>
          ))}
          {si < sections.length - 1 && <hr className="reading-divider clear-both my-7" />}
        </div>
      ))}
      <ReadAloud text={clean} lang={lang} />
    </div>
  );
}

/** A user follow-up: a thin divider then a single full-width italic line (spec 13.8). */
function FollowUp({ text }: { text: string }) {
  return (
    <div className="mt-8">
      <hr className="reading-divider mb-4" />
      <p className="font-light italic text-[15px] text-[#b3b3b3]">{text}</p>
    </div>
  );
}

function SendArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6 11 12 5 18 11" />
    </svg>
  );
}
