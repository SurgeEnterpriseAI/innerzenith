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

const SPEEDS = [1, 1.5, 2, 3, 0.5];
const SPEED_KEY = "dotit.tts.speed";

function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

export default function ReadAloud({ text, lang }: { text: string; lang?: string | null }) {
  const [on, setOn] = useState<boolean>(voiceOnCache ?? false);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [speed, setSpeed] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    probeVoice().then((v) => alive && setOn(v));
    setSpeed(loadSpeed());
    return () => {
      alive = false;
    };
  }, []);

  if (!on || !text) return null;

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    try {
      localStorage.setItem(SPEED_KEY, String(next));
    } catch {}
    if (audioRef.current) audioRef.current.playbackRate = next; // apply live
  }

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
      audio.playbackRate = speed;
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }

  const fmt = (n: number) => (Number.isInteger(n) ? `${n}×` : `${n}×`);

  return (
    <span className="mt-3 inline-flex items-center gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
      <button onClick={toggle} className="text-[11px] text-[#b3b3b3] hover:text-white transition">
        {state === "idle" && "▷ listen"}
        {state === "loading" && "… preparing"}
        {state === "playing" && "■ stop"}
      </button>
      <button
        onClick={cycleSpeed}
        title="Playback speed"
        aria-label="Playback speed"
        className="text-[11px] text-[#777] hover:text-white transition tabular-nums"
      >
        {fmt(speed)}
      </button>
    </span>
  );
}
