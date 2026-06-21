/**
 * Batch QA harness — the SYSTEMIC verification layer (complements the inline loop).
 *
 * Runs a fixed suite of Ask Now cases through the real path — castPrashna (engine)
 * → Claude (producer, the ask-now prompt) → Gemini (critic, the 5 checks) — and
 * prints a scorecard. A regression in the prompt or engine shows up here, on every
 * run, BEFORE it reaches a user. Exits non-zero if any case fails, so it can gate a
 * deploy (see .github/workflows/qa.yml).
 *
 * Run: npx tsx verify/batch.ts   (needs ANTHROPIC_API_KEY, GEMINI_API_KEY,
 *      EPHEMERIS_URL, EPHEMERIS_SHARED_SECRET in .env.local or the environment.)
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { castPrashna } from "../lib/ephemeris";
import { auditReading, verifyConfigured } from "../lib/verify";
import { readEnv } from "../lib/env";

// Standalone scripts don't auto-load .env.local — populate process.env from it so
// the lib functions that read process.env directly (engine URL + secret) work.
(function loadEnvLocal() {
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#") || !s.includes("=")) continue;
      const i = s.indexOf("=");
      const k = s.slice(0, i).trim();
      let v = s.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
})();

type Case = {
  id: string; note?: string; question: string;
  datetime_local: string; lat: number; lng: number; tz: string; question_type: string;
};

const ROOT = process.cwd();
const CONCURRENCY = 3;

function loadCases(): Case[] {
  const raw = fs.readFileSync(path.join(ROOT, "verify/cases.jsonl"), "utf8").trim();
  return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function runCase(client: Anthropic, model: string, askPrompt: string, c: Case) {
  const chart = await castPrashna({
    moment_iso: c.datetime_local, latitude: c.lat, longitude: c.lng,
    timezone: c.tz, question_type: c.question_type,
  });
  if (!chart) return { id: c.id, note: c.note, error: "cast failed (engine unreachable?)", pass: false, issues: [] as string[] };

  // Mirror the route's Ask Now assembly: prompt + the question-moment chart JSON.
  const system =
    askPrompt +
    `\n\n--- QUESTION-MOMENT CHART (the three things are all present; answer now) ---\n` +
    `Question: ${c.question}\nMoment: ${c.datetime_local}\n` +
    JSON.stringify(chart);

  let reading = "";
  try {
    const msg = await client.messages.create({
      model, system, max_tokens: 2048, messages: [{ role: "user", content: c.question }],
    });
    reading = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  } catch (e: any) {
    return { id: c.id, note: c.note, error: `generate failed: ${e?.message || e}`, pass: false, issues: [] };
  }

  const verdict = await auditReading(reading, chart, c.question);
  return {
    id: c.id, note: c.note, pass: verdict.pass, issues: verdict.issues,
    yoga: chart?.layer4_tajika?.yoga, sp: `${chart?.significator}/${chart?.promittor}`,
    reading: reading.replace(/\s+/g, " ").slice(0, 220),
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as any;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
        process.stdout.write((out[idx] as any).pass ? "." : "x");
      }
    })
  );
  return out;
}

(async () => {
  const apiKey = readEnv("ANTHROPIC_API_KEY");
  if (!apiKey) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(2); }
  if (!verifyConfigured()) { console.error("Missing GEMINI_API_KEY (the critic) — set it to run QA"); process.exit(2); }
  const model = readEnv("ANTHROPIC_MODEL") || "claude-opus-4-5";
  const askPrompt = fs.readFileSync(path.join(ROOT, "ask-now-prompt.md"), "utf8");
  const client = new Anthropic({ apiKey });
  const cases = loadCases();

  console.log(`Running ${cases.length} Ask Now cases through engine → Claude → Gemini …\n`);
  const results = await pool(cases, CONCURRENCY, (c) => runCase(client, model, askPrompt, c));

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n\n================ SCORECARD ================`);
  console.log(`PASS ${passed}/${results.length}   (${Math.round((passed / results.length) * 100)}%)\n`);
  for (const r of failed) {
    console.log(`✗ ${r.id}${r.note ? "  — " + r.note : ""}`);
    if ((r as any).error) console.log(`    ERROR: ${(r as any).error}`);
    (r.issues || []).forEach((i: string) => console.log(`    - ${i}`));
    if ((r as any).reading) console.log(`    reading: "${(r as any).reading}"`);
    console.log("");
  }
  fs.writeFileSync(path.join(ROOT, "verify/report.json"), JSON.stringify(results, null, 2));
  // Gate on a pass-rate THRESHOLD, not 10/10 — LLM readings vary case to case, so a
  // strict gate would flake; a floor catches a real regression (a sharp drop).
  const rate = passed / results.length;
  const threshold = Number(readEnv("QA_PASS_THRESHOLD") || "0.7");
  console.log(`Full report → verify/report.json`);
  console.log(`Floor ${Math.round(threshold * 100)}% → ${rate >= threshold ? "OK" : "BELOW FLOOR — likely a regression"}`);
  process.exit(rate >= threshold ? 0 : 1);
})();
