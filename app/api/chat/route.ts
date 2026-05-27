import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { fetchChart, chartToContext, EphemerisInput } from "@/lib/ephemeris";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant"; content: string };

let cachedPrompt: { mtime: number; text: string } | null = null;

function loadSystemPrompt(): string {
  const file = path.join(process.cwd(), "system-prompt.md");
  try {
    const stat = fs.statSync(file);
    if (cachedPrompt && cachedPrompt.mtime === stat.mtimeMs) {
      return cachedPrompt.text;
    }
    const text = fs.readFileSync(file, "utf8");
    cachedPrompt = { mtime: stat.mtimeMs, text };
    return text;
  } catch {
    return "You are the InnerZenith Advisor. Be warm, wise, grounded.";
  }
}

async function buildSystem(
  birth: EphemerisInput | null,
  userId: string | null
): Promise<string> {
  const base = loadSystemPrompt();

  // 1) If birth data was provided in this request, compute fresh chart.
  if (birth) {
    const chart = await fetchChart(birth);
    if (chart) {
      // Cache it to Supabase for future turns (best-effort, never blocks).
      if (userId) {
        const sb = getAdminSupabase();
        if (sb) {
          void sb
            .from("birth_charts")
            .upsert(
              {
                user_id: userId,
                birth_date: birth.birth_date,
                birth_time: birth.birth_time || null,
                birth_time_known: Boolean(birth.birth_time),
                birth_place: birth.birth_place,
                latitude: birth.latitude ?? null,
                longitude: birth.longitude ?? null,
                timezone: birth.timezone ?? null,
                chart_json: chart,
              },
              { onConflict: "user_id" }
            );
        }
      }
      return base + "\n\n" + chartToContext(chart);
    }
  }

  // 2) Otherwise try to load a previously saved chart from Supabase.
  if (userId) {
    const sb = getAdminSupabase();
    if (sb) {
      const { data } = await sb
        .from("birth_charts")
        .select("chart_json")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.chart_json) {
        return base + "\n\n" + chartToContext(data.chart_json);
      }
    }
  }

  // 3) No chart available — model reasons from raw conversation only.
  return base;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("your-key-here")) {
    return new Response(
      "Missing ANTHROPIC_API_KEY. Add it to .env.local and restart the server.",
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        messages?: Msg[];
        birth?: EphemerisInput | null;
        userId?: string | null;
      }
    | null;
  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response("messages array required", { status: 400 });
  }

  const system = await buildSystem(body.birth ?? null, body.userId ?? null);
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-5";

  const messages = body.messages.map((m, i) =>
    i === 0 && m.role === "user" && m.content === "__begin__"
      ? {
          role: "user" as const,
          content:
            "Begin the conversation. Greet the person briefly and warmly, then ask whether they know their exact birth time.",
        }
      : m
  );

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
            "the advisor can't reach its mind right now — the Anthropic API key in .env.local isn't valid. add a real key (from https://console.anthropic.com/settings/keys) and restart the server.";
        } else if (status === 429) {
          friendly =
            "the advisor is being rate-limited. wait a few seconds and try again.";
        } else if (status === 529 || status === 503) {
          friendly =
            "Anthropic is briefly overloaded. try again in a moment.";
        } else {
          const raw =
            e?.error?.error?.message ||
            e?.error?.message ||
            e?.message ||
            "something went quiet upstream.";
          friendly = raw;
        }
        controller.enqueue(encoder.encode(`\n\n[advisor paused — ${friendly}]`));
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
