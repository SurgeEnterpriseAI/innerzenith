# dotit Curator Agent

The self-improving knowledge layer. It makes dotit's interpretations more
reliable than any single AI by distilling a **verified knowledge base** from a
panel of foundation models cross-checked against the classical source texts.

```
topic → ask Claude + GPT + Gemini independently (their own training)
      → retrieve the classical passages (rag/embeddings.json = ground truth)
      → ARBITER (Claude) cross-checks the panel against the texts:
           texts strongly back it (+ models agree) → VERIFIED
           disputed OR no textual support           → REVIEW queue
      → card stored with full provenance (texts cited, models, confidence)
      → verified cards published into the reading path as TOP grounding
```

The texts are the authority; model consensus is a corroborating bonus. The
arbiter is deliberately conservative — when models are missing or the texts are
thin, the card goes to **review**, never silently into the product.

## Files
- `panel.py` — the 3-model panel (each model answers independently; a missing
  key just skips that model, so it runs with whatever is available)
- `arbiter.py` — cross-references panel vs classical passages → a knowledge card
- `retrieval.py` — pulls the classical ground-truth passages (reuses the RAG store)
- `store.py` — persists cards (Supabase if service_role present, else local `cards.jsonl`)
- `curate.py` — the runner (seed `topics.json`, or a single topic via CLI)
- `publish.py` — exports verified cards → `rag/knowledge.json` (bundled into /api/chat)
- `common.py` — env + HTTP + embeddings (stdlib only)

## Keys (all in repo-root `.env.local` — local only, never deployed)
Already present: `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`.
For the **full 3-model panel + Supabase workbench**, add:
```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...            # Google AI Studio key (or GOOGLE_API_KEY)
SUPABASE_SERVICE_ROLE_KEY=...  # Supabase → Project Settings → API → service_role (secret)
# optional model overrides:
# OPENAI_MODEL=gpt-4o
# GEMINI_MODEL=gemini-2.0-flash
# ARBITER_MODEL=claude-opus-4-5
```
Without OpenAI/Gemini the panel runs Claude-only (cards land in review).
Without the service_role key, cards persist to `curator/cards.jsonl` instead of Supabase.

## Run
```
# 1. (Supabase mode only) create the table once: run supabase/knowledge_cards.sql
# 2. curate the seed topics (or one topic):
python curator/curate.py
python curator/curate.py "Rahu in the 10th house" "What does Rahu in the 10th mean for career?"
# 3. review pending cards:
#    Supabase mode → Table editor → knowledge_cards → set status verified/rejected
#    local mode    → edit curator/cards.jsonl status fields
# 4. publish verified cards into the reading path:
python curator/publish.py
git add rag/knowledge.json && git commit -m "curator: publish verified cards" && git push
```
Re-running is safe: cards upsert, and anything a human marked verified/rejected
is never overwritten.
