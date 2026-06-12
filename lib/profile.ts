// dotit user profile — Stage 1.3 Data Collected During Onboarding.
// localStorage is the synchronous source of truth; writes are mirrored to
// Supabase for cross-device sync when the user is signed in (see lib/sync.ts).

import { pushProfile, clearProfileRemote } from "./sync";

export type Gender = "M" | "F";

export type ProfileFidelity = "FULL_METRIC" | "HIGH_PARTIAL" | "MACRO_ONLY";

export type Profile = {
  // identity
  full_name: string;
  gender: Gender | null;

  // birth
  birth_date: string | null;            // YYYY-MM-DD
  birth_time_local: string | null;      // HH:MM (24h) or null
  birth_time_known: boolean;
  birth_time_approximate: boolean;
  birth_city: string | null;
  birth_country: string | null;
  birth_lat: number | null;
  birth_lng: number | null;
  birth_timezone: string | null;        // IANA
  birth_utc_offset: string | null;

  // current location
  current_city: string | null;
  current_lat: number | null;
  current_lng: number | null;

  // derived
  profile_fidelity: ProfileFidelity;

  // preferred language for readings + read-aloud (BCP-47, e.g. "hi-IN").
  // null until set; resolved to the device locale on first load.
  language?: string | null;

  // meta
  created_at: string;
  onboarding_complete: boolean;

  // the full four-system chart, computed ONCE at onboarding and stored
  // permanently (spec Stage 06). null until/unless the engine is reachable.
  chart_profile?: any | null;
  // when the chart was last computed; advances on birth-detail edits so
  // category sessions reset to a fresh broad reading (spec 6.3).
  chart_computed_at?: string | null;
};

const KEY = "dotit.profile.v1";

export function emptyProfile(): Profile {
  return {
    full_name: "",
    gender: null,
    birth_date: null,
    birth_time_local: null,
    birth_time_known: false,
    birth_time_approximate: false,
    birth_city: null,
    birth_country: null,
    birth_lat: null,
    birth_lng: null,
    birth_timezone: null,
    birth_utc_offset: null,
    current_city: null,
    current_lat: null,
    current_lng: null,
    profile_fidelity: "MACRO_ONLY",
    language: null,
    created_at: "",
    onboarding_complete: false,
    chart_profile: null,
    chart_computed_at: null,
  };
}

export function deriveFidelity(p: Partial<Profile>): ProfileFidelity {
  if (p.birth_time_known && !p.birth_time_approximate) return "FULL_METRIC";
  if (p.birth_time_approximate) return "HIGH_PARTIAL";
  return "MACRO_ONLY";
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  pushProfile(p); // mirror to Supabase when signed in (no-op otherwise)
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  clearProfileRemote(); // mirror the reset to Supabase when signed in
}
