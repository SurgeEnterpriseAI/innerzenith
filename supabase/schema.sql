-- dotit — persistence schema (document model, email-magic-link auth).
-- Run once in the Supabase SQL editor (Project → SQL → New query → paste → Run).
-- Reset-safe: drops and recreates the app tables only. Does NOT touch auth.*.
--
-- Design: the app stores flat JSON blobs in localStorage (Profile, Session[],
-- the daily Surprise). These tables mirror those shapes 1:1, one owner per row
-- keyed to the Supabase auth user, so the browser client (with the user's
-- session) reads/writes only its own rows under Row-Level Security. No
-- service_role key is needed anywhere — the anon key + RLS is the whole story.
-- (Supersedes the earlier normalized profiles/birth_charts/threads/messages
--  draft, which was built for the phone-OTP era and never deployed.)

-- ─── Reset ─────────────────────────────────────────────────────
-- Remove the legacy phone-OTP schema if it was ever run on this project.
-- Its on_auth_user_created trigger calls handle_new_user(), which inserts
-- into the old `profiles` table; if that errors, every signup fails with
-- "Database error saving new user". The document model below needs no such
-- trigger (the client writes app_profile on first save), so drop it all.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user() cascade;
drop table if exists messages cascade;
drop table if exists threads cascade;
drop table if exists birth_charts cascade;
drop table if exists profiles cascade;

drop table if exists app_surprise cascade;
drop table if exists app_sessions cascade;
drop table if exists app_profile cascade;

-- ─── Tables ────────────────────────────────────────────────────

-- One profile blob per user (the entire lib/profile.ts Profile object,
-- including the full four-system chart computed once at onboarding).
create table app_profile (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  profile     jsonb not null,
  updated_at  timestamptz not null default now()
);

-- One row per History / Ask Now session (the lib/sessions.ts Session object).
-- id is the client-generated id ("s_..."), so upserts are idempotent across devices.
create table app_sessions (
  id          text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index idx_app_sessions_user on app_sessions (user_id, created_at desc);

-- The once-per-calendar-day Surprise Me reading.
create table app_surprise (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  text        text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- ─── Row-Level Security: every user sees only their own rows ────
alter table app_profile  enable row level security;
alter table app_sessions enable row level security;
alter table app_surprise enable row level security;

create policy "own profile"  on app_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on app_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own surprise" on app_surprise
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
