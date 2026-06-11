// Surprise Me — once-per-calendar-day gate (spec 7.5 Surprise Me row).
// First tap each day generates a fresh two-layer reading; repeat taps the
// same day return the stored reading with a welcome-back (no regeneration).
// Mirrored to Supabase for cross-device sync when signed in (lib/sync.ts).

import { pushSurprise } from "./sync";

const KEY = "dotit.surprise.v1";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (local-ish)
}

export function getTodaySurprise(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o.date === todayKey() ? o.text : null;
  } catch {
    return null;
  }
}

export function saveTodaySurprise(text: string) {
  const day = todayKey();
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: day, text }));
  } catch {}
  pushSurprise(day, text); // mirror to Supabase when signed in (no-op otherwise)
}
