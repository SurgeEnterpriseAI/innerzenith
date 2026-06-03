// Local session store (History). Supabase-backed in Phase 7.

import { CategoryKey } from "./categories";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type Session = {
  id: string;
  category: CategoryKey;       // or "asknow"
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
}

export function newId(): string {
  // avoid Math.random reliance issues — timestamp + counter
  return "s_" + Date.now().toString(36) + "_" + (counter++).toString(36);
}
let counter = 0;

export function topicSeen(category: CategoryKey): boolean {
  return loadSessions().some((s) => s.category === category && !s.isAskNow);
}
