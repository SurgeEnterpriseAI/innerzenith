// Session store (History). localStorage is the synchronous source of truth;
// writes mirror to Supabase for cross-device sync when signed in (lib/sync.ts).

import { CategoryKey } from "./categories";
import { pushSession, removeSession, clearSessionsRemote } from "./sync";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type Session = {
  id: string;
  category: CategoryKey | "asknow";
  isAskNow: boolean;
  keyword: string;            // extracted from first substantive user msg
  messages: ChatMsg[];
  created_at: string;
  // Ask Now capture
  askMoment?: { iso: string; city: string | null; lat: number | null; lng: number | null };
};

const KEY = "dotit.sessions.v1";

export function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveSessions(list: Session[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function upsertSession(s: Session) {
  const all = loadSessions();
  const i = all.findIndex((x) => x.id === s.id);
  if (i >= 0) all[i] = s;
  else all.unshift(s);
  saveSessions(all);
  pushSession(s); // mirror to Supabase when signed in (no-op otherwise)
}

export function deleteSession(id: string) {
  saveSessions(loadSessions().filter((s) => s.id !== id));
  removeSession(id);
}

export function clearAllSessions() {
  saveSessions([]);
  clearSessionsRemote();
}

export function newId(): string {
  // avoid Math.random reliance issues — timestamp + counter
  return "s_" + Date.now().toString(36) + "_" + (counter++).toString(36);
}
let counter = 0;

// A category counts as "seen" (→ skip the broad blueprint) only if there is a
// prior session for it created AFTER the current chart was computed. When birth
// details change and the chart is recomputed, sinceISO advances, so every
// category gives a fresh broad reading again (spec 6.3 "chart memory is reset").
export function topicSeen(category: CategoryKey | "asknow", sinceISO?: string | null): boolean {
  return loadSessions().some(
    (s) =>
      s.category === category &&
      !s.isAskNow &&
      (!sinceISO || s.created_at >= sinceISO)
  );
}
