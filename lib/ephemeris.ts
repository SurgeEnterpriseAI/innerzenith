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

  return `
---
INTERNAL PROFILE CONTEXT (silent — NEVER name any system, planet, sign, star,
pillar, element, or technique to the user; translate to plain language. Rule 1.)

${lines.join("\n")}

Run the agree/conflict/translate process. Speak agreements with confidence,
differences as nuance. Give before you take.
---
`;
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
