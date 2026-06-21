// Minimal server-side Gemini client — the "critic" in the inline verification loop.
// A DIFFERENT model from the producer (Claude) on purpose: a same-architecture
// reviewer shares the producer's blind spots, a different one catches what the
// producer's self-review can't. Key + model come from .env.local / Vercel env.

import { readEnv } from "./env";

export function geminiConfigured(): boolean {
  const k = readEnv("GEMINI_API_KEY");
  return Boolean(k && k.length > 10 && !k.includes("your-key"));
}

/**
 * One-shot Gemini generateContent call. Returns the text, or null on any failure
 * (missing key, network, timeout, bad response) — callers treat null as "critic
 * unavailable" and never block the user on it.
 */
export async function geminiGenerate(
  prompt: string,
  opts?: { json?: boolean; temperature?: number; timeoutMs?: number }
): Promise<string | null> {
  const key = readEnv("GEMINI_API_KEY");
  if (!key) return null;
  const model = readEnv("GEMINI_MODEL") || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.2,
          ...(opts?.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    return parts.map((p: any) => p?.text ?? "").join("") || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
