# dotit — Classical Knowledge Base (Stage 11.1 RAG)

Every reading is grounded in a curated library of classical texts via a vector
RAG pipeline. At query time the relevant passages are retrieved and injected as
the authority behind the interpretation — the AI translates them to plain
language and never names or quotes them to the user.

## Pipeline

```
rag/sources.json     — the canonical source list
rag/ingest.py        — download → extract text → chunk → rag/chunks.jsonl
rag/pgvector_schema.sql — Supabase: vector ext + knowledge_chunks + match RPC
rag/embed_upsert.py  — embed chunks (Voyage voyage-3.5-lite, 1024-dim) → Supabase
lib/rag.ts           — query-time: embed query (Voyage) → match_knowledge RPC
app/api/chat/route.ts— injects retrieved passages as "Classical Grounding"
```

Embeddings: **Voyage AI** (Anthropic's recommended partner, free tier covers
this corpus). Vector store: **Supabase pgvector** (no new infra).

## Sources

| Text | Tradition | Ingest |
|------|-----------|--------|
| Integrated Vedic Astrology Vol 1 — P.V.R. Narasimha Rao | Vedic | ✅ text (163 chunks) |
| Integrated Vedic Astrology Vol 2 — P.V.R. Narasimha Rao | Vedic | ✅ text (123 chunks) |
| Light on Life — Svoboda & de Fouw | Vedic | ✅ text (306 chunks) |
| Uttara Kaalaamruta of Kaalidaasa (Hindi) | Vedic | ✅ text (118 chunks) |
| Brihat Parashara Hora Shastra (Devanagari) | Vedic | ⏳ scanned — needs OCR |
| Saravali of Kalyana Varma | Vedic | ⏳ scanned — needs OCR |
| Jataka Parijata | Vedic | ⏳ scanned — needs OCR |
| Three Hundred Important Combinations — B.V. Raman | Vedic | ⏳ scanned — needs OCR |
| IGNCA 6945 | Vedic | ⏳ scanned — needs OCR |
| Jyotisha collection (zip) | Vedic | ⏳ archive zip — needs unpack/OCR |

First corpus: **710 passages** from the 4 text-extractable sources. The five
scanned/Devanagari texts need an OCR pass (tesseract + Sanskrit/Hindi traineddata)
before ingestion — tracked as a follow-up.

## Activating retrieval (one-time)

1. Create a free Voyage AI account → API key (https://voyageai.com).
2. Run `rag/pgvector_schema.sql` in the Supabase SQL editor.
3. Put `VOYAGE_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   in `.env.local`, then `python rag/embed_upsert.py` (one-time, embeds + uploads).
4. Add `VOYAGE_API_KEY` to Vercel env vars → redeploy. Retrieval goes live.
