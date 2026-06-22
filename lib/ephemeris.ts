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

/** Translate a raw planet/year-lord name into a PLAIN-language theme so no
 *  technical term ever reaches the model's output (Rule 1). Accepts English or
 *  Sanskrit names; returns "" for anything unrecognised so we simply omit it. */
function planetTheme(name: string): string {
  const k = (name || "").trim().toLowerCase();
  const M: Record<string, string> = {
    sun: "visibility, authority, and stepping into leadership",
    surya: "visibility, authority, and stepping into leadership",
    moon: "emotional life, home, and what nourishes you",
    chandra: "emotional life, home, and what nourishes you",
    mars: "drive, courage, and decisive action",
    mangala: "drive, courage, and decisive action",
    kuja: "drive, courage, and decisive action",
    mercury: "communication, learning, and intellectual work",
    budha: "communication, learning, and intellectual work",
    jupiter: "growth, opportunity, and expansion",
    guru: "growth, opportunity, and expansion",
    brihaspati: "growth, opportunity, and expansion",
    venus: "relationships, beauty, comfort, and money",
    shukra: "relationships, beauty, comfort, and money",
    saturn: "responsibility, discipline, and patient endurance",
    shani: "responsibility, discipline, and patient endurance",
    rahu: "ambition, reinvention, and the unconventional",
    ketu: "letting go, depth, and turning inward",
  };
  return M[k] || "";
}

/** Translate a BaZi five-element name into a PLAIN quality, so the model never
 *  echoes "Earth", "Metal", "Water" etc. to the user (Rule 1 — never name an
 *  element). Returns "" for anything unrecognised. */
function elementQuality(name: string): string {
  const M: Record<string, string> = {
    wood: "growth, forward drive, and new ventures",
    fire: "visibility, passion, warmth, and recognition",
    earth: "groundedness, stability, patience, and the practical",
    metal: "structure, discipline, precision, and clear boundaries",
    water: "intuition, flow, adaptability, and depth",
  };
  return M[(name || "").trim().toLowerCase()] || "";
}

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
  // All three active-period systems (spec 7.5 active_period_snapshot) — not just the Vedic one.
  if (snap.bazi_luck_pillar) lines.push(`active luck pillar: ${snap.bazi_luck_pillar}`);
  if (snap.ziwei_da_xian) lines.push(`active life-stage palace: ${snap.ziwei_da_xian}`);
  // BaZi elements — translate to PLAIN qualities; never inject raw element names.
  if (ck.dominant_bazi_element) {
    const [el, strength] = String(ck.dominant_bazi_element).split("_");
    const q = elementQuality(el);
    if (q) lines.push(`core nature runs ${strength ? strength.toLowerCase() + " on " : "on "}${q}`);
  }
  if (ck.elemental_imbalance_flag) {
    const q = elementQuality(String(ck.elemental_imbalance_flag).replace(/^Deficient_/i, ""));
    if (q) lines.push(`runs thin on ${q} — the quality to consciously build`);
  }
  if (Array.isArray(ck.favourable_elements) && ck.favourable_elements.length) {
    const qs = ck.favourable_elements.map(elementQuality).filter(Boolean);
    if (qs.length) lines.push(`what steadies and serves you: ${qs.join("; ")}`);
  }
  if (Array.isArray(ck.unfavourable_elements) && ck.unfavourable_elements.length) {
    const qs = ck.unfavourable_elements.map(elementQuality).filter(Boolean);
    if (qs.length) lines.push(`what unbalances you when overdone: ${qs.join("; ")}`);
  }
  if (Array.isArray(ck.vedic_yoga_strings) && ck.vedic_yoga_strings.length)
    lines.push(`active patterns: ${ck.vedic_yoga_strings.join("; ")}`);
  // Mutual-reception exchanges (spec: must be referenced in any reading touching those houses).
  if (Array.isArray(ck.parivartana_cache) && ck.parivartana_cache.length)
    lines.push(`reinforcing exchanges: ${ck.parivartana_cache.join("; ")}`);
  // BaZi interaction map — natal clashes/combinations/harms + Ten Gods (spec 7.5).
  if (Array.isArray(ck.bazi_interaction_map) && ck.bazi_interaction_map.length)
    lines.push(`inner tensions & alliances: ${ck.bazi_interaction_map.join("; ")}`);
  if (ck.sade_sati?.active)
    lines.push(`a long discipline-cycle is active (${ck.sade_sati.phase} phase)${ck.sade_sati.detail ? " — " + ck.sade_sati.detail : ""}`);
  // House-strength map (Ashtakavarga). INTERNAL ONLY — relative life-area fortification.
  if (Array.isArray(ck.ashtakavarga_matrix) && ck.ashtakavarga_matrix.length === 12)
    lines.push(`internal life-area strength map (12 positions, higher = more fortified; use ONLY to judge which life-areas are reinforced vs strained — NEVER cite numbers or positions to the user): ${ck.ashtakavarga_matrix.join(",")}`);
  // Cusp/no-birth-time Moon ambiguity (spec 6.4 / 1.5) — the AI must ask one gentle clarifier.
  if (profile.vedic?.moon_sign_uncertain && Array.isArray(profile.vedic?.possible_moon_signs))
    lines.push(`MOON SIGN UNCERTAIN: the birth time is missing/approximate, so the emotional-core reading sits between two possibilities. Early in a Relationships or Life-Purpose session, ask ONE gentle either/or question to settle which fits, then proceed — never expose that a calculation is involved.`);

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
  // Varshaphala theme for the current solar year, if present. Translate the raw
  // year-lord (a planet name) into a PLAIN theme so the model can never leak it
  // to the user (Rule 1 — never name a planet).
  const vyears = profile.vedic?.varshaphala;
  if (vyears && typeof vyears === "object") {
    const y = Object.keys(vyears)[0];
    const lord = y ? (vyears[y]?.varsheshwara ?? "") : "";
    const theme = planetTheme(lord);
    if (theme) timing.push(`this solar year's centre of gravity is shaped by themes of ${theme}`);
  }

  const timingBlock = timing.length
    ? `\n\nTIMING WINDOWS (real dates — these are the ONLY date facts you have. Use them WHENEVER you describe the current season or a shift in time: in a first reading's "Where your dots sit now" movement, AND whenever the user asks "when", "how long", "what dates", or "until when". Translate each into a concrete plain-language month/year window anchored on today, e.g. "this stretch runs until around September 2026". NEVER invent or guess a date or year that is not derived from the windows below — if you state a timeframe, it MUST come from here. NEVER name a planet/period/system. Do NOT say "I can't give precise dates" — you have them here.)\n` +
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

