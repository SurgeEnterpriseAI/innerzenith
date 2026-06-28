"use client";

// Stage 10 — Profile. Name, birth details (focused edit → recalc), current
// city, history controls, settings, DPDP data delete.

import { useState } from "react";
import { Profile, clearProfile, saveProfile } from "@/lib/profile";
import { clearAllSessions } from "@/lib/sessions";
import { deleteAccountRemote } from "@/lib/sync";
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

  const [deleting, setDeleting] = useState(false);
  async function deleteAll() {
    if (deleting) return;
    if (!confirm(t("Permanently delete your dotit account and all your data — your profile, chart, and conversations — from this device and our servers? This cannot be undone."))) return;
    setDeleting(true);
    try {
      await deleteAccountRemote(); // server-side wipe + sign-out (no-op if local-only)
    } finally {
      clearProfile();
      clearAllSessions();
      onReset();
    }
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
    <div className="min-h-[100dvh] bg-[#0D0D0D] text-white px-6 py-10 pb-28">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif-i text-[28px] mb-6">{t("Profile")}</h1>

        {/* Details */}
        <Row label={t("Name")} value={profile.full_name} />
        <Row label={t("Born")} value={`${profile.birth_date ?? "—"}${profile.birth_time_local ? " · " + profile.birth_time_local : ""}${profile.birth_time_approximate ? " (" + t("approx") + ")" : profile.birth_time_known ? "" : " · " + t("time unknown")}`} />
        <Row label={t("Birth place")} value={profile.birth_city ?? "—"} />
        <Row label={t("Current city")} value={profile.current_city ?? "—"} />
        <Row label={t("Picture fidelity")} value={t(fidelityLabel(profile.profile_fidelity))} />

        <button onClick={onEdit} className="block font-serif-i text-[15px] text-[#d4d4d4] mt-5">
          {t("Edit birth details")}
        </button>
        <button onClick={refreshChart} disabled={refreshing}
          className="block font-serif-i text-[15px] text-[#d4d4d4] mt-2 disabled:opacity-50">
          {refreshing ? t("Refreshing your chart…") : t("Refresh my chart")}
        </button>

        <hr className="reading-divider mt-8" />

        {/* Language */}
        <div className="mt-8">
          <label className="micro-label text-[#d4d4d4] block mb-3">{t("Reading language")}</label>
          <select
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            className="input-underline w-full text-[15px] text-white px-0 py-2 appearance-none cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-[#0D0D0D]">
                {l.native === l.name ? l.name : `${l.native} — ${l.name}`}
              </option>
            ))}
          </select>
          <p className="text-[#B3B3B3] font-light text-[13px] mt-2 leading-relaxed">
            {t("Your readings and the listen voice will be in this language.")}
          </p>
        </div>

        <hr className="reading-divider mt-8" />

        {/* Sync */}
        <div className="mt-8">
          <p className="micro-label text-[#d4d4d4] mb-3">{t("Sync across devices")}</p>
          <AccountSync />
        </div>

        <hr className="reading-divider mt-8" />

        {/* Settings */}
        <div className="mt-8 space-y-4">
          <p className="micro-label text-[#d4d4d4]">{t("Settings")}</p>
          <button className="flex items-center justify-between w-full text-[15px] text-white font-light">
            <span>{t("Notifications")}</span>
            <span className="text-[#d4d4d4]" aria-hidden>›</span>
          </button>
          <a href="/privacy" className="flex items-center justify-between w-full text-[15px] text-white font-light">
            <span>{t("Privacy Policy")}</span>
            <span className="text-[#d4d4d4]" aria-hidden>›</span>
          </a>
          <a href="/terms" className="flex items-center justify-between w-full text-[15px] text-white font-light">
            <span>{t("Terms of Use")}</span>
            <span className="text-[#d4d4d4]" aria-hidden>›</span>
          </a>
        </div>

        <hr className="reading-divider mt-8" />

        {/* Data */}
        <div className="mt-8 space-y-4">
          <button onClick={clearHistory} className="block text-[15px] text-[#B3B3B3] font-light">{t("Clear all conversation history")}</button>
          <button onClick={deleteAll} disabled={deleting} className="block text-[15px] text-[#B3B3B3] font-light disabled:opacity-50">
            {deleting ? t("Deleting…") : t("Delete my data")}
          </button>
          <p className="text-[#B3B3B3] font-light text-[11px] leading-[1.7]">
            {t("Your data is used only to personalise your insight — and your optional email only to sync across your devices — never for analytics, advertising, or sharing. You can access, correct, or delete it any time. (DPDP Act 2023)")}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-3 border-b border-[#d4d4d4]/30">
      <span className="micro-label text-[#d4d4d4]">{label}</span>
      <span className="text-[15px] text-white font-light text-right">{value}</span>
    </div>
  );
}

function fidelityLabel(f: Profile["profile_fidelity"]): string {
  if (f === "FULL_METRIC") return "Complete";
  if (f === "HIGH_PARTIAL") return "High (approx time)";
  return "Macro (no birth time)";
}
