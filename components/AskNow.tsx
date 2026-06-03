"use client";

// Stage 08.3 — Ask Now entry. Captures the question, the exact moment it
// arrived (timestamp on submit, on the device), and the city the user was in.

import { useEffect, useRef, useState } from "react";
import { Profile } from "@/lib/profile";

type GeoPick = { name: string; latitude: number; longitude: number };

export default function AskNow({
  profile,
  onAsk,
}: {
  profile: Profile;
  onAsk: (q: string, moment: { iso: string; city: string | null; lat: number | null; lng: number | null }) => void;
}) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState<GeoPick | null>(
    profile.current_city && profile.current_lat != null
      ? { name: profile.current_city, latitude: profile.current_lat, longitude: profile.current_lng ?? 0 }
      : null
  );
  const [results, setResults] = useState<GeoPick[]>([]);
  const [cityQ, setCityQ] = useState(profile.current_city ?? "");
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (cityQ.trim().length < 2 || (city && cityQ === city.name)) {
      setResults([]);
      return;
    }
    tRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(cityQ)}`);
        const d = await r.json();
        setResults(d.results || []);
      } catch {}
    }, 280);
  }, [cityQ, city]);

  function submit() {
    if (q.trim().length < 4 || !city) return;
    // capture the exact moment on the device, the instant the user submits
    onAsk(q.trim(), {
      iso: new Date().toISOString(),
      city: city.name,
      lat: city.latitude,
      lng: city.longitude,
    });
  }

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2b] text-white px-6 py-10 pb-28 overflow-y-auto">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif-i text-2xl mb-2">Ask Now</h1>
        <p className="text-[#b3b3b3] text-sm mb-6">Ask Now answers one specific question at a time.</p>

        <div className="text-[#d4d4d4] text-sm space-y-1 mb-6 font-serif-i italic">
          <p>&#x201C;Will I find my lost ring?&#x201D;</p>
          <p>&#x201C;Will I lose my job?&#x201D;</p>
          <p>&#x201C;Will I go abroad?&#x201D;</p>
          <p>&#x201C;Will I get married this year?&#x201D;</p>
        </div>

        <textarea
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={3}
          placeholder="your one specific question"
          className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-4 py-3 outline-none text-[15px] mb-4"
        />

        <label className="micro-label block mb-2">Where were you when it arrived?</label>
        <div className="relative mb-6">
          <input
            value={cityQ}
            onChange={(e) => {
              setCityQ(e.target.value);
              setCity(null);
            }}
            placeholder="city at the moment of the question"
            className="w-full bg-transparent border-b border-[#b3b3b3]/40 focus:border-white outline-none py-2 text-base"
          />
          {results.length > 0 && !city && (
            <div className="absolute z-10 left-0 right-0 mt-2 bg-[#1f1f1f] border border-[#444] rounded-xl overflow-hidden">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCity(r);
                    setCityQ(r.name);
                    setResults([]);
                  }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 border-b border-[#333] last:border-0"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-[#b3b3b3] text-xs space-y-1 mb-8 leading-relaxed">
          <p>Three things make this work:</p>
          <p>a. Your question must be specific</p>
          <p>b. You remember the exact moment it arrived in your mind</p>
          <p>c. You know which city you were in at that moment</p>
        </div>

        <button
          onClick={submit}
          disabled={q.trim().length < 4 || !city}
          className="w-full bg-white text-[#2b2b2b] disabled:bg-[#555] disabled:text-[#999] rounded-full py-3.5 font-medium text-sm transition"
        >
          Ask
        </button>
      </div>
    </div>
  );
}