// ── Per-category chart facts (spec 7.5 category context_slice) ──
// Resolves the SPECIFIC chart geometry for the tapped topic — the house lord and
// where it sits, what occupies the house, the topic's Arudha, and the topic's
// divisional dignity — and renders them in PLAIN language only. This is what
// makes a Property reading about THIS chart's home-significator rather than a
// generic "Scorpio rising wants their territory".
const _SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
const _SIGN_LORD: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun",
  Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter",
  Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};
const _DEBIL: Record<string, string> = {
  Sun: "Libra", Moon: "Scorpio", Mars: "Cancer", Mercury: "Pisces",
  Jupiter: "Capricorn", Venus: "Virgo", Saturn: "Aries",
};
const _EXALT: Record<string, string> = {
  Sun: "Aries", Moon: "Taurus", Mars: "Capricorn", Mercury: "Virgo",
  Jupiter: "Cancer", Venus: "Pisces", Saturn: "Libra",
};
const _HOUSE_LIFE: Record<number, string> = {
  1: "how you show up, your vitality and drive",
  2: "money, possessions, family, and what you value",
  3: "courage, effort, communication, and self-initiative",
  4: "home, roots, inner peace, your mother, and property",
  5: "creativity, children, romance, and self-expression",
  6: "work, service, health, daily routine, and obstacles",
  7: "partnership, marriage, and close dealings with others",
  8: "upheaval, shared resources, depth, and transformation",
  9: "fortune, beliefs, mentors, higher learning, and luck",
  10: "career, public standing, and authority",
  11: "gains, income, networks, and the fulfilment of desires",
  12: "endings, solitude, foreign places, loss, and letting go",
};
const _CATEGORY_CHART: Record<string, { house: number; house2?: number; arudha?: string; varga: string; area: string }> = {
  career: { house: 10, arudha: "A10", varga: "D10", area: "work, calling, and public standing" },
  relationships: { house: 7, arudha: "A7", varga: "D9", area: "partnership and love" },
  money: { house: 2, house2: 11, arudha: "A2", varga: "D2", area: "money, resources, and security" },
  property: { house: 4, arudha: "A4", varga: "D4", area: "home, roots, and property" },
  health: { house: 6, house2: 1, varga: "D6", area: "health and vitality" },
  purpose: { house: 9, arudha: "A9", varga: "D9", area: "meaning, direction, and purpose" },
};

