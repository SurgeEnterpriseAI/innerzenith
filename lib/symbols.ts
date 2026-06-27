// Reading glyphs (Pankhuri's symbol set) — one silver relief symbol crowns each
// reading and marks each History entry. Pure module: shared by the chat route
// (server) and the reading components (client). Assets live in /public/symbols.
//
// How a reading gets its glyph:
//   1. The producer model is asked to begin its reply with a control line
//      `<<glyph:KEY>>` naming the one symbol that best embodies the reading.
//   2. The client extracts + strips that line (stripLeadingGlyph) and shows the
//      glyph. If the model omitted it or named an unknown KEY, we fall back to a
//      deterministic, theme-matched pick (pickThemeSymbol) — so a glyph ALWAYS
//      shows, and `fallback` is the last resort (sym_fallback.webp).

export const SYMBOL_KEYS: ReadonlySet<string> = new Set([
  "abacus","anchor","archer","axe","bamboo","bell","book","bow","brush","bull",
  "cats_eye","chariot","coconut","comet_dropped","conch","coral","cow","crescent",
  "crow","crown","dawn_sun","deer","diamond","dove","dragon","drum","eagle",
  "eclipse","elephant","eye","fallback","feet","fish_pair","flag","flag_alt1",
  "flame","garuda","gateway","hand","hanuman","heart","horse","incense",
  "infinity_knot","jasmine","key","lamp","leaf","lightning","lion","lotus","lute",
  "mala","mirror","mountain","naga","ocean","owl","palanquin","peacock","pearl",
  "phoenix","pillar","qilin","river","rose","scales","scorpion","shield","star",
  "sun","sun_alt1","swan","sword","throne","tiger","treasure","tree","trident",
  "umbrella","web","wheel",
]);

/** Public path to a glyph, falling back to the neutral sigil for unknown keys. */
export function symbolSrc(key?: string | null): string {
  const k = key && SYMBOL_KEYS.has(key) ? key : "fallback";
  return `/symbols/${k}.webp`;
}

const TAG = /^\s*<<\s*glyph\s*:\s*([a-z0-9_]+)\s*>>\s*/i;

/** The KEY named in a leading `<<glyph:KEY>>` control line, or null. */
export function extractGlyphKey(text: string): string | null {
  const m = text.match(TAG);
  const k = m?.[1]?.toLowerCase();
  return k && SYMBOL_KEYS.has(k) ? k : null;
}

/**
 * Remove the leading control line for display. While streaming, a half-arrived
 * tag (`<<glyph:lo`) is suppressed entirely so it never flashes before the
 * reading — once `>>` lands the whole line is stripped.
 */
export function stripLeadingGlyph(text: string): string {
  const m = text.match(TAG);
  if (m) return text.slice(m[0].length);
  const lead = text.replace(/^\s+/, "");
  if (lead.startsWith("<<") && !lead.includes(">>")) return ""; // partial tag, still streaming
  return text;
}

// Deterministic theme fallback — a curated shortlist per topic, picked stably by
// a hash of the reading so the same reading always shows the same glyph, while
// different readings vary. Every key here exists in SYMBOL_KEYS.
const THEME: Record<string, string[]> = {
  career: ["crown", "chariot", "eagle", "brush", "wheel", "flag", "archer", "lion"],
  relationships: ["heart", "swan", "dove", "fish_pair", "rose", "jasmine", "infinity_knot", "lute"],
  property: ["mountain", "pillar", "gateway", "tree", "elephant", "anchor", "cow"],
  health: ["tree", "leaf", "bamboo", "flame", "deer", "lotus", "river"],
  money: ["treasure", "diamond", "pearl", "coral", "abacus", "coconut", "conch"],
  purpose: ["sun", "star", "lotus", "hanuman", "feet", "mala", "eye", "dawn_sun"],
  surprise: ["comet_dropped", "eclipse", "dawn_sun", "owl", "key", "mirror", "crescent", "lightning"],
  asknow: ["eye", "key", "owl", "mirror", "crescent", "conch", "bell", "lamp", "scales"],
  default: ["lotus", "star", "sun", "mountain", "tree"],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A stable, theme-appropriate glyph when the model didn't name a valid one. */
export function pickThemeSymbol(category: string | null | undefined, seed: string): string {
  const arr = THEME[(category as string) || "default"] || THEME.default;
  return arr[hash((category || "x") + ":" + seed) % arr.length];
}

/** The glyph for a finished reading: the model's pick if valid, else a theme fallback. */
export function resolveGlyph(reading: string, category: string | null | undefined): string {
  return extractGlyphKey(reading) || pickThemeSymbol(category, reading.slice(0, 400));
}

// Injected into the producer prompt for the readings that earn a glyph (the
// first broad reading, an Ask Now answer, Surprise Me). The KEY list is grouped
// so the model can match by meaning; names are self-descriptive.
export const GLYPH_DIRECTIVE = `

--- READING GLYPH (technical control line — NOT part of the reading, the user never sees it) ---
Begin your reply with ONE line, exactly: <<glyph:KEY>>
Then a newline, then the reading itself. KEY is the single symbol below whose meaning best embodies the HEART of this particular reading — choose the most specific, resonant match, never a generic default. Do not mention or describe the symbol anywhere in the words of the reading. This line selects an accompanying image; it is the only place you may use these characters.
Available KEYS:
- sky & nature: sun, dawn_sun, crescent, eclipse, star, comet_dropped, lightning, flame, mountain, river, ocean, leaf, bamboo, tree, lotus, rose, jasmine, coconut, pearl, coral, diamond
- creatures: lion, tiger, elephant, horse, deer, cow, bull, eagle, owl, crow, dove, swan, peacock, fish_pair, scorpion, dragon, phoenix, qilin, garuda, naga
- emblems & objects: crown, throne, chariot, palanquin, umbrella, flag, shield, sword, axe, bow, archer, trident, conch, drum, bell, lute, lamp, incense, mala, mirror, key, book, brush, abacus, scales, wheel, pillar, gateway, anchor, treasure, web, infinity_knot, cats_eye
- spirit & body: hanuman, hand, feet, heart, eye
If truly nothing fits, use: fallback.`;
