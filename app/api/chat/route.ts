import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fetchChart, chartToContext, EphemerisInput, geocodeCity, castPrashna } from "@/lib/ephemeris";
import { readEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant"; content: string };

type ProfileLite = {
  full_name?: string | null;
  gender?: "M" | "F" | null;
  birth_date?: string | null;
  birth_time_local?: string | null;
  birth_time_known?: boolean;
  birth_time_approximate?: boolean;
  birth_city?: string | null;
  birth_lat?: number | null;
  birth_lng?: number | null;
  birth_timezone?: string | null;
  current_city?: string | null;
  profile_fidelity?: "FULL_METRIC" | "HIGH_PARTIAL" | "MACRO_ONLY";
};

const promptCache: Record<string, { mtime: number; text: string }> = {};

function loadPrompt(file: string, fallback: string): string {
  // Try several locations — process.cwd() on Vercel, and paths relative to
  // this module — so the prompt loads whether or not the bundler co-locates it.
  const candidates = [
    path.join(process.cwd(), file),
    path.join(process.cwd(), "..", file),
    path.join(__dirname, file),
    path.join(__dirname, "..", "..", "..", file),
  ];
  for (const full of candidates) {
    try {
      const stat = fs.statSync(full);
      const c = promptCache[full];
      if (c && c.mtime === stat.mtimeMs) return c.text;
      const text = fs.readFileSync(full, "utf8");
      promptCache[full] = { mtime: stat.mtimeMs, text };
      return text;
    } catch {
      // try next candidate
    }
  }
  return fallback;
}

// Stage 7.5 — token-efficient context slice per category.
const CATEGORY_SLICE: Record<string, string> = {
  career:
    "Focus: Career & Purpose. Draw on work, vocation, leadership, money-as-expression, business vs employment, timing, what drains them, the work they were built for.",
  relationships:
    "Focus: Relationships. Draw on romantic patterns, friendships, family role, what they seek, what attracts them, what to avoid, repeating patterns, blind spots, healthy love for them specifically.",
  property:
    "Focus: Property & Stability. Draw on home, security, timing for property decisions, environments they thrive in, geographical influences.",
  health:
    "Focus: Health. Draw on constitutional strengths and vulnerabilities, energy cycles, stress responses, what the body needs now. ALWAYS end with a reminder to consult a medical professional.",
  money:
    "Focus: Money & Abundance. Draw on earning patterns, relationship with wealth, what blocks abundance, when it flows naturally.",
  purpose:
    "Focus: Life Purpose. Draw on recurring soul themes, what they are here to master, the tension between what they want and what they are built for.",
  surprise:
    "Focus: Surprise Me. Open with the single most striking, useful observation about this person's current season — grounded in their active periods and cycles. One arresting insight, not a broad survey.",
};

function profileContext(p: ProfileLite | null | undefined): string {
  if (!p) return "";
  const lines: string[] = [];
  if (p.full_name) lines.push(`Name: ${p.full_name}`);
  if (p.gender) lines.push(`Gender: ${p.gender === "M" ? "man" : "woman"}`);
  if (p.birth_date) lines.push(`Born: ${p.birth_date}${p.birth_time_local ? " " + p.birth_time_local : ""}${p.birth_time_approximate ? " (approx)" : ""}`);
  if (p.birth_city) lines.push(`Birth place: ${p.birth_city}`);
  if (p.current_city) lines.push(`Currently in: ${p.current_city}`);
  if (p.profile_fidelity) lines.push(`profile_fidelity: ${p.profile_fidelity}`);
  if (!lines.length) return "";
  return `\n\n--- USER FACTS (never read birth data aloud; never name techniques) ---\n${lines.join("\n")}\n`;
}

// Stage 8.3 — pull {question, datetime, city} out of the Ask Now conversation.
async function extractAskNow(
  messages: Msg[],
  apiKey: string,
  model: string
): Promise<{
  question: string | null;
  datetime_local: string | null;
  city: string | null;
  question_type: string | null;
}> {
  const convo = messages
    .filter((m) => !m.content.startsWith("__"))
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const client = new Anthropic({ apiKey });
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 300,
      system:
        "Extract Prashna details from the conversation. Return ONLY a JSON object, no prose. " +
        "Fields: question (the one specific question, or null), datetime_local " +
        "(the moment the question arrived in the user's mind, as 'YYYY-MM-DDTHH:MM' in 24h, or null if not clearly stated), " +
        "city (the city the user was in at that moment, or null), question_type. " +
        "question_type MUST be exactly one of: job, money, gains, relationship, marriage, property, " +
        "health, body, travel, legal, lost_object, missing_child, missing_sibling, missing_spouse, " +
        "missing_person, communication, purpose, general. Use 'general' for ambiguous/unclassifiable questions. " +
        "Only fill a field if the user actually provided it. Do not invent a date/time — 'now' or vague terms are null.",
      messages: [{ role: "user", content: convo || "(no messages yet)" }],
    });
    const text = resp.content
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      question: json.question || null,
      datetime_local: json.datetime_local || null,
      city: json.city || null,
      question_type: json.question_type || "general",
    };
  } catch {
    return { question: null, datetime_local: null, city: null, question_type: "general" };
  }
}