// Houses where a slow transiting planet meaningfully colours each topic (spec 7.5
// house schema "transit triggers"). Health watches body/illness/crisis/loss houses.
const _TRANSIT_HOUSES: Record<string, number[]> = {
  career: [10, 6, 11], relationships: [7, 2, 8], money: [2, 11, 5, 9],
  property: [4, 2, 12], health: [1, 6, 8, 12], purpose: [9, 5, 12],
};

// Plain-language strength note for a topic's ruling planet, from its dignity — so
// the reading reflects whether the ruler is well-resourced or strained, not just
// its theme (Rule 1: never name the planet or the dignity).
function _lordStrengthPhrase(v: any, planet: string): string {
  const d = v?.dignities?.[planet];
  if (!d) return "";
  if (d.essential_dignity === "Exalted") return ", and that drive is exceptionally strong and well-resourced";
  if (d.essential_dignity === "Debilitated") return ", though that drive is under real strain and has to work harder than it should";
  if (d.essential_dignity === "Moolatrikona" || d.essential_dignity === "Own") return ", and that drive stands on solid, self-sufficient ground";
  if (d.combust) return ", though it tends to work from behind the scenes rather than out in the open";
  return "";
}

// The chart's real yoga combinations, in plain meaning — surfaced PER TOPIC so the
// reading reflects the actual born-in patterns that bear on the question, not just
// generic life-themes (spec 7.5). Matched by name substring; tied to topic by life_area.
const _YOGA_PLAIN: Record<string, string> = {
  Ruchaka: "a rare, defining strength of drive, courage, and command",
  Bhadra: "a rare, defining sharpness of intellect and communication",
  Hamsa: "a rare, defining depth of wisdom and integrity",
  Malavya: "a rare, defining gift for refinement, charisma, and drawing comfort and beauty",
  Sasa: "a rare, defining capacity for discipline, structure, and authority",
  "Raja Yoga": "a real capacity for status, leadership, and rising in the world",
  "Vipreet Raja": "a capacity to rise specifically through setbacks and adversity",
  Dhana: "a genuine pull toward wealth and material security",
  Amala: "a clean, well-regarded public reputation",
  "Gaja Kesari": "wisdom and the lasting respect of others",
  "Neecha Bhanga": "an early weakness in this area that converts into real strength",
  "Parivartana": "two parts of your life feeding and strengthening each other",
};
const _TOPIC_YOGA_AREAS: Record<string, string[]> = {
  career: ["character", "reputation", "power/status", "wealth", "rise through adversity", "wisdom/respect"],
  money: ["wealth", "power/status", "reputation"],
  relationships: ["character", "marriage", "relationship", "wisdom/respect", "transformation"],
  property: ["wealth", "home", "power/status"],
  health: ["character", "transformation"],
  purpose: ["character", "wisdom/respect", "reputation", "rise through adversity"],
};
function _plainYoga(name: string): string | null {
  for (const k of Object.keys(_YOGA_PLAIN)) if (name.includes(k)) return _YOGA_PLAIN[k];
  return null;
}

