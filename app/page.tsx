"use client";

import { useEffect, useRef, useState } from "react";
import {
  ensureSession,
  getOrCreateActiveThread,
  createNewThread,
  loadMessages,
  saveMessage,
  migrateLocalStorageIfAny,
} from "@/lib/auth";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

const STORAGE_KEY = "innerzenith.thread.v1";

export default function Home() {
  // ─── State ───────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // feature flags from the server
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);

  // when persistence is on, we track these
  const [userId, setUserId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // ─── Mount: feature detect + hydrate ─────────────────────
  useEffect(() => {
    (async () => {
      // 1) ask the server what's configured
      let cfg = { voice: false, persistence: false };
      try {
        const r = await fetch("/api/config");
        if (r.ok) cfg = await r.json();
      } catch {}
      setVoiceEnabled(cfg.voice);
      setPersistenceEnabled(cfg.persistence);

      if (cfg.persistence) {
        // ── DB-backed path ─────────────────────────────────
        const uid = await ensureSession();
        if (!uid) {
          // session failed — fall back to localStorage silently
          await hydrateFromLocalStorage();
          return;
        }
        setUserId(uid);

        const thread = await getOrCreateActiveThread(uid);
        if (!thread) {
          await hydrateFromLocalStorage();
          return;
        }
        setThreadId(thread.id);

        // Try to migrate any leftover localStorage conversation into this
        // first thread, so users coming from before don't lose their history.
        const existingDbMessages = await loadMessages(thread.id);
        if (existingDbMessages.length === 0) {
          const migrated = await migrateLocalStorageIfAny(
            thread.id,
            STORAGE_KEY
          );
          if (migrated > 0) {
            // re-fetch so order/ids line up
            const after = await loadMessages(thread.id);
            setMessages(after.map(toUiMessage));
            setHydrated(true);
            return;
          }
        }

        if (existingDbMessages.length > 0) {
          setMessages(existingDbMessages.map(toUiMessage));
          setHydrated(true);
          return;
        }

        // No history → open the conversation.
        setHydrated(true);
        await openConversation(thread.id, uid);
      } else {
        // ── localStorage-only path (legacy / unconfigured) ─
        await hydrateFromLocalStorage();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function hydrateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          setHydrated(true);
          return;
        }
      }
    } catch {}
    setHydrated(true);
    await openConversation(null, null);
  }

  // ─── Persist when in localStorage mode ───────────────────
  useEffect(() => {
    if (!hydrated || persistenceEnabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages, hydrated, persistenceEnabled]);

  // ─── Autoscroll / autosize ───────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamBuffer]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [input]);

  // ─── Conversation actions ────────────────────────────────
  async function openConversation(tid: string | null, uid: string | null) {
    await streamReply(
      [{ role: "user", content: "__begin__" }],
      { hideUser: true, threadId: tid, userId: uid }
    );
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");

    if (threadId) {
      await saveMessage(threadId, "user", text);
    }

    await streamReply(next, { threadId, userId });
  }

  async function streamReply(
    thread: Message[],
    opts?: { hideUser?: boolean; threadId?: string | null; userId?: string | null }
  ) {
    setStreaming(true);
    setStreamBuffer("");
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: thread,
          userId: opts?.userId ?? null,
          threadId: opts?.threadId ?? null,
        }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => "");
        throw new Error(errBody || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setStreamBuffer(acc);
      }

      const final: Message[] = opts?.hideUser
        ? [{ role: "assistant", content: acc }]
        : [...thread, { role: "assistant", content: acc }];
      setMessages(final);
      setStreamBuffer("");

      // Persist assistant reply
      if (opts?.threadId) {
        await saveMessage(opts.threadId, "assistant", acc);
      }
    } catch (e: any) {
      setError(e?.message || "Something went quiet. Try once more.");
    } finally {
      setStreaming(false);
    }
  }

  async function newConversation() {
    if (streaming) return;
    if (!confirm("Start a fresh conversation? This will set the current one aside."))
      return;

    setStreamBuffer("");
    setError(null);

    if (persistenceEnabled && userId) {
      const fresh = await createNewThread(userId);
      if (fresh) {
        setThreadId(fresh.id);
        setMessages([]);
        await openConversation(fresh.id, userId);
        return;
      }
    }

    // localStorage path
    localStorage.removeItem(STORAGE_KEY);
    setMessages([]);
    await openConversation(null, null);
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <main className="min-h-screen flex flex-col bg-ink-900 text-ink-100">
      <header className="border-b border-ink-800 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${persistenceEnabled ? "bg-emerald-400" : "bg-ink-300"}`}
            title={persistenceEnabled ? "saved across devices" : "local only"}
          />
          <h1 className="font-serif italic text-lg tracking-wide text-ink-100">
            InnerZenith
          </h1>
        </div>
        <button
          onClick={newConversation}
          disabled={streaming}
          className="text-xs text-ink-400 hover:text-ink-200 disabled:opacity-40 transition"
        >
          new conversation
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-10">
        <div className="max-w-2xl mx-auto space-y-8">
          {messages.length === 0 && !streamBuffer && hydrated && (
            <div className="text-center text-ink-400 italic font-serif pt-20">
              gathering a quiet moment for you…
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              voiceEnabled={voiceEnabled}
            />
          ))}

          {streaming && streamBuffer && (
            <MessageBubble
              role="assistant"
              content={streamBuffer}
              streaming
              voiceEnabled={false}
            />
          )}

          {error && (
            <div className="text-sm text-red-300/80 border border-red-900/40 bg-red-950/30 rounded-md px-4 py-3 font-sans">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-ink-800 px-4 sm:px-8 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-3 bg-ink-800/60 border border-ink-700 rounded-2xl px-4 py-3 focus-within:border-ink-500 transition">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                messages.length === 0
                  ? "settling in…"
                  : "share what's true for you right now"
              }
              rows={1}
              disabled={streaming || messages.length === 0}
              className="flex-1 bg-transparent outline-none text-ink-50 placeholder:text-ink-400/60 font-sans text-[15px] leading-relaxed disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={streaming || !input.trim()}
              className="text-ink-100 bg-ink-700 hover:bg-ink-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm font-sans transition"
            >
              send
            </button>
          </div>
          <p className="text-[11px] text-ink-400/60 mt-2 text-center font-sans">
            press enter to send · shift + enter for a new line
          </p>
        </div>
      </div>
    </main>
  );
}

function toUiMessage(m: { role: string; content: string }): Message {
  return {
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  };
}

function MessageBubble({
  role,
  content,
  streaming,
  voiceEnabled,
}: {
  role: Role;
  content: string;
  streaming?: boolean;
  voiceEnabled: boolean;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-ink-800/80 border border-ink-700 text-ink-100 rounded-2xl rounded-tr-md px-4 py-3 font-sans text-[15px] leading-relaxed">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="group">
      <div
        className={`advisor-text text-ink-100 ${streaming ? "cursor-blink" : ""}`}
      >
        {content.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      {!streaming && voiceEnabled && content.length > 0 && (
        <PlayButton text={content} />
      )}
    </div>
  );
}

function PlayButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function toggle() {
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 3000) }),
      });
      if (!res.ok) throw new Error("voice unavailable");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      onClick={toggle}
      className="mt-3 text-[11px] text-ink-400 hover:text-ink-200 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      {state === "idle" && "▷ listen"}
      {state === "loading" && "… preparing"}
      {state === "playing" && "■ stop"}
    </button>
  );
}
