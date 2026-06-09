// Calls the dotit Python engine (Railway sidecar).
// /chart computes the full four-system profile (once, at onboarding).
// chartToContext compresses the stored profile into a silent context block
// for Claude — the user never sees any of these terms (Rule 1).

export type EphemerisInput = {
  birth_date: string;          // YYYY-MM-DD
  birth_time?: string | null;  // HH:MM
  birth_place?: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  gender?: "M" | "F" | null;
  birth_time_to_minute?: boolean;
};

function base(): string | null {
  const b = process.env.EPHEMERIS_URL;
  return b ? b.replace(/\/$/, "") : null;
}

/** Compute the full profile (onboarding). Returns the stored-profile JSON. */
export async function computeProfile(input: EphemerisInput): Promise<any | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/chart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ephemeris-Secret": process.env.EPHEMERIS_SHARED_SECRET || "",
      },
      body: JSON.stringify({
        birth_date: input.birth_date,
        birth_time: input.birth_time ?? null,
        birth_time_to_minute: input.birth_time_to_minute ?? true,
        latitude: input.latitude ?? 0,
        longitude: input.longitude ?? 0,
        timezone: input.timezone ?? "UTC",
        gender: input.gender ?? "M",
      }),
      signal: AbortSignal.timeout(55000), // tolerate Render free-tier cold starts
    });
    if (!res.ok) {
      console.error("[ephemeris] /chart non-OK:", res.status, await res.text().catch(() => ""));
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[ephemeris] /chart failed:", e);
    return null;
  }
}

// Back-compat alias used by older callers.
export const fetchChart = computeProfile;

/** Compress a stored profile into a silent context block for the model. */
export function chartToContext(profile: any): string {
  if (!profile) return "";
  const ck = profile.cache_keys || {};
  const fidelity = profile.profile_fidelity || "MACRO_ONLY";
  const snap = ck.active_period_snapshot || {};

  const lines: string[] = [];
  lines.push(`profile_fidelity: ${fidelity}`);
  if (ck.core_temperament_style) lines.push(`temperament: ${ck.core_temperament_style}`);
  if (ck.life_phase_classification) lines.push(`life phase: ${ck.life_phase_classification}`);
  if (snap.vedic_dasha) lines.push(`active period: ${snap.vedic_dasha}`);
  if (ck.dominant_bazi_element) lines.push(`dominant element: ${ck.dominant_bazi_element}`);
  if (ck.elemental_imbalance_flag) lines.push(`imbalance: ${ck.elemental_imbalance_flag}`);
  if (Array.isArray(ck.favourable_elements) && ck.favourable_elements.length)
    lines.push(`favourable elements: ${ck.favourable_elements.join(", ")}`);
  if (Array.isArray(ck.vedic_yoga_strings) && ck.vedic_yoga_strings.length)
    lines.push(`active patterns: ${ck.vedic_yoga_strings.join("; ")}`);
  if (ck.sade_sati?.active)
    lines.push(`a long discipline-cycle is active (${ck.sade_sati.phase} phase)`);

  // ── ACTUAL PERIOD DATES (resolved live against today from the stored
  // timeline — spec 2.12 session-open query, so it never goes stale) ──
  const timing: string[] = [];
  const cur = resolveCurrentPeriods(profile);
  if (cur.maha_end)
    timing.push(`current major life-period runs until ${cur.maha_end}`);
  if (cur.antar_end)
    timing.push(`current sub-period (the present "flavour" of the major period) runs until ${cur.antar_end}`);
  if (cur.next_antar_start)
    timing.push(`the next sub-period begins ${cur.next_antar_start}`);
  // Varshaphala theme for the current solar year, if present
  const vyears = profile.vedic?.varshaphala;
  if (vyears && typeof vyears === "object") {
    const y = Object.keys(vyears)[0];
    if (y) timing.push(`this solar year's centre of gravity is shaped by ${vyears[y]?.varsheshwara ?? "—"} themes`);
  }

  const timingBlock = timing.length
    ? `\n\nTIMING WINDOWS (real dates — when the user asks "when", "how long", "what dates", or "until when", translate these into a concrete plain-language month/year window, e.g. "this stretch runs until around March 2027". NEVER name a planet/period/system. Do NOT say "I can't give precise dates" — you have them here.)\n` +
      timing.map((t) => "  - " + t).join("\n")
    : "";

  return `
---
INTERNAL PROFILE CONTEXT (silent — NEVER name any system, planet, sign, star,
pillar, element, or technique to the user; translate to plain language. Rule 1.)

${lines.join("\n")}${timingBlock}

Run the agree/conflict/translate process. Speak agreements with confidence,
differences as nuance. Give before you take.
---
`;
}

/** Resolve current major/sub period live from the stored Vimshottari timeline
 *  against today's date (spec 2.12 — a date-range lookup, not a recompute). */
function resolveCurrentPeriods(profile: any): {
  maha?: string; maha_end?: string; antar?: string; antar_end?: string; next_antar_start?: string;
} {
  const timeline = profile?.vedic?.vimshottari?.timeline;
  if (!Array.isArray(timeline)) return {};
  const today = new Date().toISOString().slice(0, 10);
  for (const md of timeline) {
    if (md.start <= today && today < md.end) {
      const out: any = { maha: md.maha_lord, maha_end: md.end };
      const ads = md.antardashas || [];
      for (let i = 0; i < ads.length; i++) {
        if (ads[i].start <= today && today < ads[i].end) {
          out.antar = ads[i].lord;
          out.antar_end = ads[i].end;
          if (i + 1 < ads.length) out.next_antar_start = ads[i + 1].start;
          break;
        }
      }
      return out;
    }
  }
  return {};
}

/** Geocode a city name → coordinates + IANA timezone (Open-Meteo, no key). */
export async function geocodeCity(
  name: string
): Promise<{ name: string; latitude: number; longitude: number; timezone: string } | null> {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", name);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const r = (data.results || [])[0];
    if (!r) return null;
    return {
      name: [r.name, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone || "UTC",
    };
  } catch {
    return null;
  }
}

/** Ask Now — cast a question-moment chart. */
export async function castPrashna(input: {
  moment_iso: string;
  latitude: number;
  longitude: number;
  timezone: string;
  question_type?: string;
}): Promise<any | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/prashna`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ephemeris-Secret": process.env.EPHEMERIS_SHARED_SECRET || "",
      },
      body: JSON.stringify({ question_type: "general", ...input }),
      signal: AbortSignal.timeout(55000), // tolerate Render free-tier cold starts
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