export function categoryContext(profile: any, category?: string | null, today?: any): string {
  if (!profile || !category) return "";
  const spec = _CATEGORY_CHART[category];
  const v = profile.vedic;
  const lagnaSign = v?.ascendant?.sign;
  if (!spec || !v?.planets || !lagnaSign) return ""; // no birth time → skip gracefully
  const lagnaIdx = _SIGNS.indexOf(lagnaSign);
  if (lagnaIdx < 0) return "";
  const planets = v.planets;
  const facts: string[] = [];

  const houseSignFor = (h: number) => _SIGNS[(lagnaIdx + h - 1) % 12];
  const houseOf = (sign: string) => ((_SIGNS.indexOf(sign) - lagnaIdx + 12) % 12) + 1;

  const describeHouse = (h: number) => {
    const hsign = houseSignFor(h);
    const lord = _SIGN_LORD[hsign];
    const lp = planets[lord];
    if (lp && typeof lp.house_whole_sign === "number") {
      const t = planetTheme(lord);
      if (t) facts.push(`what drives your ${spec.area} carries the quality of ${t}${_lordStrengthPhrase(v, lord)}, and right now it plays out through the part of life about ${_HOUSE_LIFE[lp.house_whole_sign]}`);
    }
    // occupants of the house
    const occ = Object.keys(planets)
      .filter((nm) => planets[nm]?.house_whole_sign === h && planetTheme(nm))
      .map((nm) => planetTheme(nm));
    if (occ.length)
      facts.push(`sitting squarely inside your ${spec.area} are forces of ${occ.join("; ")} — these colour it strongly`);
  };

  describeHouse(spec.house);
  if (spec.house2) describeHouse(spec.house2);

  // Arudha of the topic — how it actually shows up to the world
  const ar = v.arudha_padas?.[spec.arudha || ""];
  if (ar && _SIGNS.includes(ar)) {
    const ah = houseOf(ar);
    facts.push(`the way your ${spec.area} actually appears to others takes the shape of ${_HOUSE_LIFE[ah]}`);
    // The arudha's LORD (spec 7.5: A10/A2/A4/A9 lord — name, house, dignity) — what
    // actually shapes that public image. This was dropped for every category.
    const arLord = _SIGN_LORD[ar];
    const alp = planets[arLord];
    if (planetTheme(arLord) && alp && typeof alp.house_whole_sign === "number")
      facts.push(`and that public image is shaped by ${planetTheme(arLord)}${_lordStrengthPhrase(v, arLord)}, working through the part of life about ${_HOUSE_LIFE[alp.house_whole_sign]}`);
  }

  // Relationships-specific (spec 7.5) — the spouse-significator (Darakaraka) and
  // the marriage arudha (Upapada Lagna). Both mandatory, neither captured by the
  // generic house/arudha logic above; their absence made love readings feel generic.
  if (category === "relationships") {
    const dk = v.chara_karakas?.DK?.planet;
    if (dk && planets[dk] && planetTheme(dk)) {
      const dh = planets[dk].house_whole_sign;
      facts.push(
        `the person who becomes a true partner tends to carry the quality of ${planetTheme(dk)}${_lordStrengthPhrase(v, dk)}` +
        (typeof dh === "number" ? `, and they tend to enter through the part of life about ${_HOUSE_LIFE[dh]}` : "")
      );
    }
    const ul = v.arudha_padas?.UL;
    if (ul && _SIGNS.includes(ul)) {
      const ulLord = _SIGN_LORD[ul];
      facts.push(
        `the shape a committed, lasting bond actually takes for you shows up through ${_HOUSE_LIFE[houseOf(ul)]}` +
        (planetTheme(ulLord) ? `, carried by ${planetTheme(ulLord)}${_lordStrengthPhrase(v, ulLord)}` : "")
      );
    }
  }

  // Health-specific (spec 7.5) — H8 (crises/longevity) and H12 (rest/sleep/mental
  // health) alongside the H1/H6 already injected, plus the D8 longevity layer and
  // the D27 constitutional indicator. None captured by the generic house/varga logic.
  if (category === "health") {
    const h8sign = houseSignFor(8);
    const h8lord = _SIGN_LORD[h8sign];
    const h8lp = planets[h8lord];
    if (planetTheme(h8lord) && h8lp && typeof h8lp.house_whole_sign === "number")
      facts.push(`how you weather crises and what carries your long-term resilience runs on ${planetTheme(h8lord)}${_lordStrengthPhrase(v, h8lord)}, and it works itself out through the part of life about ${_HOUSE_LIFE[h8lp.house_whole_sign]}`);
    const h8occ = Object.keys(planets).filter((nm) => planets[nm]?.house_whole_sign === 8 && planetTheme(nm)).map((nm) => planetTheme(nm));
    if (h8occ.length)
      facts.push(`sitting inside the part of life about sudden upheavals and deep recovery are forces of ${h8occ.join("; ")} — these shape how your body meets a real shock`);

    const h12sign = houseSignFor(12);
    const h12lord = _SIGN_LORD[h12sign];
    const h12lp = planets[h12lord];
    if (planetTheme(h12lord) && h12lp && typeof h12lp.house_whole_sign === "number")
      facts.push(`your rest, your sleep, and your inner mental balance are governed by ${planetTheme(h12lord)}${_lordStrengthPhrase(v, h12lord)}, surfacing through the part of life about ${_HOUSE_LIFE[h12lp.house_whole_sign]}`);
    const h12occ = Object.keys(planets).filter((nm) => planets[nm]?.house_whole_sign === 12 && planetTheme(nm)).map((nm) => planetTheme(nm));
    if (h12occ.length)
      facts.push(`sitting inside the part of life about retreat, rest, and quiet recovery are forces of ${h12occ.join("; ")} — these colour your sleep and inner steadiness`);

    const d8 = v.divisional_charts?.D8;
    if (d8?.available && d8.planets && d8.lagna_sign) {
      const d8lord = _SIGN_LORD[d8.lagna_sign];
      const d8lordSign = d8.planets[d8lord];
      if (planetTheme(d8lord)) {
        let clause = `the deep thread of your physical resilience and staying-power rests on ${planetTheme(d8lord)}`;
        if (d8lordSign && _EXALT[d8lord] === d8lordSign) clause += " — and that thread is unusually robust and well-supported";
        else if (d8lordSign && _DEBIL[d8lord] === d8lordSign) clause += " — though that thread is strained and needs conscious, patient care";
        facts.push(clause);
      }
      const d8weak = Object.keys(d8.planets).filter((nm) => _DEBIL[nm] === d8.planets[nm] && planetTheme(nm)).map((nm) => planetTheme(nm));
      if (d8weak.length)
        facts.push(`in this deep layer of physical endurance, ${d8weak.join("; ")} run weak and ask for the most careful tending`);
    }

    const d27 = v.divisional_charts?.D27;
    if (d27?.available && d27.lagna_sign) {
      const d27lord = _SIGN_LORD[d27.lagna_sign];
      if (planetTheme(d27lord))
        facts.push(`your underlying constitution carries the quality of ${planetTheme(d27lord)} — this is the baseline grain your physical strength and weak points are cut from`);
    }
  }

  // Life-Purpose-specific (spec 7.5) — the Atmakaraka (soul significator), the
  // Karakamsha (PRIMARY Jaimini life-purpose indicator), the vargottama soul-dharma
  // signal, the D20 (dharma) lagna lord, and the live Narayana period sign.
  if (category === "purpose") {
    const ak = v.chara_karakas?.AK;
    if (ak?.planet && planetTheme(ak.planet)) {
      const akp = planets[ak.planet];
      facts.push(
        `the deepest driver of your life's work carries the quality of ${planetTheme(ak.planet)}${_lordStrengthPhrase(v, ak.planet)}` +
        (akp && typeof akp.house_whole_sign === "number" ? `, and it operates through the part of life about ${_HOUSE_LIFE[akp.house_whole_sign]}` : "")
      );
    }
    if (ak?.karakamsha_sign && _SIGNS.includes(ak.karakamsha_sign)) {
      const kLord = _SIGN_LORD[ak.karakamsha_sign];
      if (planetTheme(kLord))
        facts.push(`the soul-level signature of your purpose takes the shape of ${planetTheme(kLord)}`);
    }
    if (v.divisional_charts?.D9?.lagna_sign && v.divisional_charts.D9.lagna_sign === lagnaSign)
      facts.push(`your outer life and your inner essence point the same direction — a rare alignment of who you are and why you're here`);
    const d20 = v.divisional_charts?.D20;
    if (d20?.available && d20.lagna_sign && _SIGNS.includes(d20.lagna_sign)) {
      const d20Lord = _SIGN_LORD[d20.lagna_sign];
      if (planetTheme(d20Lord)) {
        const d20Sign = d20.planets?.[d20Lord];
        const strength =
          d20Sign && _EXALT[d20Lord] === d20Sign ? ", and that thread runs unusually strong here"
          : d20Sign && _DEBIL[d20Lord] === d20Sign ? ", though that thread is under strain and asks for conscious tending"
          : "";
        facts.push(`the dharma, the spiritual thread underneath, runs on ${planetTheme(d20Lord)}${strength}`);
      }
    }
    const nd = v.narayana_dasha?.d1;
    if (Array.isArray(nd)) {
      const todayISO = new Date().toISOString().slice(0, 10);
      const active = nd.find((p: any) => p?.start <= todayISO && todayISO < p?.end);
      const ndLord = active?.sign_lord;
      if (ndLord && planetTheme(ndLord))
        facts.push(`the chapter of purpose you're living right now is themed around ${planetTheme(ndLord)}`);
    }
  }

  // Divisional fine-grain (e.g. D6 for Health): the varga's own rising-force
  // dignity, who sits in the topic-house of the varga, and any varga planet at
  // an extreme of strength (spec 7.5 "D6 Lagna lord dignity / H6 occupants /
  // exaltation-debilitation flagged").
  const varga = v.divisional_charts?.[spec.varga];
  if (varga?.available && varga.planets && varga.lagna_sign) {
    const vLagnaIdx = _SIGNS.indexOf(varga.lagna_sign);
    const vLord = _SIGN_LORD[varga.lagna_sign];
    const vlSign = varga.planets[vLord];
    // The divisional Lagna lord itself — the underlying texture the whole area
    // rests on (spec 7.5: "D9 Lagna sign and lord" for Relationships/Purpose).
    if (planetTheme(vLord))
      facts.push(`the deeper, underlying texture of your ${spec.area} rests on ${planetTheme(vLord)}${_lordStrengthPhrase(v, vLord)}`);
    if (vlSign && _DEBIL[vLord] === vlSign)
      facts.push(`in the deep grain of your ${spec.area}, the core thread is under strain and has to work harder`);
    else if (vlSign && _EXALT[vLord] === vlSign)
      facts.push(`in the deep grain of your ${spec.area}, the core thread is unusually strong and well-supported`);
    if (vLagnaIdx >= 0) {
      const vHouseSign = _SIGNS[(vLagnaIdx + spec.house - 1) % 12];
      const vOcc = Object.keys(varga.planets).filter((nm) => varga.planets[nm] === vHouseSign && planetTheme(nm)).map((nm) => planetTheme(nm));
      if (vOcc.length) facts.push(`deep inside this area sit forces of ${vOcc.join("; ")}`);
    }
    const strong = Object.keys(varga.planets).filter((nm) => _EXALT[nm] === varga.planets[nm] && planetTheme(nm)).map((nm) => planetTheme(nm));
    const weak = Object.keys(varga.planets).filter((nm) => _DEBIL[nm] === varga.planets[nm] && planetTheme(nm)).map((nm) => planetTheme(nm));
    if (strong.length) facts.push(`here, ${strong.join("; ")} run exceptionally strong`);
    if (weak.length) facts.push(`here, ${weak.join("; ")} are weakened and need conscious support`);
    // Divisional yogas (spec 2.9 extension) — born-in Raja/Dhana/Parivartana patterns
    // INSIDE this varga (D10 for career, D9 for relationships/purpose), stored
    // separately from the D1 yogas. Only D9/D10 carry them.
    const vYogas = [
      ...new Set((varga.yogas || []).map((y: any) => _plainYoga(y?.name)).filter(Boolean) as string[]),
    ].slice(0, 2);
    if (vYogas.length)
      facts.push(`woven into the deep grain of your ${spec.area} is a born-in pattern that bears directly here — ${vYogas.join("; and ")}`);
  }

  // Topic yogas — the chart's REAL born-in combinations that bear on this area,
  // tied to the topic (spec 7.5). Without this they only show in the global context,
  // untethered from the question — the gap that made topic readings feel generic.
  const wantAreas = _TOPIC_YOGA_AREAS[category] || [];
  const topicYogas = [
    ...new Set(
      (v.yogas || [])
        .filter((y: any) => y && y.strength !== "note" && wantAreas.includes(y.life_area))
        .map((y: any) => _plainYoga(y.name))
        .filter(Boolean) as string[]
    ),
  ].slice(0, 2);
  if (topicYogas.length)
    facts.push(`a defining pattern you were born with bears directly on this — ${topicYogas.join("; and ")}; name it as a real, specific gift, not a vague strength`);

  // Transit triggers — slow planets (Saturn/Jupiter/Rahu/Ketu) currently passing
  // through this topic's key houses. Live, not natal (spec 7.5 house schema).
  if (today?.slow_transits) {
    const watch = _TRANSIT_HOUSES[category] || [spec.house];
    const hits = Object.entries(today.slow_transits)
      .map(([planet, sign]: any) => ({ planet, h: houseOf(sign as string) }))
      .filter((x) => watch.includes(x.h) && planetTheme(x.planet))
      .map((x) => `${planetTheme(x.planet)} is passing through the part of life about ${_HOUSE_LIFE[x.h]}`);
    if (hits.length)
      facts.push(`RIGHT NOW in transit (live, not part of the birth pattern): ${hits.join("; ")} — name this as a current, time-bound influence`);
  }

  if (!facts.length) return "";
  return `\n\n--- THIS TOPIC IN THE CHART — *LEAD THE READING WITH THESE*. These are the loudest, most specific signals for this exact topic; the broader personality/temperament/period context above is BACKGROUND to weave in, never the opening. Open on the single sharpest item here, not on a general personality description. Plain meaning only — NEVER name a house, sign, planet, or technique; weave as specific observations, not a list. ---\n` +
    facts.map((f) => "  - " + f).join("\n") + "\n";
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

const _VIM_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
const _VIM_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};

