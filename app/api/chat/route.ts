import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fetchChart, chartToContext, categoryContext, timeDrilldown, EphemerisInput, castPrashna, fetchToday, buildSurpriseContext } from "@/lib/ephemeris";
import { readEnv } from "@/lib/env";
import { classicalGrounding } from "@/lib/rag";
import { parseAskNow, missingPrompt } from "@/lib/asknow";
import { languageByCode } from "@/lib/languages";
import { auditReading, verifyConfigured } from "@/lib/verify";

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

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
  language?: string | null;
};

// Memoise the question-moment cast: the chart is deterministic for a fixed moment,
// so a follow-up in the same Ask Now session reuses the identical payload instead
// of recomputing it. Bounded; warm-instance only — correctness comes from the
// frozen inputs (below), this is purely a compute saving.
const _prashnaMemo = new Map<string, any>();
async function castPrashnaMemo(args: {
  moment_iso: string; latitude: number; longitude: number; timezone: string; question_type: string;
}) {
  const key = `${args.moment_iso}|${args.latitude.toFixed(4)}|${args.longitude.toFixed(4)}|${args.question_type}`;
  if (_prashnaMemo.has(key)) return _prashnaMemo.get(key);
  const chart = await castPrashna(args);
  if (chart) {
    if (_prashnaMemo.size > 200) _prashnaMemo.clear();
    _prashnaMemo.set(key, chart);
  }
  return chart;
}

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
// Topic focus. NOT a checklist to walk through — a lens. Lead with the loudest
// signal for this topic from the profile context; go deep on the 2-4 strongest
// threads, never a survey of every sub-theme.
const CATEGORY_SLICE: Record<string, string> = {
  career:
    "Topic: Career & Purpose. Lead with the loudest career signal in the context (the strongest pattern, the active period's bearing on work). The threads available — leadership style, the work they're built for, money-as-expression, business vs employment, what drains them, timing — are a menu to SELECT the 2-3 loudest from, not a list to cover.",
  relationships:
    "Topic: Relationships. Lead with the loudest relational signal (their core pattern in love, what they actually attract). Threads available — romantic pattern, what attracts vs what to avoid, the repeating dynamic, family role, healthy love for them specifically — are a menu; pick the 2-3 sharpest, go deep, skip the rest.",
  property:
    "Topic: Property & Stability. Lead with the loudest signal on home, security, and rootedness. Timing for property decisions (use real dates) and the environments they thrive in are the strongest threads to select from.",
  health:
    "Topic: Health. Lead with the loudest constitutional signal (core strength or vulnerability, the energy cycle they're in now). Select the 2-3 sharpest threads. ALWAYS end with a reminder to consult a medical professional.",
  money:
    "Topic: Money & Abundance. Lead with the loudest wealth signal (how they earn, what blocks or unlocks abundance, when it flows — use real dates). Go deep on the 2-3 strongest, not every angle.",
  purpose:
    "Topic: Life Purpose. Lead with the loudest soul-theme (what they're here to master, the central tension between what they want and what they're built for). Two or three deep threads, not a survey.",
  surprise:
    "Topic: Surprise Me. Open with the single most striking, useful observation about this person's current season — grounded in their active periods and cycles. One arresting insight, not a broad survey.",
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
        mode?: "natal" | "asknow" | "surprise";
        category?: string;
        returning?: boolean;
        profile?: ProfileLite | null;
        chartProfile?: any | null;
        birth?: EphemerisInput | null;
        language?: string | null;
        // Frozen Ask Now inputs from a prior turn (see X-AskNow-Resolved) — when
        // present, the moment/question is reused verbatim instead of re-extracted.
        askNow?: {
          datetime_local?: string;
          city?: { name: string; latitude: number; longitude: number; timezone: string };
          question?: string;
          questionType?: string;
        } | null;
      }
    | null;
  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response("messages array required", { status: 400 });
  }

  const mode =
    body.mode === "asknow" ? "asknow" : body.mode === "surprise" ? "surprise" : "natal";

  // Resolved Ask Now inputs to echo back so the client can FREEZE them (set below).
  let askNowResolved:
    | { datetime_local: string; city: any; question: string; questionType: string }
    | null = null;
  // The calculated Prashna payload + question — the ground truth the inline critic
  // (Gemini) audits the reading against before it streams. Set in the asknow branch.
  let verifyChart: any = null;
  let verifyQuestion = "";

  // Base prompt by mode (Surprise Me uses the natal brain + a special directive).
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

  if (mode === "surprise") {
    // Surprise Me — two-layer reading from the stored chart + today's sky.
    if (body.chartProfile) {
      system += "\n\n" + chartToContext(body.chartProfile, body.profile?.current_city);
      // Pass the user's location so today's snapshot includes the Hora lord.
      const today = await fetchToday({
        lat: body.profile?.birth_lat, lon: body.profile?.birth_lng, tz: body.profile?.birth_timezone,
      });
      system += "\n\n" + buildSurpriseContext(
        body.chartProfile,
        body.profile?.birth_date ?? null,
        Boolean(body.profile?.birth_time_known),
        today
      );
    }
  } else if (mode === "asknow") {
    // Stage 8.3 — the three things (question + moment + city). FREEZE them once:
    // if the client sends a resolved `askNow` (from a prior turn's X-AskNow-Resolved
    // header), reuse it verbatim so a follow-up message can't re-extract a different
    // moment/question and shift the chart. Otherwise extract now via chrono+geocode.
    let resolved: { datetime_local: string; city: any; question: string; questionType: string } | null = null;
    const frozen = body.askNow;
    if (frozen?.datetime_local && frozen?.city && typeof frozen.city.latitude === "number") {
      resolved = {
        datetime_local: frozen.datetime_local,
        city: frozen.city,
        question: frozen.question ?? "",
        questionType: frozen.questionType ?? "general",
      };
    } else {
      const userTexts = body.messages
        .filter((m) => m.role === "user" && !m.content.startsWith("__"))
        .map((m) => m.content);
      const state = await parseAskNow(userTexts);
      if (state.missing.length > 0) {
        // Still collecting → return a FIXED prompt for the missing piece. No LLM.
        return new Response(missingPrompt(state), { headers: TEXT_HEADERS });
      }
      resolved = {
        datetime_local: state.datetime_local!,
        city: state.city!,
        question: state.question ?? "",
        questionType: state.questionType,
      };
    }

    // Cast the question-moment chart (memoised — deterministic for a fixed moment).
    const geo = resolved.city;
    const chart = await castPrashnaMemo({
      moment_iso: resolved.datetime_local,
      latitude: geo.latitude,
      longitude: geo.longitude,
      timezone: geo.timezone,
      question_type: resolved.questionType,
    });
    if (chart) {
      askNowResolved = resolved; // echo back so the client freezes it for follow-ups
      verifyChart = chart; // ground truth for the inline critic
      verifyQuestion = resolved.question;
      system +=
        "\n\n--- QUESTION-MOMENT CHART (the three things are all present; answer now) ---\n" +
        `Question: ${resolved.question}\nMoment: ${resolved.datetime_local} in ${geo.name}\n` +
        JSON.stringify(chart);
      if (body.chartProfile) {
        system +=
          "\n\n--- NATAL CONTEXT (silent second layer — NEVER announce it, NEVER say you do or don't have birth details; just let it deepen the answer) ---\n" +
          chartToContext(body.chartProfile);
      }
    } else {
      return new Response(
        "I couldn't read that moment just now — try sending the question, the exact time, and the city once more.",
        { headers: TEXT_HEADERS }
      );
    }
  } else if (body.chartProfile) {
    // Natal — chart computed once at onboarding and stored client-side.
    system += "\n\n" + chartToContext(body.chartProfile, body.profile?.current_city);
    // Today's slow-planet transits for this topic's houses (best-effort; a cold
    // engine just skips them rather than holding up the reading).
    const todayTransits = await fetchToday(undefined, 10000);
    // Topic-specific chart geometry (spec 7.5 category slice), in plain language.
    system += categoryContext(body.chartProfile, body.category, todayTransits);
    // Dynamic time-drilldown: if the conversation mentions a year, append it.
    const convoText = body.messages.map((m) => m.content).join(" ");
    system += timeDrilldown(body.chartProfile, convoText);
  } else if (body.birth && body.birth.birth_date) {
    try {
      const chart = await fetchChart(body.birth);
      if (chart) system += "\n\n" + chartToContext(chart, body.profile?.current_city);
    } catch {}
  }

  // Classical grounding (Stage 11.1 RAG) — retrieve relevant passages from the
  // source texts and inject them as the authority behind the interpretation.
  // No-op until VOYAGE_API_KEY + Supabase pgvector are configured.
  try {
    const lastUser = [...body.messages].reverse().find(
      (m) => m.role === "user" && !m.content.startsWith("__")
    );
    const topicHint = body.category ? `${body.category} ` : "";
    // Spec 11.1: the RAG query is driven by the chart's Cached AI Keys (the
    // mathematically-derived geometry strings), NOT the user's raw conversational
    // text. Lead with the named patterns / temperament / active period; append a
    // short tail of the user's words only to keep follow-ups on-topic.
    const ckq = body.chartProfile?.cache_keys || {};
    const chartTerms = [
      ...(Array.isArray(ckq.vedic_yoga_strings) ? ckq.vedic_yoga_strings : []),
      ...(Array.isArray(ckq.bazi_interaction_map) ? ckq.bazi_interaction_map : []),
      ckq.core_temperament_style,
      ckq.active_period_snapshot?.vedic_dasha,
    ].filter(Boolean).join(" ");
    const userTail = (lastUser?.content || "").slice(0, 160);
    const q = (topicHint + chartTerms + " " + userTail).trim();
    if (q.length > 3) {
      const grounding = await classicalGrounding(q, 4);
      if (grounding) system += grounding;
    }
  } catch {}

  // Localisation — write the ENTIRE reading in the user's language. Claude
  // generates natively (higher quality than translating after); every other
  // rule (no jargon, plain, warm, same depth) still holds. Internal context
  // above stays English; only the user-facing output changes.
  const lang = body.language || body.profile?.language || null;
  if (lang) {
    const L = languageByCode(lang);
    const base = lang.split("-")[0].toLowerCase();
    if (L && base !== "en") {
      system +=
        `\n\n--- LANGUAGE (ABSOLUTE) ---\nWrite your ENTIRE response to the user in ${L.native} (${L.name}). ` +
        `Use natural, native phrasing a fluent ${L.name} speaker would use — never a stiff literal translation. ` +
        `Every other rule still applies exactly: no astrological jargon, plain and warm, same depth and structure. Only the language changes.`;
    }
  }

  // Opening-turn rewriting: replace sentinels with the right instruction.
  const messages = body.messages.map((m, i) => {
    if (i !== 0 || m.role !== "user") return m;
    if (m.content === "__begin_first__") {
      return {
        role: "user" as const,
        content:
          "This is the user's FIRST time on this topic. Follow FIRST TIME ON A TOPIC (11.3) — THE FOUR DOTS exactly. Use the four named movements (The picture so far / Where your dots sit now / The line forming / Your next dot) as plain-text labels. LEAD WITH THE LOUDEST SIGNAL from the chart context above — open on the single strongest, most specific thing about this person for this topic, then the 2-3 next-loudest threads only. This is a tight, chart-grounded portrait (~350-500 words), NOT a survey of every dimension. Obey the ONE-PASS RULE: each theme appears exactly once, never restated later. End with the exact blueprint transition sentence.",
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
    if (m.content === "__begin_surprise__") {
      return {
        role: "user" as const,
        content:
          "Generate today's Surprise Me reading from the two-layer context provided. One continuous flowing response — dominant situation that narrows into today. No labels, no headings, no technical terms.",
      };
    }
    return m;
  });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  // Inline verification runs only for Ask Now (the high-stakes question-moment
  // reading) when a chart + a critic are present. Capped revisions bound latency.
  const verifyOn = mode === "asknow" && Boolean(verifyChart) && verifyConfigured();
  const maxRevisions = Math.max(0, Number(readEnv("VERIFY_MAX_REVISIONS") || "1"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (verifyOn) {
          // PRODUCE → AUDIT (diverse AI) → REVISE, then stream the approved reading.
          const generate = async (extra: string): Promise<string> => {
            const msg = await client.messages.create({
              model, system: system + extra, max_tokens: 4096, messages,
            });
            return msg.content
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text)
              .join("");
          };
          let reading = await generate("");
          let verdict = await auditReading(reading, verifyChart, verifyQuestion);
          let revs = 0;
          while (!verdict.pass && verdict.issues.length && revs < maxRevisions) {
            revs++;
            const fb =
              "\n\n--- REVISION REQUIRED — an independent reviewer checked your draft against the calculated chart and found these problems. Fix EVERY one; keep everything else intact. NEVER mention this review or that the answer was revised. ---\n" +
              verdict.issues.map((x, i) => `${i + 1}. ${x}`).join("\n");
            reading = await generate(fb);
            verdict = await auditReading(reading, verifyChart, verifyQuestion);
          }
          // Observability (Vercel logs): did the loop converge, and after how many?
          console.log(`[verify] asknow revisions=${revs} pass=${verdict.pass} issues=${verdict.issues.length}`);
          // Stream the approved reading in small chunks for a live feel.
          for (let i = 0; i < reading.length; i += 64) {
            controller.enqueue(encoder.encode(reading.slice(i, i + 64)));
          }
          controller.close();
          return;
        }

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
      // Echo the resolved Ask Now inputs so the client can freeze them and reuse
      // the exact same moment/question on follow-up turns. URI-encoded JSON.
      ...(askNowResolved
        ? { "X-AskNow-Resolved": encodeURIComponent(JSON.stringify(askNowResolved)) }
        : {}),
    },
  });
}
