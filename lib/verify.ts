// Inline reading verification — the "critic" half of the two-AI loop.
//
// Gemini audits a Claude-written reading against the engine's calculated payload
// (the ONLY ground truth) and returns a structured verdict. The five checks are
// exactly the failure classes found by hand during review: ungrounded claims,
// internal contradictions, migrated life-areas, misread flags, and jargon/voice.
// The route uses the verdict to revise the reading before it ever reaches the user.

import { geminiGenerate, geminiConfigured } from "./gemini";

export type Verdict = { pass: boolean; issues: string[] };

export function verifyConfigured(): boolean {
  return geminiConfigured();
}

const RUBRIC = `You are an exacting, skeptical reviewer of an astrology-style life reading. You are given:
(A) CALCULATED FACTS — a JSON payload from a deterministic engine. This is the ONLY ground truth. Every claim in the reading must be supported by it.
(B) the READING a writer produced.

Judge the reading ONLY against the facts, on these five checks:
1. GROUNDING — every substantive claim must trace to a specific field in the payload (a named yoga, flag, placement, dignity, period, house occupant). Flag any concrete claim with no supporting field.
2. CONTRADICTION — flag any internally contradictory statements. Examples: saying the two sides are "converging / drawing closer" while also saying it "forms no contact / no resolution this window"; saying the person has "full agency" while also saying it is "outside their control".
3. DOMAIN CREEP — flag any life-area asserted (money, finances, health, family, career, marriage) when no payload field activates that area. A burden on the SELF is not a "financial drain" or a "health cost".
4. FLAG-READING — flag any misread of a calculated flag. Examples: narrating motion / "converging" when velocity_check.within_orb is false; describing a yoga as the opposite of what the payload says; inventing a timeline/date when the timing field is null; treating an out-of-orb gap's days_to_exact as a real timeline.
5. VOICE — flag astrology jargon shown to the user (any planet, sign, house, yoga, or technique NAME), and flag obvious repetition or padding.

Report EVERY problem you find across ALL FIVE checks — not just the most obvious one. Scan the whole reading sentence by sentence.

Return STRICT JSON only: {"pass": boolean, "issues": ["short specific actionable problem", ...]}.
Set "pass": true ONLY when there are zero issues. Each issue must be terse, name which check it fails, and tell the writer exactly what to fix. Do NOT rewrite the reading. Do NOT add commentary outside the JSON.`;

/**
 * Audit a reading. Returns {pass, issues}. If the critic is unavailable (no key,
 * timeout, malformed output) it returns pass=true with no issues — verification is
 * a quality gate, never a hard dependency that can block a user's answer.
 */
export async function auditReading(
  reading: string,
  payload: any,
  question: string
): Promise<Verdict> {
  if (!geminiConfigured() || !reading || !reading.trim()) return { pass: true, issues: [] };
  const prompt = `${RUBRIC}

QUESTION: ${question}

CALCULATED FACTS (ground truth):
${JSON.stringify(payload)}

READING:
${reading}

Return only the JSON verdict.`;
  const out = await geminiGenerate(prompt, { json: true, temperature: 0.1, timeoutMs: 18000 });
  if (!out) return { pass: true, issues: [] };
  try {
    const v = JSON.parse(out);
    const issues = Array.isArray(v.issues)
      ? v.issues.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 8)
      : [];
    return { pass: Boolean(v.pass) && issues.length === 0, issues };
  } catch {
    return { pass: true, issues: [] };
  }
}
