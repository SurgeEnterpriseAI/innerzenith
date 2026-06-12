"use client";

// Language-aware "listen" button. Self-gates on the voice feature flag
// (/api/config), so any reading surface can drop it in without its own voice
// plumbing. POSTs the text + language to /api/tts and plays the MP3.

import { useEffect, useRef, useState } from "react";

let voiceOnCache: boolean | null = null;
let probe: Promise<boolean> | null = null;
function probeVoice(): Promise<boolean> {
  if (voiceOnCache !== null) return Promise.resolve(voiceOnCache);
  if (!probe) {
    probe = fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        voiceOnCache = Boolean(c?.voice);
        return voiceOnCache;
      })
      .catch(() => {
        voiceOnCache = false;
        return false;
      });
  }
  return probe;
}

export default function ReadAloud({ text, lang }: { text: string; lang?: string | null }) {
  const [on, setOn] = useState<boolean>(voiceOnCache ?? false);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    probeVoice().then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);

  if (!on || !text) return null;

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
        body: JSON.stringify({ text: text.slice(0, 3000), lang: lang ?? undefined }),
      });
      if (!res.ok) throw new Error("voice unavailable");
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
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
      className="mt-3 text-[11px] text-[#b3b3b3] hover:text-white transition opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      {state === "idle" && "▷ listen"}
      {state === "loading" && "… preparing"}
      {state === "playing" && "■ stop"}
    </button>
  );
}