export async function POST(req: NextRequest) {
  const apiKey = readEnv("ANTHROPIC_API_KEY");
  const model = readEnv("ANTHROPIC_MODEL") || "claude-opus-4-5";
  if (!apiKey || apiKey.includes("your-key-here")) {
    return new Response(
      "Missing ANTHROPIC_API_KEY. Add it to .env.local and restart the server.",
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        messages?: Msg[];
        mode?: "natal" | "asknow";
        category?: string;
        returning?: boolean;
        profile?: ProfileLite | null;
        chartProfile?: any | null;
        birth?: EphemerisInput | null;
      }
    | null;
  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response("messages array required", { status: 400 });
  }

  const mode = body.mode === "asknow" ? "asknow" : "natal";

  // Base prompt by mode.
  let system =
    mode === "asknow"
      ? loadPrompt("ask-now-prompt.md", "You are DotIt answering one specific question from the moment it was asked. Be direct, warm, plain.")
      : loadPrompt("system-prompt.md", "You are DotIt — a warm, grounded life guide. Never name any system or technique.");

  // Category slice (natal only).
  if (mode === "natal" && body.category && CATEGORY_SLICE[body.category]) {
    system += "\n\n--- TOPIC SLICE (Stage 7.5) ---\n" + CATEGORY_SLICE[body.category];
  }

  // Profile facts.
  system += profileContext(body.profile);

  if (mode === "asknow") {
    // Stage 8.3 — extract the three things from the conversation. If all
    // present, cast the question-moment chart and inject it. If not, the
    // ask-now prompt makes the model ask for only the missing piece.
    const extracted = await extractAskNow(body.messages, apiKey, model);
    if (extracted.question && extracted.datetime_local && extracted.city) {
      const geo = await geocodeCity(extracted.city);
      if (geo) {
        const chart = await castPrashna({
          moment_iso: extracted.datetime_local, // naive = stated local time
          latitude: geo.latitude,
          longitude: geo.longitude,
          timezone: geo.timezone,
          question_type: extracted.question_type || "general",
        });
        if (chart) {
          system +=
            "\n\n--- QUESTION-MOMENT CHART (the three things are all present; answer now) ---\n" +
            `Question: ${extracted.question}\nMoment: ${extracted.datetime_local} in ${geo.name}\n` +
            JSON.stringify(chart);
          // Natal chart, if stored, enters quietly as a SECOND layer (8.10).
          if (body.chartProfile) {
            system +=
              "\n\n--- NATAL CONTEXT (silent second layer — NEVER announce it, NEVER say you do or don't have birth details; just let it deepen the answer) ---\n" +
              chartToContext(body.chartProfile);
          }
        }
      }
    } else {
      const missing = [
        !extracted.question && "the specific question",
        !extracted.datetime_local && "the exact date and time it arrived in your mind",
        !extracted.city && "the city you were in at that moment",
      ].filter(Boolean);
      system +=
        "\n\n--- COLLECTION STATE ---\nStill missing: " + missing.join("; ") +
        ".\nAsk warmly for ONLY the missing piece(s) in one short line. Do not give a reading yet.";
    }
  } else if (body.chartProfile) {
    // Natal — chart computed once at onboarding and stored client-side.
    system += "\n\n" + chartToContext(body.chartProfile);
  } else if (body.birth && body.birth.birth_date) {
    try {
      const chart = await fetchChart(body.birth);
      if (chart) system += "\n\n" + chartToContext(chart);
    } catch {}
  }

  // Opening-turn rewriting: replace sentinels with the right instruction.
  const messages = body.messages.map((m, i) => {
    if (i !== 0 || m.role !== "user") return m;
    if (m.content === "__begin_first__") {
      return {
        role: "user" as const,
        content:
          "This is the user's FIRST time on this topic. Go broad and deep immediately per the first-time rule — cover every dimension of this topic in flowing prose, then end with the exact blueprint transition sentence.",
      };
    }
    if (m.content === "__begin_returning__") {
      return {
        role: "user" as const,
        content:
          "The user is RETURNING to this topic. Do not repeat the broad blueprint. Open with: 'Welcome back. What's on your mind today in this area?'",
      };
    }
    if (m.content === "__begin_asknow__") {
      return {
        role: "user" as const,
        content:
          "The user has submitted one specific question via Ask Now. Answer it directly from the question-moment chart provided. Give before you take.",
      };
    }
    return m;
  });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const streamResp = await client.messages.stream({
          model,
          system,
          max_tokens: 4096,
          messages,
        });
        for await (const event of streamResp) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (e: any) {
        const status = e?.status ?? e?.response?.status;
        let friendly: string;
        if (status === 401) {
          friendly =
            "I can't reach my mind right now — the Anthropic API key isn't valid. Check ANTHROPIC_API_KEY.";
        } else if (status === 429) {
          friendly = "I'm being rate-limited. Give me a few seconds and try again.";
        } else if (status === 529 || status === 503) {
          friendly = "The service is briefly overloaded. Try again in a moment.";
        } else {
          friendly =
            e?.error?.error?.message || e?.error?.message || e?.message || "Something went quiet.";
        }
        controller.enqueue(encoder.encode(`\n\n[paused — ${friendly}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
