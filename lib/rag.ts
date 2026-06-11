// RAG retrieval (Stage 11.1) — self-contained file vector store.
// At query time: embed the query with Voyage, cosine-scan the bundled
// rag/embeddings.json (710 vectors → sub-millisecond), inject the top hits as
// classical grounding. No database. Graceful no-op if the key/file are absent.

import fs from "node:fs";
import path from "node:path";
import { readEnv } from "./env";

const MODEL = "voyage-3.5-lite";

type Rec = { id: string; source: string; title: string; location: string; content: string; embedding: number[] };
let cache: Rec[] | null = null;

function loadStore(): Rec[] {
  if (cache) return cache;
  const candidates = [
    path.join(process.cwd(), "rag", "embeddings.json"),
    path.join(process.cwd(), "..", "rag", "embeddings.json"),
    path.join(__dirname, "..", "rag", "embeddings.json"),
  ];
  for (const p of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      cache = data.records || [];
      return cache!;
    } catch {}
  }
  cache = [];
  return cache;
}

export function ragConfigured(): boolean {
  return Boolean(readEnv("VOYAGE_API_KEY")) && loadStore().length > 0;
}

// diagnostic (used by /api/rag-test only) — reports store size + whether the
// query embedding succeeded, WITHOUT exposing any key material.
export function _debugStoreSize(): number {
  return loadStore().length;
}
export async function _debugEmbedOk(q: string): Promise<boolean> {
  return Boolean(await embedQuery(q));
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

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function retrieveClassical(
  query: string,
  k = 4,
  minSim = 0.35
): Promise<{ source: string; title: string; location: string; content: string; similarity: number }[]> {
  const store = loadStore();
  if (!store.length) return [];
  const q = await embedQuery(query);
  if (!q) return [];
  const scored = store
    .map((r) => ({ ...r, similarity: cosine(q, r.embedding) }))
    .filter((r) => r.similarity >= minSim)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
  return scored.map(({ source, title, location, content, similarity }) => ({
    source, title, location, content, similarity,
  }));
}

/** Format retrieved passages as a silent grounding block for the AI. */
export async function classicalGrounding(query: string, k = 4): Promise<string> {
  const hits = await retrieveClassical(query, k);
  if (!hits.length) return "";
  const blocks = hits
    .map((h, i) => `[${i + 1}] (${h.title}, ${h.location})\n${h.content.slice(0, 1200)}`)
    .join("\n\n");
  return `
--- CLASSICAL GROUNDING (retrieved from the source texts — reason FROM these
rules; they are the authority behind your interpretation. Translate to plain
language; never quote or name the texts to the user. Rule 1 still holds.) ---
${blocks}
---
`;
}
