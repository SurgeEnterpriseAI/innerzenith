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
export function chartToContext(profile: any, currentCity?: string | null): string {
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

  // SYSTEM REALITY (spec 7.5.a) — injected at the very top of every session
  // so the advisor is always grounded in today's date + the user's location.
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const cityStr = currentCity ? ` The user is currently located in ${currentCity}.` : "";

  return `
---
SYSTEM REALITY: Today's date is ${dateStr}.${cityStr}
Use this as the anchor for every timing statement — never say you don't know
the date, and translate stored period dates into concrete windows from today.

INTERNAL PROFILE CONTEXT (silent — NEVER name any system, planet, sign, star,
pillar, element, or technique to the user; translate to plain language. Rule 1.)

${lines.join("\n")}${timingBlock}

Run the agree/conflict/translate process. Speak agreements with confidence,
differences as nuance. Give before you take.
---
`;
}

/** Dynamic Time-Drilldown (spec 7.5.f): if the conversation mentions a
 *  specific year, retrieve that year's periods from the stored chart and
 *  inject them (retrieval only — no recompute). */
export function timeDrilldown(profile: any, conversationText: string): string {
  const years = (conversationText.match(/\b(20[2-4]\d)\b/g) || [])
    .map(Number)
    .filter((y) => y >= 2015 && y <= 2045);
  if (!years.length) return "";
  const year = years[years.length - 1]; // most recently mentioned
  const ymid = `${year}-07-01`;
  const out: string[] = [];

  // Vimshottari MD/AD active in that year
  const tl = profile?.vedic?.vimshottari?.timeline;
  if (Array.isArray(tl)) {
    for (const md of tl) {
      if (md.start <= ymid && ymid < md.end) {
        let ad = "";
        for (const a of md.antardashas || []) {
          if (a.start <= ymid && ymid < a.end) { ad = ` / sub-period until ${a.end}`; break; }
        }
        out.push(`in ${year}, the major life-period runs ${md.start}→${md.end}${ad}`);
        break;
      }
    }
  }
  // Narayana D1 sign active that year
  const nd = profile?.vedic?.narayana_dasha?.d1;
  if (Array.isArray(nd)) {
    for (const p of nd) {
      if (p.start <= ymid && ymid < p.end) { out.push(`environment-period theme that year carries a ${p.sign}-flavour`); break; }
    }
  }
  // BaZi annual pillar (computable)
  const STEMS = ["Jia","Yi","Bing","Ding","Wu","Ji","Geng","Xin","Ren","Gui"];
  const ANIM = ["Rat","Ox","Tiger","Rabbit","Dragon","Snake","Horse","Goat","Monkey","Rooster","Dog","Pig"];
  out.push(`that year's annual cycle is a ${STEMS[(year-4)%10]} ${ANIM[(year-4)%12]} year`);

  if (!out.length) return "";
  return `\n\n--- TIME DRILLDOWN for ${year} (retrieval; translate to plain windows, no system names) ---\n` +
    out.map((o) => "  - " + o).join("\n");
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

/** Global "now" snapshot for the Surprise Me micro layer. */
export async function fetchToday(): Promise<any | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}/today`, {
      headers: { "X-Ephemeris-Secret": process.env.EPHEMERIS_SHARED_SECRET || "" },
      signal: AbortSignal.timeout(55000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Build the Surprise Me two-layer context (spec 7.5 Surprise Me row). */
export function buildSurpriseContext(
  profile: any,
  birthDate: string | null,
  birthTimeKnown: boolean,
  today: any | null
): string {
  const cur = resolveCurrentPeriods(profile);
  const age = birthDate
    ? Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 864e5))
    : null;

  // BaZi current luck pillar (by age) + Ten God
  let luck: any = null;
  const lp = profile?.bazi?.luck_pillars?.pillars;
  if (Array.isArray(lp) && age != null)
    luck = lp.find((p: any) => p.from_age <= age && age < p.to_age) || null;

  // Zi Wei current Da Xian (by age)
  let daxian: any = null;
  const dx = profile?.ziwei?.da_xian?.periods;
  if (Array.isArray(dx) && age != null)
    daxian = dx.find((p: any) => p.from_age <= age && age <= p.to_age) || null;

  // Narayana D1 current sign (by date)
  let narayana: string | null = null;
  const nd = profile?.vedic?.narayana_dasha?.d1;
  const todayISO = new Date().toISOString().slice(0, 10);
  if (Array.isArray(nd))
    narayana = (nd.find((p: any) => p.start <= todayISO && todayISO < p.end) || {}).sign || null;

  const dom: string[] = [];
  if (cur.maha) dom.push(`major life-period: ${cur.maha} (until ${cur.maha_end})`);
  if (cur.antar) dom.push(`current sub-period: ${cur.antar} (until ${cur.antar_end})`);
  if (luck) dom.push(`current 10-yr luck pillar: ${luck.stem} ${luck.animal} (${luck.stem_element})`);
  if (daxian) dom.push(`current 10-yr palace: ${daxian.palace} [${(daxian.stars || []).join(", ")}]`);
  if (narayana) dom.push(`environment-period sign: ${narayana}`);

  const micro: string[] = [];
  if (today?.moon_sign) micro.push(`today the Moon sits in ${today.moon_sign} (${today.moon_nakshatra})`);
  if (today?.day_lord) micro.push(`today's day-energy: ${today.day_lord}`);
  if (today?.bazi_year_pillar) micro.push(`this year: ${today.bazi_year_pillar.stem} ${today.bazi_year_pillar.animal}`);

  const noTime = !birthTimeKnown;

  return `
--- SURPRISE ME (two-layer, generated fresh today) ---
Write ONE continuous, flowing response — never label or separate the layers.
Open with the DOMINANT SITUATION (about 70–90 words): the large current chapter
of their life, where the long cycles converge. Then let it narrow, in a natural
sentence (no heading), into TODAY (about 40–60 words): the texture of this
specific day. No technical terms, no system names — plain, hyper-specific prose.
${noTime ? "(No birth time: lean on the major life-period + today's broad sky only; keep fine timing soft.)" : ""}

DOMINANT SITUATION inputs:
${dom.map((d) => "  - " + d).join("\n") || "  - (limited data)"}

TODAY inputs:
${micro.map((m) => "  - " + m).join("\n") || "  - (limited data)"}

Where these inputs converge on one theme, speak with quiet certainty.
End on a single grounded line about how to meet today — not a question.
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
