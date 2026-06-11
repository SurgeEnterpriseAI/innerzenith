// dotit — cross-device persistence sync (email-magic-link auth + Supabase).
//
// localStorage stays the synchronous source of truth the UI reads from. This
// module mirrors every write up to Supabase and, on sign-in, hydrates
// localStorage from the server (or adopts local data if the server is empty).
// Everything here is a safe no-op when Supabase is not configured or no user
// is signed in — so the app behaves exactly as before until keys + login land.
//
// Security: this is entirely client-side under Row-Level Security. The browser
// uses the public anon key + the user's own session; each user can touch only
// their own rows. No service_role / secret key is involved anywhere.

import { getBrowserSupabase, supabaseConfigured } from "./supabase";

// These MUST match the keys in lib/profile.ts, lib/sessions.ts, lib/surprise.ts.
const PROFILE_KEY = "dotit.profile.v1";
const SESSIONS_KEY = "dotit.sessions.v1";
const SURPRISE_KEY = "dotit.surprise.v1";

type AuthUser = { id: string; email: string | null };
let cachedUser: AuthUser | null = null;
let wired = false;

function store(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Keep cachedUser fresh so the fire-and-forget pushers stay synchronous. */
function wireAuth() {
  const sb = getBrowserSupabase();
  if (!sb || wired) return;
  wired = true;
  sb.auth.getSession().then(({ data }) => {
    const u = data.session?.user;
    cachedUser = u ? { id: u.id, email: u.email ?? null } : null;
  });
  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cachedUser = u ? { id: u.id, email: u.email ?? null } : null;
  });
}

async function authUser(): Promise<AuthUser | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  if (cachedUser) return cachedUser;
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  cachedUser = u ? { id: u.id, email: u.email ?? null } : null;
  return cachedUser;
}

export function syncConfigured(): boolean {
  return supabaseConfigured;
}

/** The signed-in user's email, or null. For the account UI. */
export async function syncWhoami(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  wireAuth();
  return (await authUser())?.email ?? null;
}

// ─── Auth (email magic link) ──────────────────────────────────────────────

export async function sendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: "Sync is not configured." };
  const redirect = typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = getBrowserSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  cachedUser = null;
}

/**
 * Fire `cb` when a sign-in completes (e.g. the user returns from a magic link).
 * Returns an unsubscribe fn; a no-op when sync is not configured. The callback
 * is deferred to avoid the supabase-js "don't call auth inside the listener"
 * re-entrancy hazard.
 */
export function onAuthSignIn(cb: () => void): () => void {
  const sb = getBrowserSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      const u = session?.user;
      cachedUser = u ? { id: u.id, email: u.email ?? null } : null;
      setTimeout(cb, 0);
    }
  });
  return () => data.subscription.unsubscribe();
}

// ─── Initial hydrate ──────────────────────────────────────────────────────

/**
 * On app load: if signed in, pull the server's data into localStorage and
 * return true (caller should re-read). If the server is empty, adopt whatever
 * is already local (first sign-in on a device that has data) and return false.
 * No-op (returns false) when not configured or not signed in.
 */
export async function syncInit(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  wireAuth();
  const u = await authUser();
  const sb = getBrowserSupabase();
  const s = store();
  if (!u || !sb || !s) return false;

  const today = new Date().toISOString().slice(0, 10);
  const [prof, sess, surr] = await Promise.all([
    sb.from("app_profile").select("profile").eq("user_id", u.id).maybeSingle(),
    sb.from("app_sessions").select("data").eq("user_id", u.id).order("created_at", { ascending: false }),
    sb.from("app_surprise").select("day,text").eq("user_id", u.id).eq("day", today).maybeSingle(),
  ]);

  const serverProfile = (prof.data as any)?.profile ?? null;
  const serverSessions = Array.isArray(sess.data) ? (sess.data as any[]).map((r) => r.data) : [];
  const hasServer = Boolean(serverProfile) || serverSessions.length > 0;

  if (hasServer) {
    if (serverProfile) s.setItem(PROFILE_KEY, JSON.stringify(serverProfile));
    s.setItem(SESSIONS_KEY, JSON.stringify(serverSessions));
    const sr = surr.data as any;
    if (sr?.text) s.setItem(SURPRISE_KEY, JSON.stringify({ date: sr.day, text: sr.text }));
    return true;
  }

  // Server empty → push up whatever this device already has.
  await adoptLocal(u.id);
  return false;
}

async function adoptLocal(userId: string): Promise<void> {
  const sb = getBrowserSupabase();
  if (!sb) return;
  const profile = readJSON<any>(PROFILE_KEY);
  const sessions = readJSON<any[]>(SESSIONS_KEY) ?? [];
  const surprise = readJSON<{ date: string; text: string }>(SURPRISE_KEY);
  const now = new Date().toISOString();

  if (profile) {
    await sb.from("app_profile").upsert({ user_id: userId, profile, updated_at: now });
  }
  if (sessions.length) {
    await sb.from("app_sessions").upsert(
      sessions.map((d) => ({
        id: d.id,
        user_id: userId,
        data: d,
        created_at: d.created_at || now,
        updated_at: now,
      }))
    );
  }
  if (surprise?.text) {
    await sb.from("app_surprise").upsert({ user_id: userId, day: surprise.date, text: surprise.text });
  }
}

// ─── Mirror writes (fire-and-forget; never block or throw into the UI) ──────

export function pushProfile(profile: any): void {
  if (!supabaseConfigured) return;
  void (async () => {
    try {
      const u = await authUser();
      const sb = getBrowserSupabase();
      if (!u || !sb) return;
      await sb.from("app_profile").upsert({ user_id: u.id, profile, updated_at: new Date().toISOString() });
    } catch {}
  })();
}

export function pushSession(session: any): void {
  if (!supabaseConfigured) return;
  void (async () => {
    try {
      const u = await authUser();
      const sb = getBrowserSupabase();
      if (!u || !sb) return;
      await sb.from("app_sessions").upsert({
        id: session.id,
        user_id: u.id,
        data: session,
        created_at: session.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch {}
  })();
}

export function removeSession(id: string): void {
  if (!supabaseConfigured) return;
  void (async () => {
    try {
      const u = await authUser();
      const sb = getBrowserSupabase();
      if (!u || !sb) return;
      await sb.from("app_sessions").delete().eq("user_id", u.id).eq("id", id);
    } catch {}
  })();
}

export function clearSessionsRemote(): void {
  if (!supabaseConfigured) return;
  void (async () => {
    try {
      const u = await authUser();
      const sb = getBrowserSupabase();
      if (!u || !sb) return;
      await sb.from("app_sessions").delete().eq("user_id", u.id);
    } catch {}
  })();
}

export function clearProfileRemote(): void {
  if (!supabaseConfigured) return;
  void (async () => {
    try {
      const u = await authUser();
      const sb = getBrowserSupabase();
      if (!u || !sb) return;
      await sb.from("app_profile").delete().eq("user_id", u.id);
    } catch {}
  })();
}

export function pushSurprise(day: string, text: string): void {
  if (!supabaseConfigured) return;
  void (async () => {
    try {
      const u = await authUser();
      const sb = getBrowserSupabase();
      if (!u || !sb) return;
      await sb.from("app_surprise").upsert({ user_id: u.id, day, text });
    } catch {}
  })();
}
