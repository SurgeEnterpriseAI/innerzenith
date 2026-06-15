"use client";

// Stage 10 — Profile. Name, birth details (focused edit → recalc), current
// city, history controls, settings, DPDP data delete.

import { useState } from "react";
import { Profile, clearProfile, saveProfile } from "@/lib/profile";
import { clearAllSessions } from "@/lib/sessions";
import { LANGUAGES } from "@/lib/languages";
import { useT } from "@/lib/i18n";
import AccountSync from "./AccountSync";

export default function ProfileView({
  profile,
  onEdit,
  onReset,
  onChange,
}: {
  profile: Profile;
  onEdit: () => void;
  onReset: () => void;
  onChange: (p: Profile) => void;
}) {
  const { t } = useT();
  const [refreshing, setRefreshing] = useState(false);
  // English is the default; the dropdown reflects the user's saved choice if any.
  const [lang, setLang] = useState<string>(profile.language || "en-US");

  function changeLang(code: string) {
    setLang(code);
    const updated = { ...profile, language: code };
    saveProfile(updated);
    onChange(updated);
  }

  function deleteAll() {
    if (!confirm(t("Delete your dotit profile and all sessions on this device? This cannot be undone."))) return;
    clearProfile();
    clearAllSessions();
    onReset();
  }

  function clearHistory() {
    if (!confirm(t("Clear all your conversation history? Your profile and chart are kept."))) return;
    clearAllSessions();
    alert(t("History cleared."));
  }

  async function refreshChart() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/compute-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birth: {
            birth_date: profile.birth_date,
            birth_time: profile.birth_time_local,
            birth_time_to_minute: profile.birth_time_known && !profile.birth_time_approximate,
            latitude: profile.birth_lat,
            longitude: profile.birth_lng,
            timezone: profile.birth_timezone,
            gender: profile.gender,
          },
        }),
      });
      if (res.ok) {
        const chart = (await res.json()).profile;
        const updated = { ...profile, chart_profile: chart ?? profile.chart_profile, chart_computed_at: new Date().toISOString() };
        saveProfile(updated);
        onChange(updated);
      }
    } catch {}
    setRefreshing(false);
  }

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2b] text-white px-6 py-10 pb-28">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif-i text-2xl mb-6">{t("Profile")}</h1>

        <Row label={t("Name")} value={profile.full_name} />
        <Row label={t("Born")} value={`${profile.birth_date ?? "—"}${profile.birth_time_local ? " · " + profile.birth_time_local : ""}${profile.birth_time_approximate ? " (" + t("approx") + ")" : profile.birth_time_known ? "" : " · " + t("time unknown")}`} />
        <Row label={t("Birth place")} value={profile.birth_city ?? "—"} />
        <Row label={t("Current city")} value={profile.current_city ?? "—"} />
        <Row label={t("Picture fidelity")} value={t(fidelityLabel(profile.profile_fidelity))} />

        <div className="mt-6">
          <label className="micro-label block mb-2">{t("Reading & voice language")}</label>
          <select
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            className="w-full bg-[#2b2b2b] border border-white/20 focus:border-white/40 rounded-full px-4 py-3 text-sm outline-none transition appearance-none cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-[#2b2b2b]">
                {l.native === l.name ? l.name : `${l.native} — ${l.name}`}
              </option>
            ))}
          </select>
          <p className="text-[#777] text-[11px] mt-2 leading-relaxed">
            {t("Your readings and the listen voice will be in this language.")}
          </p>
        </div>

        <button onClick={onEdit}
          className="w-full mt-6 border border-white/20 hover:border-white/40 rounded-full py-3 text-sm transition">
          {t("Edit birth details")}
        </button>
        <button onClick={refreshChart} disabled={refreshing}
          className="w-full mt-3 border border-white/15 hover:border-white/30 rounded-full py-3 text-sm text-[#d4d4d4] transition disabled:opacity-50">
          {refreshing ? t("Refreshing your chart…") : t("Refresh my chart")}
        </button>

        <AccountSync />

        <div className="mt-10 pt-6 border-t border-white/10 space-y-3">
          <p className="micro-label">{t("History")}</p>
          <button onClick={clearHistory} className="block text-sm text-[#d4d4d4]">{t("Clear all conversation history")}</button>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 space-y-4">
          <p className="micro-label">{t("Settings")}</p>
          <button className="block text-sm text-[#d4d4d4]">{t("Notifications")}</button>
          <a href="/privacy" className="block text-sm text-[#d4d4d4]">{t("Privacy Policy")}</a>
          <a href="/terms" className="block text-sm text-[#d4d4d4]">{t("Terms of Use")}</a>
          <button onClick={deleteAll} className="block text-sm text-red-400/80">
            {t("Delete my data")}
          </button>
        </div>

        <p className="text-[#777] text-[11px] mt-8 leading-relaxed">
          {t("Your data is used only to personalise your insight — never for analytics, advertising, or sharing. You can access, correct, or delete it any time. (DPDP Act 2023)")}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-3 border-b border-white/8">
      <span className="micro-label">{label}</span>
      <span className="text-sm text-[#d4d4d4] text-right">{value}</span>
    </div>
  );
}

function fidelityLabel(f: Profile["profile_fidelity"]): string {
  if (f === "FULL_METRIC") return "Complete";
  if (f === "HIGH_PARTIAL") return "High (approx time)";
  return "Macro (no birth time)";
}
