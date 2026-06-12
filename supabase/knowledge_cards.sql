-- dotit — Curator Agent knowledge base (the "self-improving" layer).
-- Run once in the Supabase SQL editor. Separate from the user-data tables.
--
-- Each row is a VERIFIED interpretation distilled by the curator: a 3-model
-- panel (Claude + GPT + Gemini) cross-referenced against the classical-text
-- RAG corpus by an arbiter. This table is the curator's workbench, review
-- queue, and audit trail. It is INTERNAL — locked to the service_role only
-- (RLS on, no policies) so the public anon/publishable key can never read it.
-- The reading path never queries this table; verified cards are exported to a
-- bundled rag/knowledge.json instead.

create extension if not exists pgcrypto;

drop table if exists knowledge_cards cascade;

create table knowledge_cards (
  id                  uuid primary key default gen_random_uuid(),
  -- what this card answers
  topic               text not null,            -- "Saturn in the 7th house — marriage timing"
  category            text,                     -- one of the 6 dotit categories (optional)
  question            text not null,            -- canonical question the card answers
  interpretation      text not null,            -- the verified plain-language statement
  -- provenance (how it was verified)
  model_panel         jsonb not null,           -- [{model, stance}] — the 3 independent answers
  classical_citations jsonb not null,           -- [{title, location, excerpt, similarity}]
  agreement           text not null,            -- unanimous | majority | split
  classical_support   text not null,            -- strong | partial | none
  confidence          real not null,            -- 0..1
  -- workflow
  status              text not null default 'review'   -- review | verified | rejected
                        check (status in ('review','verified','rejected')),
  -- retrieval (embedding kept as a float array; in-process cosine like the
  -- classical store. Migrate to a pgvector column if cards reach 10k+.)
  embedding           jsonb,
  -- audit
  version             int not null default 1,
  reviewed_by         text,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_cards_status   on knowledge_cards (status);
create index idx_cards_topic    on knowledge_cards (topic);
create index idx_cards_category on knowledge_cards (category);

-- touch updated_at
create or replace function cards_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger knowledge_cards_touch before update on knowledge_cards
  for each row execute function cards_touch();

-- Lock down: internal table, service_role only. RLS on + no policies means the
-- anon/publishable key (the browser) gets nothing; the curator writes with the
-- service_role key, which bypasses RLS.
alter table knowledge_cards enable row level security;
