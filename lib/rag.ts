// RAG retrieval (Stage 11.1) — embed the query with Voyage, fetch the most
// relevant classical-text passages from Supabase pgvector, and format them as
// grounding for the AI. Graceful no-op if VOYAGE_API_KEY / Supabase aren't set.

import { readEnv } from "./env";

const MODEL = "voyage-3.5-lite";

export function ragConfigured(): boolean {
  return Boolean(
    readEnv("VOYAGE_API_KEY") &&
      readEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      readEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

async function embedQuery(text: string): Promise<number[] | null> {
  const key = readEnv("VOYAGE_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: [text.slice(0, 8000)], model: MODEL, input_type: "query" }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/** Retrieve top-K classical passages relevant to `query`. */
export async function retrieveClassical(query: string, k = 4): Promise<
  { source: string; title: string; location: string; content: string; similarity: number }[]
> {
  if (!ragConfigured()) return [];
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const embedding = await embedQuery(query);
  if (!embedding) return [];
  try {
    const res = await fetch(`${url}/rest/v1/rpc/match_knowledge`, {
      method: "POST",
      headers: {
        apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      },
      body: JSON.stringify({ query_embedding: embedding, match_count: k, min_similarity: 0.35 }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** Format retrieved passages as a silent grounding block for the AI. */
export async function classicalGrounding(query: string, k = 4): Promise<string> {
  const hits = await retrieveClassical(query, k);
  if (!hits.length) return "";
  const blocks = hits
    .map(
      (h, i) =>
        `[${i + 1}] (${h.title}, ${h.location})\n${h.content.slice(0, 1200)}`
    )
    .join("\n\n");
  return `
--- CLASSICAL GROUNDING (retrieved from the source texts — reason FROM these
rules; they are the authority behind your interpretation. Translate to plain
language; never quote or name the texts to the user. Rule 1 still holds.) ---
${blocks}
---
`;
}
