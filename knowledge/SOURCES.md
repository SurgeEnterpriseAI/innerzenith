# dotit — Classical Knowledge Base (Stage 11.1 RAG)

Every reading is grounded in a curated library of classical texts via a vector
RAG pipeline. At query time the relevant passages are retrieved and injected as
the authority behind the interpretation — the AI translates them to plain
language and never names or quotes them to the user.

## Pipeline (no database — self-contained file vector store)

```
rag/sources.json     — the canonical source list
rag/ingest.py        — download → extract text → chunk → rag/chunks.jsonl
rag/embed_local.py   — embed chunks (Voyage voyage-3.5-lite, 1024-dim) →
                       rag/embeddings.json (committed, bundled into the app)
lib/rag.ts           — query-time: embed query (Voyage) → in-process cosine
                       scan of embeddings.json → top-K
app/api/chat/route.ts— injects retrieved passages as "Classical Grounding"
```

Embeddings: **Voyage AI** (Anthropic's recommended partner, free tier).
Vector store: **a bundled JSON file** + in-process cosine scan. With only ~710
passages this is sub-millisecond and needs no DB — chosen after the Supabase
free tier was exhausted. (The Supabase-pgvector path — `rag/pgvector_schema.sql`
+ `rag/embed_upsert.py` — is kept as an alternative if the corpus ever grows
large enough to need a real vector DB.)

## Sources

| Text | Tradition | Ingest |
|------|-----------|--------|
| **Brihat Parashara Hora Shastra (English, Santhanam)** | Vedic | ✅ text (239 chunks) — the foundational text |
| **Three Hundred Important Combinations — B.V. Raman** | Vedic | ✅ text (57 chunks) — the yoga reference |
| Integrated Vedic Astrology Vol 1 — P.V.R. Narasimha Rao | Vedic | ✅ text (163 chunks) |
| Integrated Vedic Astrology Vol 2 — P.V.R. Narasimha Rao | Vedic | ✅ text (123 chunks) |
| Light on Life — Svoboda & de Fouw | Vedic | ✅ text (306 chunks) |
| Uttara Kaalaamruta of Kaalidaasa (Hindi) | Vedic | ✅ text (118 chunks) |
| Saravali of Kalyana Varma | Vedic | ⏳ archive access-restricted — alt source needed |
| Jataka Parijata | Vedic | ⏳ OCR garbled (Devanagari) — needs clean source |
| IGNCA 6945 / Jyotisha zip | Vedic | ⏳ scanned — OCR pass later |

Corpus: **1,006 passages** from 6 text sources (BPHS English + 300 Combinations
added via the foundational-text hunt; archive.org auto-OCR `_djvu.txt` used for
300 Combinations). The remaining scanned/Devanagari texts need a clean source or
an OCR pass — tracked as a follow-up. `rag/ingest_extra.py` appends the two
gold-standard texts.

## Activating retrieval (one-time)

1. Create a free Voyage AI account → API key (https://voyageai.com).
2. Put `VOYAGE_API_KEY` in `.env.local`, then `python rag/embed_local.py`
   (one-time — embeds all chunks into `rag/embeddings.json`, committed).
3. Add `VOYAGE_API_KEY` to Vercel env vars → redeploy. Retrieval goes live.

No database, no SQL, no Supabase. The embeddings file ships with the app.
