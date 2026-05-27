// Calls the Python ephemeris sidecar.
// Returns the full chart JSON, or null if the sidecar isn't configured.
// The result is injected into Claude's system context so the model can
// silently reason over real planetary positions — but the user never
// sees a single technical term (Rule 1).

export type EphemerisInput = {
  birth_date: string;          // YYYY-MM-DD
  birth_time?: string | null;  // HH:MM(:SS)
  birth_place: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
};

export async function fetchChart(input: EphemerisInput): Promise<any | null> {
  const base = process.env.EPHEMERIS_URL;
  const secret = process.env.EPHEMERIS_SHARED_SECRET || "";
  if (!base) return null;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ephemeris-Secret": secret,
      },
      body: JSON.stringify(input),
      // 8s timeout — chart math is fast; long delays are sidecar trouble.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ephemeris] non-OK:", res.status, body);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[ephemeris] fetch failed:", e);
    return null;
  }
}

/** Compact the chart JSON into a focused context block for the model. */
export function chartToContext(chart: any): string {
  if (!chart) return "";
  const vedic = chart.vedic || {};
  const planets = vedic.planets || {};
  const planetLines = Object.entries(planets)
    .map(([name, p]: any) => {
      return `  ${name}: ${p.sign} ${p.degree_in_sign?.toFixed?.(2) || ""}° (${p.nakshatra} pada ${p.pada}, lord ${p.nakshatra_lord})${p.retrograde ? " [R]" : ""}`;
    })
    .join("\n");

  const asc = vedic.ascendant || {};
  const dasha = chart.dasha || {};
  const nav = chart.navamsha || {};
  const bazi = chart.bazi || {};

  return `
---
INTERNAL CHART CONTEXT (NEVER show terms below to the user — Rule 1)

Vedic (sidereal, Lahiri):
  Ascendant: ${asc.sign} ${asc.degree_in_sign?.toFixed?.(2) || ""}° (${asc.nakshatra} pada ${asc.pada})
  Planets:
${planetLines}

Current Vimshottari period:
  Major: ${dasha.major_lord || "?"} (${dasha.years_into_major || "?"} of ${dasha.major_length_years || "?"} years)
  Minor: ${dasha.minor_lord || "?"}

Navamsha (D-9):
  Ascendant: ${nav.ascendant_sign || "?"}
  Planets: ${Object.entries(nav)
    .filter(([k]) => k !== "ascendant_sign")
    .map(([k, v]: any) => `${k}→${v.sign}`)
    .join(", ")}

BaZi pillars:
  Day Master: ${bazi.day_master || "?"} (${bazi.day_master_element || "?"})
  Year: ${bazi.year?.stem}/${bazi.year?.branch}  Month: ${bazi.month?.stem}/${bazi.month?.branch}
  Day: ${bazi.day?.stem}/${bazi.day?.branch}    Hour: ${bazi.hour?.stem}/${bazi.hour?.branch}

Run the 8-step silent synthesis. Translate to plain warm English. Never name a planet, sign, dasha, nakshatra, pillar, or element. Use the seven rules.
---
`;
}
