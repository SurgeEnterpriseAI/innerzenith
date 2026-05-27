-- InnerZenith — full schema
-- Run this once in the Supabase SQL editor.
-- Reset-safe: drops and recreates everything.

-- ─── Extensions ────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Tables ────────────────────────────────────────────────────

-- profiles: one row per auth user (anonymous or phone-linked)
drop table if exists messages cascade;
drop table if exists threads cascade;
drop table if exists birth_charts cascade;
drop table if exists profiles cascade;

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  phone           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- birth_charts: full-precision chart storage.
-- Even the seconds and longitude/latitude to 6 decimals are kept,
-- because the user said "till minute details".
create table birth_charts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text,
  birth_date      date not null,
  birth_time      time,                       -- nullable: user may not know
  birth_time_known boolean not null default false,
  birth_place     text not null,              -- "Bangalore, India"
  latitude        numeric(10, 6),
  longitude       numeric(10, 6),
  timezone        text,                       -- "Asia/Kolkata"
  -- raw chart math computed by the Python ephemeris sidecar
  chart_json      jsonb,                      -- full Vedic + KP + BaZi + Navamsha output
  rectified       boolean default false,      -- true after BTR succeeded
  rectification_events jsonb,                 -- life events used in BTR
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- threads: each user's conversations
create table threads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  title           text,                       -- inferred from first user message
  active_bucket   text,                       -- career / love / property / money / family / inner
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- messages: every turn in every conversation
create table messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references threads(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  -- facts the advisor remembered from this message (Rule 6: facts not feelings)
  facts_json      jsonb,
  token_count     integer,
  created_at      timestamptz default now()
);

-- ─── Indexes ───────────────────────────────────────────────────
create index idx_birth_charts_user on birth_charts(user_id);
create index idx_threads_user on threads(user_id, updated_at desc);
create index idx_messages_thread on messages(thread_id, created_at asc);

-- ─── Triggers ──────────────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger birth_charts_touch before update on birth_charts
  for each row execute function touch_updated_at();
create trigger threads_touch before update on threads
  for each row execute function touch_updated_at();

-- ─── Auto-create profile on auth.users insert ─────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, phone) values (new.id, new.phone);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Row Level Security ────────────────────────────────────────
alter table profiles      enable row level security;
alter table birth_charts  enable row level security;
alter table threads       enable row level security;
alter table messages      enable row level security;

-- Profiles: user can read/update their own
create policy "self read profile"   on profiles for select using (auth.uid() = id);
create policy "self update profile" on profiles for update using (auth.uid() = id);

-- Charts: user owns their own
create policy "self read charts"    on birth_charts for select using (auth.uid() = user_id);
create policy "self insert charts"  on birth_charts for insert with check (auth.uid() = user_id);
create policy "self update charts"  on birth_charts for update using (auth.uid() = user_id);
create policy "self delete charts"  on birth_charts for delete using (auth.uid() = user_id);

-- Threads
create policy "self read threads"   on threads for select using (auth.uid() = user_id);
create policy "self insert threads" on threads for insert with check (auth.uid() = user_id);
create policy "self update threads" on threads for update using (auth.uid() = user_id);
create policy "self delete threads" on threads for delete using (auth.uid() = user_id);

-- Messages: scoped through thread ownership
create policy "self read messages"  on messages for select using (
  exists (select 1 from threads t where t.id = thread_id and t.user_id = auth.uid())
);
create policy "self insert messages" on messages for insert with check (
  exists (select 1 from threads t where t.id = thread_id and t.user_id = auth.uid())
);
