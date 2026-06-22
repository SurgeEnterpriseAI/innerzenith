/**
 * Injection-completeness test — the layer the LLM critic STRUCTURALLY CANNOT cover.
 *
 * The inline/batch verification loop audits the READING against the PAYLOAD. It
 * catches what the AI says wrong (fabrication, contradiction, jargon). It is blind
 * to what the payload OMITS: if a spec-mandated field never reaches the AI, the
 * reading simply doesn't mention it — which is not a grounding violation, so the
 * critic passes it. That's exactly how the Career "generic" and Relationships
 * "no Darakaraka/UL" gaps slipped through.
 *
 * This is the complement: a DETERMINISTIC assertion that each category's injected
 * context (categoryContext, spec 7.5) actually contains the mandatory fields, by
 * their plain-language signatures. No LLM. A dropped injection fails here instantly.
 *
 * Run: npx tsx verify/injection.ts   (uses a committed chart fixture — no network.)
 */
import fs from "node:fs";
import path from "node:path";
import { categoryContext } from "../lib/ephemeris";

const chart = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "verify/fixtures/chart.json"), "utf8")
);

// The marker phrases each category's injection MUST contain — the plain-language
// signatures of the spec-7.5 mandatory fields. Their absence = an injection gap.
const REQUIRED: Record<string, { label: string; marker: RegExp }[]> = {
  career: [
    { label: "10th-lord drive + strength", marker: /what drives your work/i },
    { label: "topic yoga tied to career", marker: /defining pattern you were born with/i },
  ],
  relationships: [
    { label: "7th-lord drive", marker: /what drives your partnership/i },
    { label: "Darakaraka (spouse significator)", marker: /becomes a true partner/i },
    { label: "Upapada Lagna (marriage arudha)", marker: /committed, lasting bond/i },
    { label: "D9 Lagna lord (deeper texture)", marker: /deeper, underlying texture/i },
    { label: "topic yoga tied to relationships", marker: /defining pattern you were born with/i },
  ],
  money: [{ label: "wealth-house lord drive", marker: /what drives your money/i }],
  property: [{ label: "4th-house lord drive", marker: /what drives your home/i }],
  health: [{ label: "6th-house lord drive", marker: /what drives your health/i }],
  purpose: [
    { label: "9th-house lord drive", marker: /what drives your meaning/i },
    { label: "D9 Lagna lord (deeper texture)", marker: /deeper, underlying texture/i },
  ],
};

let fails = 0;
for (const [cat, reqs] of Object.entries(REQUIRED)) {
  const ctx = categoryContext(chart, cat, null) || "";
  for (const r of reqs) {
    const ok = r.marker.test(ctx);
    if (!ok) fails++;
    console.log(`  [${ok ? "OK  " : "MISS"}] ${cat.padEnd(14)} · ${r.label}`);
  }
}
console.log(
  fails
    ? `\n✗ ${fails} mandatory field(s) MISSING from the category injection (spec 7.5)`
    : `\n✓ All mandatory category fields present in the injection`
);
process.exit(fails ? 1 : 0);
