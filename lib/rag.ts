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

// Verified knowledge cards — dotit's own curated, cross-checked layer (curator
// agent output). Retrieved ABOVE the classical passages as the most reliable
// grounding. Empty until the curator publishes (rag/knowledge.json).
type Card = { id: string; topic: string; category?: string; interpretation: string; confidence?: number; embedding: number[] };
let knowledgeCache: Card[] | null = null;

function loadFile(name: string): any[] {
  const candidates = [
    path.join(process.cwd(), "rag", name),
    path.join(process.cwd(), "..", "rag", name),
    path.join(__dirname, "..", "rag", name),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")).records || [];
    } catch {}
  }
  return [];
}

function loadStore(): Rec[] {
  if (!cache) cache = loadFile("embeddings.json") as Rec[];
  return cache;
}

function loadKnowledge(): Card[] {
  if (!knowledgeCache) knowledgeCache = loadFile("knowledge.json") as Card[];
  return knowledgeCache;
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

/** Retrieve the top verified knowledge cards for a query. */
export async function retrieveVerified(
  query: string,
  k = 3,
  minSim = 0.35
): Promise<{ topic: string; interpretation: string; confidence?: number; similarity: number }[]> {
  const store = loadKnowledge();
  if (!store.length) return [];
  const q = await embedQuery(query);
  if (!q) return [];
  return store
    .map((c) => ({ ...c, similarity: cosine(q, c.embedding) }))
    .filter((c) => c.similarity >= minSim)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
    .map(({ topic, interpretation, confidence, similarity }) => ({ topic, interpretation, confidence, similarity }));
}

/**
 * Format retrieved grounding for the AI: verified knowledge cards FIRST (the
 * curator's cross-checked layer — most reliable), then the raw classical
 * passages. Embeds the query once and scores both stores.
 */
export async function classicalGrounding(query: string, k = 4): Promise<string> {
  const q = await embedQuery(query);
  if (!q) return "";

  const cards = loadKnowledge();
  const verified = cards
    .map((c) => ({ c, s: cosine(q, c.embedding) }))
    .filter((x) => x.s >= 0.35)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  const passages = loadStore()
    .map((r) => ({ r, s: cosine(q, r.embedding) }))
    .filter((x) => x.s >= 0.35)
    .sort((a, b) => b.s - a.s)
    .slice(0, k);

  if (!verified.length && !passages.length) return "";

  let out = "\n";
  if (verified.length) {
    const blocks = verified
      .map((x, i) => `[V${i + 1}] (${x.c.topic})\n${x.c.interpretation}`)
      .join("\n\n");
    out += `--- VERIFIED KNOWLEDGE (dotit's own curated knowledge base — each item has
been cross-checked against the classical source texts, and corroborated across
expert models where available. These are the MOST reliable; lean on them first.
Translate to plain language; never name sources. Rule 1 still holds.) ---
${blocks}
---
`;
  }
  if (passages.length) {
    const blocks = passages
      .map((x, i) => `[${i + 1}] (${x.r.title}, ${x.r.location})\n${x.r.content.slice(0, 1200)}`)
      .join("\n\n");
    out += `--- CLASSICAL GROUNDING (retrieved from the source texts — reason FROM these
rules; they are the authority behind your interpretation. Translate to plain
language; never quote or name the texts to the user. Rule 1 still holds.) ---
${blocks}
---
`;
  }
  return out;
}