/** Current Pratyantardasha (3rd level) — subdivide the running Antardasha into 9
 *  sub-sub-periods (Vimshottari proportions, starting from the Antardasha lord)
 *  and return the one containing today. Spec 2.12 / 8.12. */
function currentPratyantar(antarLord: string, startISO: string, endISO: string, todayMs: number) {
  const s = Date.parse(startISO), e = Date.parse(endISO);
  if (!(s < e) || todayMs < s || todayMs >= e) return null;
  const span = e - s;
  const startIdx = _VIM_ORDER.indexOf(antarLord);
  if (startIdx < 0) return null;
  let cursor = s;
  for (let k = 0; k < 9; k++) {
    const lord = _VIM_ORDER[(startIdx + k) % 9];
    cursor += span * (_VIM_YEARS[lord] / 120);
    if (todayMs < cursor) return { lord, end: new Date(cursor).toISOString().slice(0, 10) };
  }
  return null;
}

/** Resolve current major/sub/sub-sub period live from the stored Vimshottari
 *  timeline against today's date (spec 2.12 — a date-range lookup, not a recompute). */
function resolveCurrentPeriods(profile: any): {
  maha?: string; maha_end?: string; antar?: string; antar_end?: string; next_antar_start?: string;
  pratyantar?: string; pratyantar_end?: string;
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
          const pd = currentPratyantar(ads[i].lord, ads[i].start, ads[i].end, Date.now());
          if (pd) { out.pratyantar = pd.lord; out.pratyantar_end = pd.end; }
          break;
        }
      }
      return out;
    }
  }
  return {};
}

