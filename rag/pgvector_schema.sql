-- dotit RAG — classical-text knowledge base in Supabase pgvector (Stage 11.1).
-- Run once in the Supabase SQL editor.

create extension if not exists vector;

drop table if exists knowledge_chunks cascade;

create table knowledge_chunks (
  id          text primary key,
  source      text not null,
  title       text,
  tradition   text default 'Vedic',
  location    text,
  content     text not null,
  embedding   vector(1024)        -- Voyage voyage-3.5-lite dimension
);

-- ANN index for fast cosine similarity search
create index on knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Retrieval RPC: top-N most relevant passages for a query embedding.
create or replace function match_knowledge(
  query_embedding vector(1024),
  match_count int default 5,
  min_similarity float default 0.0
)
returns table (
  id text, source text, title text, location text, content text, similarity float
)
language sql stable as $$
  select
    kc.id, kc.source, kc.title, kc.location, kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.embedding is not null
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- RAG is reference data, readable by the service role only (no RLS needed for
-- server-side retrieval). If exposing to anon, add a read policy.
