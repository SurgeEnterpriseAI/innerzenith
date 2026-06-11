// Context-driven Ask Now collection — gather the three things WITHOUT a Claude
// call per turn. Date/time via chrono-node, city via geocode-probe, question =
// the remaining interrogative text. Claude is only called for the final reading.

import * as chrono from "chrono-node";
import { geocodeCity } from "./ephemeris";

export type AskNowState = {
  question: string | null;
  datetime_local: string | null; // YYYY-MM-DDTHH:MM
  city: { name: string; latitude: number; longitude: number; timezone: string } | null;
  cityRaw: string | null;
  missing: ("question" | "datetime" | "city")[];
  questionType: string;
};

const QUESTION_WORDS = /\b(will|should|can|do|does|is|are|am|when|whether|shall|would|could|how|what|if)\b/i;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Pull a date+time from text. Requires BOTH a date and a time to be "complete".
// Handles the common case where the city sits BETWEEN the date and the time
// ("9 Jun 2026, jaipur, 3:11 pm") — chrono returns two fragments, so we merge
// a date-certain fragment with a time-certain one.
function parseDateTime(text: string): { iso: string | null; consumed: string[] } {
  const results = chrono.parse(text, undefined, { forwardDate: false });
  if (!results.length) return { iso: null, consumed: [] };

  const dateRes = results.find(
    (r) => r.start.isCertain("day") && r.start.isCertain("month") && r.start.isCertain("year")
  );
  const timeRes = results.find((r) => r.start.isCertain("hour"));

  // both date + time in a single fragment
  for (const r of results) {
    if (r.start.isCertain("day") && r.start.isCertain("month") &&
        r.start.isCertain("year") && r.start.isCertain("hour")) {
      const dt = r.start.date();
      return {
        iso: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
        consumed: [r.text],
      };
    }
  }
  // merge separate date + time fragments
  if (dateRes && timeRes) {
    const d = dateRes.start.date();
    const t = timeRes.start.date();
    return {
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`,
      consumed: [dateRes.text, timeRes.text],
    };
  }
  return { iso: null, consumed: results.map((r) => r.text) };
}

// City: try explicit "in/at X" cues, comma-separated short segments, then the
// whole short message — geocoding validates (only real places resolve).
async function findCity(text: string, dateSpans: string[]) {
  let scrubbed = text;
  for (const s of dateSpans) scrubbed = scrubbed.replace(s, " ");

  const candidates: string[] = [];
  const inMatch = scrubbed.match(/\b(?:in|at|from)\s+([A-Z][A-Za-z .'-]{2,40})/);
  if (inMatch) candidates.push(inMatch[1].trim());
  for (const seg of scrubbed.split(/[,.;\n]/)) {
    const s = seg.trim();
    if (s && s.split(/\s+/).length <= 4 && !QUESTION_WORDS.test(s) && /[A-Za-z]/.test(s)) {
      candidates.push(s);
    }
  }
  // de-dup, longest-cue first
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = c.toLowerCase().replace(/[^a-z ]/g, "").trim();
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    const geo = await geocodeCity(c.replace(/[^A-Za-z ,'-]/g, "").trim());
    if (geo) return { city: geo, raw: c };
  }
  return null;
}

function extractQuestion(text: string, dateSpans: string[], cityRaw: string | null): string | null {
  let s = text;
  for (const d of dateSpans) s = s.replace(d, " ");
  if (cityRaw) s = s.replace(cityRaw, " ");
  // prefer a clause containing a question word
  const clauses = s.split(/[.\n?]/).map((c) => c.trim()).filter(Boolean);
  const interrogative = clauses.find((c) => QUESTION_WORDS.test(c) && c.split(/\s+/).length >= 3);
  const best = interrogative || clauses.sort((a, b) => b.length - a.length)[0] || "";
  const cleaned = best.replace(/^[,;:\s]+|[,;:\s]+$/g, "").trim();
  return cleaned.length >= 6 ? cleaned : null;
}

function classify(q: string): string {
  const t = q.toLowerCase();
  const map: [RegExp, string][] = [
    [/\b(job|promotion|career|work|company|fired|laid off|resign|appraisal)\b/, "job"],
    [/\b(marriage|marry|spouse|partner|relationship|love|girlfriend|boyfriend|wife|husband)\b/, "marriage"],
    [/\b(money|salary|income|loan|debt|cash|raise|payment)\b/, "money"],
    [/\b(gain|invest|stock|profit|windfall|return)\b/, "gains"],
    [/\b(house|home|property|land|flat|apartment|rent|buy)\b/, "property"],
    [/\b(health|illness|disease|surgery|recover|sick|operation)\b/, "health"],
    [/\b(abroad|foreign|travel|relocat|visa|move)\b/, "travel"],
    [/\b(case|court|lawsuit|legal|dispute|litigation)\b/, "legal"],
    [/\b(lost|find|missing|misplaced|ring|keys|wallet)\b/, "lost_object"],
  ];
  for (const [re, t2] of map) if (re.test(t)) return t2;
  return "general";
}

/** Parse the whole Ask Now conversation deterministically. */
export async function parseAskNow(userTexts: string[]): Promise<AskNowState> {
  const all = userTexts.join("\n");
  const { iso, consumed } = parseDateTime(all);
  const cityHit = await findCity(all, consumed);
  const question = extractQuestion(userTexts[0] || all, consumed, cityHit?.raw ?? null)
    || extractQuestion(all, consumed, cityHit?.raw ?? null);

  const missing: AskNowState["missing"] = [];
  if (!question) missing.push("question");
  if (!iso) missing.push("datetime");
  if (!cityHit) missing.push("city");

  return {
    question,
    datetime_local: iso,
    city: cityHit?.city ?? null,
    cityRaw: cityHit?.raw ?? null,
    missing,
    questionType: question ? classify(question) : "general",
  };
}

/** Fixed, no-Claude prompt for the missing piece(s). */
export function missingPrompt(state: AskNowState): string {
  const m = state.missing;
  if (m.includes("question") && m.length === 3)
    return "What's the one specific question sitting with you?";
  if (m.includes("datetime") && m.includes("city"))
    return "Two more things and I can read this: the exact day and time the question first came to you, and the city you were in at that moment.";
  if (m.includes("datetime"))
    return "And do you remember the exact day and time this question first arrived in your mind?";
  if (m.includes("city"))
    return "Which city were you in at that moment?";
  if (m.includes("question"))
    return "And what's the specific question you'd like me to read?";
  return "Tell me a little more.";
}