/** Global "now" snapshot for the Surprise Me micro layer + transit triggers.
 *  Passing the user's coords also yields the current Hora lord at their location. */
export async function fetchToday(
  loc?: { lat?: number | null; lon?: number | null; tz?: string | null },
  timeoutMs = 55000
): Promise<any | null> {
  const b = base();
  if (!b) return null;
  let url = `${b}/today`;
  if (loc && loc.lat != null && loc.lon != null && loc.tz) {
    url += `?lat=${loc.lat}&lon=${loc.lon}&tz=${encodeURIComponent(loc.tz)}`;
  }
  try {
    const res = await fetch(url, {
      headers: { "X-Ephemeris-Secret": process.env.EPHEMERIS_SHARED_SECRET || "" },
      signal: AbortSignal.timeout(timeoutMs),
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
  if (cur.pratyantar) dom.push(`current sub-sub-period (the immediate, near-term flavour shaping THIS stretch): ${cur.pratyantar} (until ${cur.pratyantar_end})`);
  if (luck) dom.push(`current 10-yr luck pillar: ${luck.stem} ${luck.animal} (${luck.stem_element})`);
  if (daxian) dom.push(`current 10-yr palace: ${daxian.palace} [${(daxian.stars || []).join(", ")}]`);
  if (narayana) dom.push(`environment-period sign: ${narayana}`);

  const micro: string[] = [];
  if (today?.moon_sign) micro.push(`today the Moon sits in ${today.moon_sign} (${today.moon_nakshatra})`);
  if (today?.day_lord) micro.push(`today's day-energy: ${today.day_lord}`);
  if (today?.hora_lord) micro.push(`the ruling hour of this very moment is governed by ${today.hora_lord}`);
  if (today?.tithi) micro.push(`lunar day ${today.tithi}, ${today.paksha === "Shukla" ? "waxing — energy building" : "waning — energy releasing"} phase; the day's overall weave is ${today.yoga_quality}`);
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
