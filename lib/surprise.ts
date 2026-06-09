// Surprise Me — once-per-calendar-day gate (spec 7.5 Surprise Me row).
// First tap each day generates a fresh two-layer reading; repeat taps the
// same day return the stored reading with a welcome-back (no regeneration).

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
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: todayKey(), text }));
  } catch {}
}
