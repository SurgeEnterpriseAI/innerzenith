"use client";

// Stage 01 — the seven dots. Each step lights a dot and connects it to
// the previous with a dashed line, forming a constellation. By dot 7 the
// user has created their shape in the sky.

import { useEffect, useRef, useState } from "react";
import {
  Profile,
  emptyProfile,
  deriveFidelity,
  saveProfile,
} from "@/lib/profile";
import TimeInput from "./TimeInput";
import { useT } from "@/lib/i18n";

type GeoPick = {
  name: string;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

// A random onboarding shape — 7 dots forming a constellation (spec 1.1).
// Picked at random on first launch, no storage, never referenced later.
const SHAPES: { name: string; dots: [number, number][] }[] = [
  { name: "butterfly", dots: [[50, 18], [34, 30], [30, 48], [50, 40], [70, 30], [66, 48], [50, 62]] },
  { name: "bird", dots: [[20, 30], [36, 22], [50, 28], [64, 22], [80, 30], [50, 42], [50, 60]] },
  { name: "crown", dots: [[24, 50], [34, 26], [42, 46], [50, 22], [58, 46], [66, 26], [76, 50]] },
  { name: "lotus", dots: [[50, 44], [30, 30], [40, 22], [50, 18], [60, 22], [70, 30], [50, 60]] },
  { name: "comet", dots: [[22, 56], [32, 48], [42, 42], [52, 34], [62, 28], [72, 22], [80, 16]] },
];

const STEPS = [
  { n: 1, title: "What should I call you?", sub: "Just your first name. This is your story." },
  { n: 2, title: "Where are you right now?", sub: "Your current city helps me read your present moment." },
  { n: 3, title: "When were you born?", sub: "Day, month and year." },
  { n: 4, title: "Where were you born?", sub: "The city or town where you came into the world." },
  { n: 5, title: "Do you know your birth time?", sub: "Even approximate. It makes your picture far more personal." },
  { n: 6, title: "Are you a man or a woman?", sub: "It fine tunes your picture." },
  { n: 7, title: "One last thing before we begin.", sub: "You are one dot away from complete." },
];

export default function Onboarding({ onComplete }: { onComplete: (p: Profile) => void }) {
  const { t } = useT();
  const [step, setStep] = useState(0); // 0-indexed
  const [connecting, setConnecting] = useState(false);
  const shapeRef = useRef(SHAPES[Math.floor(stableRandom() * SHAPES.length)]);

  // collected values
  const [name, setName] = useState("");
  const [currentCity, setCurrentCity] = useState<GeoPick | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [birthCity, setBirthCity] = useState<GeoPick | null>(null);
  const [timeMode, setTimeMode] = useState<"unset" | "known" | "approx" | "unknown">("unset");
  const [birthTime, setBirthTime] = useState("");
  const [gender, setGender] = useState<"M" | "F" | null>(null);
  const [agreed, setAgreed] = useState(false);

  function canAdvance(): boolean {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return !!currentCity;
      case 2: return /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
      case 3: return !!birthCity;
      case 4:
        if (timeMode === "unset") return false;
        if (timeMode === "known" || timeMode === "approx") return /^\d{2}:\d{2}$/.test(birthTime);
        return true; // unknown
      case 5: return gender !== null;
      case 6: return agreed;
      default: return false;
    }
  }

  function next() {
    if (!canAdvance()) return;
    if (step < 6) {
      setStep(step + 1);
    } else {
      finish();
    }
  }

  async function finish() {
    setConnecting(true);
    const p: Profile = {
      ...emptyProfile(),
      full_name: name.trim(),
      gender,
      birth_date: birthDate,
      birth_time_local: timeMode === "known" || timeMode === "approx" ? birthTime : null,
      birth_time_known: timeMode === "known",
      birth_time_approximate: timeMode === "approx",
      birth_city: birthCity?.name ?? null,
      birth_country: birthCity?.country ?? null,
      birth_lat: birthCity?.latitude ?? null,
      birth_lng: birthCity?.longitude ?? null,
      birth_timezone: birthCity?.timezone ?? null,
      current_city: currentCity?.name ?? null,
      current_lat: currentCity?.latitude ?? null,
      current_lng: currentCity?.longitude ?? null,
      created_at: new Date().toISOString(),
      onboarding_complete: true,
    };
    p.profile_fidelity = deriveFidelity(p);
    saveProfile(p); // save immediately so we never lose the user's input

    // Compute the full four-system chart ONCE, now (spec Stage 06). The engine
    // may cold-start (~30-50s) — the "Connecting your dots" screen covers it.
    // If it fails/unconfigured, we proceed with profile facts only.
    const minBeat = new Promise((r) => setTimeout(r, 2600));
    let chart: any = null;
    try {
      const res = await fetch("/api/compute-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birth: {
            birth_date: p.birth_date,
            birth_time: p.birth_time_local,
            birth_time_to_minute: p.birth_time_known && !p.birth_time_approximate,
            latitude: p.birth_lat,
            longitude: p.birth_lng,
            timezone: p.birth_timezone,
            gender: p.gender,
          },
        }),
      });
      if (res.ok) chart = (await res.json()).profile ?? null;
    } catch {}
    await minBeat;

    const finalP = { ...p, chart_profile: chart, chart_computed_at: new Date().toISOString() };
    saveProfile(finalP);
    onComplete(finalP);
  }

  if (connecting) return <ConnectingScreen shape={shapeRef.current} />;

  const s = STEPS[step];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#2b2b2b] text-white px-6 py-8">
      {/* the forming constellation */}
      <div className="flex justify-center pt-2 pb-6">
        <FormingShape shape={shapeRef.current} litCount={step + 1} />
      </div>

      <p className="micro-label text-center">{t("Dot {n} of 7", { n: s.n })}{s.n === 5 ? t(" — optional") : ""}</p>

      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto fade-up" key={step}>
        <h2 className="font-serif-i text-2xl leading-snug mb-2">{t(s.title)}</h2>
        <p className="text-[#b3b3b3] text-sm mb-8">{t(s.sub)}</p>

        {step === 0 && (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && next()}
            placeholder={t("your first name")}
            className="bg-transparent border-b border-[#b3b3b3]/40 focus:border-white outline-none text-xl py-2 font-serif-i"
          />
        )}

        {step === 1 && (
          <CityPicker value={currentCity} onPick={setCurrentCity} placeholder={t("your current city")} />
        )}

        {step === 2 && (
          <input
            autoFocus
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="bg-transparent border-b border-[#b3b3b3]/40 focus:border-white outline-none text-xl py-2 [color-scheme:dark]"
          />
        )}

        {step === 3 && (
          <CityPicker value={birthCity} onPick={setBirthCity} placeholder={t("city or town of birth")} />
        )}

        {step === 4 && (
          <div className="space-y-3">
            <TimeOption active={timeMode === "known"} onClick={() => setTimeMode("known")} label={t("Yes, I know it")} />
            {timeMode === "known" && (
              <div className="py-1">
                <TimeInput value={birthTime} onChange={setBirthTime} />
              </div>
            )}
            <TimeOption active={timeMode === "approx"} onClick={() => setTimeMode("approx")} label={t("Approximate time")} />
            {timeMode === "approx" && (
              <>
                <div className="py-1">
                  <TimeInput value={birthTime} onChange={setBirthTime} />
                </div>
                <p className="text-[#b3b3b3] text-xs leading-relaxed">
                  {t("Without your birth time some parts of your picture are approximate. As we talk I'll refine it. You can also explore Ask Now.")}
                </p>
              </>
            )}
            <TimeOption active={timeMode === "unknown"} onClick={() => setTimeMode("unknown")} label={t("I don't know my birth time")} />
            {timeMode === "unknown" && (
              <p className="text-[#b3b3b3] text-xs leading-relaxed">{t("No problem. You can also explore Ask Now.")}</p>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="flex gap-3">
            <GenderOption active={gender === "M"} onClick={() => setGender("M")} label={t("Man")} />
            <GenderOption active={gender === "F"} onClick={() => setGender("F")} label={t("Woman")} />
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <p className="text-[#d4d4d4] text-sm leading-relaxed">
              {t("By continuing you agree to our Terms of Use and Privacy Policy. Your personal data is used only to personalise your insight.")}
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 accent-white w-4 h-4"
              />
              <span className="text-sm font-serif-i">{t("I agree and I'm ready to see my picture.")}</span>
            </label>
          </div>
        )}
      </div>

      <div className="max-w-md w-full mx-auto pt-6">
        <button
          onClick={next}
          disabled={!canAdvance()}
          className="w-full bg-white text-[#2b2b2b] disabled:bg-[#555] disabled:text-[#999] rounded-full py-3.5 font-medium text-sm transition"
        >
          {step === 6 ? t("Agree") : t("Continue")}
        </button>
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="w-full text-[#b3b3b3] text-xs mt-3 py-1"
          >
            {t("back")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── pieces ──────────────────────────────────────────────────

function FormingShape({ shape, litCount }: { shape: { dots: [number, number][] }; litCount: number }) {
  return (
    <svg viewBox="0 0 100 80" className="w-44 h-36">
      {/* dashed lines between consecutive lit dots */}
      {shape.dots.slice(0, litCount).map((d, i) => {
        if (i === 0) return null;
        const prev = shape.dots[i - 1];
        return (
          <line
            key={`l${i}`}
            x1={prev[0]} y1={prev[1]} x2={d[0]} y2={d[1]}
            stroke="#b3b3b3" strokeWidth={0.4} strokeDasharray="1.4 1.4" opacity={0.6}
          />
        );
      })}
      {shape.dots.map((d, i) => (
        <circle
          key={`d${i}`}
          cx={d[0]} cy={d[1]}
          r={1.6}
          fill={i < litCount ? "#ffffff" : "#555"}
          className={i < litCount ? "dot-lit" : ""}
          style={i < litCount ? { filter: "drop-shadow(0 0 2px rgba(255,255,255,0.7))" } : undefined}
        />
      ))}
    </svg>
  );
}

function ConnectingScreen({ shape }: { shape: { dots: [number, number][] } }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#2b2b2b] text-white">
      <FormingShape shape={shape} litCount={shape.dots.length} />
      <p className="font-serif-i text-lg mt-8 text-[#d4d4d4]">Connecting your dots.</p>
    </div>
  );
}

function TimeOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition ${
        active ? "border-white bg-white/5" : "border-[#b3b3b3]/30 hover:border-[#b3b3b3]/60"
      }`}
    >
      {label}
    </button>
  );
}

function GenderOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-4 rounded-xl border text-sm transition ${
        active ? "border-white bg-white/5" : "border-[#b3b3b3]/30 hover:border-[#b3b3b3]/60"
      }`}
    >
      {label}
    </button>
  );
}

function CityPicker({
  value,
  onPick,
  placeholder,
}: {
  value: GeoPick | null;
  onPick: (g: GeoPick | null) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState(value?.name ?? "");
  const [results, setResults] = useState<GeoPick[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (q.trim().length < 2 || (value && q === value.name)) {
      setResults([]);
      return;
    }
    tRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        setResults(data.results || []);
        setOpen(true);
      } catch {}
    }, 280);
    return () => { if (tRef.current) clearTimeout(tRef.current); };
  }, [q, value]);

  return (
    <div className="relative">
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onPick(null);
        }}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-[#b3b3b3]/40 focus:border-white outline-none text-xl py-2 font-serif-i"
      />
      {open && results.length > 0 && !value && (
        <div className="absolute z-10 left-0 right-0 mt-2 bg-[#1f1f1f] border border-[#444] rounded-xl overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                onPick(r);
                setQ(r.name);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 border-b border-[#333] last:border-0"
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Deterministic-ish first-load randomness without Math.random in SSR path.
function stableRandom(): number {
  if (typeof window === "undefined") return 0.42;
  return (Date.now() % 1000) / 1000;
}
