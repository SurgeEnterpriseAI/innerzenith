"use client";

// Stage 10 — Profile. Name, birth details (focused edit → recalc), current
// city, history controls, settings, DPDP data delete.

import { useState } from "react";
import { Profile, clearProfile, saveProfile } from "@/lib/profile";
import { clearAllSessions } from "@/lib/sessions";

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
  const [refreshing, setRefreshing] = useState(false);

  function deleteAll() {
    if (!confirm("Delete your dotit profile and all sessions on this device? This cannot be undone.")) return;
    clearProfile();
    clearAllSessions();
    onReset();
  }

  function clearHistory() {
    if (!confirm("Clear all your conversation history? Your profile and chart are kept.")) return;
    clearAllSessions();
    alert("History cleared.");
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
        <h1 className="font-serif-i text-2xl mb-6">Profile</h1>

        <Row label="Name" value={profile.full_name} />
        <Row label="Born" value={`${profile.birth_date ?? "—"}${profile.birth_time_local ? " · " + profile.birth_time_local : ""}${profile.birth_time_approximate ? " (approx)" : profile.birth_time_known ? "" : " · time unknown"}`} />
        <Row label="Birth place" value={profile.birth_city ?? "—"} />
        <Row label="Current city" value={profile.current_city ?? "—"} />
        <Row label="Picture fidelity" value={fidelityLabel(profile.profile_fidelity)} />

        <button onClick={onEdit}
          className="w-full mt-6 border border-white/20 hover:border-white/40 rounded-full py-3 text-sm transition">
          Edit birth details
        </button>
        <button onClick={refreshChart} disabled={refreshing}
          className="w-full mt-3 border border-white/15 hover:border-white/30 rounded-full py-3 text-sm text-[#d4d4d4] transition disabled:opacity-50">
          {refreshing ? "Refreshing your chart…" : "Refresh my chart"}
        </button>

        <div className="mt-10 pt-6 border-t border-white/10 space-y-3">
          <p className="micro-label">History</p>
          <button onClick={clearHistory} className="block text-sm text-[#d4d4d4]">Clear all conversation history</button>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 space-y-4">
          <p className="micro-label">Settings</p>
          <button className="block text-sm text-[#d4d4d4]">Notifications</button>
          <button className="block text-sm text-[#d4d4d4]">Privacy Policy</button>
          <button className="block text-sm text-[#d4d4d4]">Terms of Use</button>
          <button onClick={deleteAll} className="block text-sm text-red-400/80">
            Delete my data
          </button>
        </div>

        <p className="text-[#777] text-[11px] mt-8 leading-relaxed">
          Your data is used only to personalise your insight — never for analytics, advertising, or sharing. You can access, correct, or delete it any time. (DPDP Act 2023)
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
