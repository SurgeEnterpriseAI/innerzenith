"use client";

// Focused birth-details editor (spec 6.3 + founder note E): edit ONLY the
// relevant fields — not the whole 7-dot onboarding. On save, recompute the
// chart and advance chart_computed_at so every category gives a fresh broad
// reading next open (founder note A). Shows the recalculation disclaimer.

import { useEffect, useRef, useState } from "react";
import { Profile, deriveFidelity, saveProfile } from "@/lib/profile";
import { useT } from "@/lib/i18n";
import TimeInput from "./TimeInput";

type GeoPick = { name: string; country: string | null; latitude: number; longitude: number; timezone: string | null };

export default function ProfileEdit({
  profile,
  onSaved,
  onCancel,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(profile.full_name);
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? "");
  const [timeMode, setTimeMode] = useState<"known" | "approx" | "unknown">(
    profile.birth_time_known ? "known" : profile.birth_time_approximate ? "approx" : "unknown"
  );
  const [birthTime, setBirthTime] = useState(profile.birth_time_local ?? "");
  const [birthCity, setBirthCity] = useState<GeoPick | null>(
    profile.birth_city && profile.birth_lat != null
      ? { name: profile.birth_city, country: profile.birth_country, latitude: profile.birth_lat, longitude: profile.birth_lng ?? 0, timezone: profile.birth_timezone }
      : null
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const p: Profile = {
      ...profile,
      full_name: name.trim() || profile.full_name,
      birth_date: birthDate || profile.birth_date,
      birth_time_local: timeMode === "unknown" ? null : birthTime,
      birth_time_known: timeMode === "known",
      birth_time_approximate: timeMode === "approx",
      birth_city: birthCity?.name ?? profile.birth_city,
      birth_country: birthCity?.country ?? profile.birth_country,
      birth_lat: birthCity?.latitude ?? profile.birth_lat,
      birth_lng: birthCity?.longitude ?? profile.birth_lng,
      birth_timezone: birthCity?.timezone ?? profile.birth_timezone,
    };
    p.profile_fidelity = deriveFidelity(p);

    // Recompute the chart for the new details.
    let chart = p.chart_profile;
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
      if (res.ok) chart = (await res.json()).profile ?? chart;
    } catch {}

    // Advance chart_computed_at → resets category memory to fresh broad readings.
    const finalP: Profile = { ...p, chart_profile: chart, chart_computed_at: new Date().toISOString() };
    saveProfile(finalP);
    setSaving(false);
    onSaved(finalP);
  }

  if (saving) {
    return (
      <div className="min-h-[100dvh] bg-[#2b2b2b] text-white flex items-center justify-center">
        <p className="font-serif-i text-[#d4d4d4]">{t("Reconnecting your dots…")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2b] text-white px-6 py-10 pb-28">
      <div className="max-w-md mx-auto">
        <button onClick={onCancel} className="text-[#b3b3b3] hover:text-white text-sm mb-4">‹ {t("back")}</button>
        <h1 className="font-serif-i text-2xl mb-2">{t("Edit birth details")}</h1>
        <p className="text-[#b3b3b3] text-xs leading-relaxed mb-6">
          {t("Updating these will recalculate your entire chart. Your past conversations stay in History; future sessions use your new chart, and each area opens fresh.")}
        </p>

        <label className="micro-label block mb-1">{t("Name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-transparent border-b border-[#b3b3b3]/40 focus:border-white outline-none text-lg py-2 mb-5 font-serif-i" />

        <label className="micro-label block mb-1">{t("Birth date")}</label>
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
          className="w-full bg-transparent border-b border-[#b3b3b3]/40 focus:border-white outline-none text-lg py-2 mb-5 [color-scheme:dark]" />

        <label className="micro-label block mb-2">{t("Birth time")}</label>
        <div className="flex gap-2 mb-3">
          {(["known", "approx", "unknown"] as const).map((m) => (
            <button key={m} onClick={() => setTimeMode(m)}
              className={`flex-1 py-2 rounded-lg border text-xs transition ${timeMode === m ? "border-white bg-white/5" : "border-[#b3b3b3]/30"}`}>
              {m === "known" ? t("Exact") : m === "approx" ? t("Approx") : t("Unknown")}
            </button>
          ))}
        </div>
        {timeMode !== "unknown" && (
          <div className="mb-5"><TimeInput value={birthTime} onChange={setBirthTime} /></div>
        )}

        <label className="micro-label block mb-1">{t("Birth place")}</label>
        <CityPicker value={birthCity} onPick={setBirthCity} />

        <button onClick={save}
          className="w-full mt-8 bg-white text-[#2b2b2b] rounded-full py-3.5 font-medium text-sm">
          {t("Save and recalculate")}
        </button>
      </div>
    </div>
  );
}

function CityPicker({ value, onPick }: { value: GeoPick | null; onPick: (g: GeoPick | null) => void }) {
  const { t } = useT();
  const [q, setQ] = useState(value?.name ?? "");
  const [results, setResults] = useState<GeoPick[]>([]);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (q.trim().length < 2 || (value && q === value.name)) { setResults([]); return; }
    tRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        setResults((await r.json()).results || []);
      } catch {}
    }, 280);
  }, [q, value]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); onPick(null); }}
        placeholder={t("city or town of birth")}
        className="w-full bg-transparent border-b border-[#b3b3b3]/40 focus:border-white outline-none text-lg py-2 font-serif-i" />
      {results.length > 0 && !value && (
        <div className="absolute z-10 left-0 right-0 mt-2 bg-[#1f1f1f] border border-[#444] rounded-xl overflow-hidden">
          {results.map((r, i) => (
            <button key={i} onClick={() => { onPick(r); setQ(r.name); setResults([]); }}
              className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 border-b border-[#333] last:border-0">
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
