// Anonymous-first auth + thread management on the browser side.
// All writes go through the browser supabase-js client and are protected
// by Row-Level Security policies in schema.sql.

import { getBrowserSupabase } from "./supabase";

export type DBMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
};

export type DBThread = {
  id: string;
  title: string | null;
  active_bucket: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Ensure an authenticated session exists (anonymous if needed).
 * Returns the user's UUID, or null if Supabase isn't configured.
 */
export async function ensureSession(): Promise<string | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;

  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signIn, error } = await sb.auth.signInAnonymously();
  if (error || !signIn.user) {
    console.warn("[auth] anon sign-in failed:", error?.message);
    return null;
  }
  return signIn.user.id;
}

/**
 * Get the user's most recent thread, or create a new empty one if none exists.
 */
export async function getOrCreateActiveThread(
  userId: string
): Promise<DBThread | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;

  const { data: existing } = await sb
    .from("threads")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as DBThread;

  const { data: created, error } = await sb
    .from("threads")
    .insert({ user_id: userId, title: null })
    .select()
    .single();

  if (error) {
    console.warn("[auth] thread create failed:", error.message);
    return null;
  }
  return created as DBThread;
}

/** Create a brand-new thread (used by "new conversation"). */
export async function createNewThread(userId: string): Promise<DBThread | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("threads")
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) {
    console.warn("[auth] new thread failed:", error.message);
    return null;
  }
  return data as DBThread;
}

/** Load every message in a thread in chronological order. */
export async function loadMessages(threadId: string): Promise<DBMessage[]> {
  const sb = getBrowserSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("messages")
    .select("id, role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[auth] load messages failed:", error.message);
    return [];
  }
  return (data || []) as DBMessage[];
}

/** Append a single message to a thread. RLS verifies thread ownership. */
export async function saveMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const sb = getBrowserSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("messages")
    .insert({ thread_id: threadId, role, content });
  if (error) console.warn("[auth] save message failed:", error.message);
  // Touch the thread so "latest" ordering stays right.
  await sb
    .from("threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);
}

/** One-shot migration of pre-Supabase localStorage thread into DB. */
export async function migrateLocalStorageIfAny(
  threadId: string,
  storageKey: string
): Promise<number> {
  const sb = getBrowserSupabase();
  if (!sb) return 0;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return 0;

    const rows = parsed.map((m) => ({
      thread_id: threadId,
      role: m.role,
      content: m.content,
    }));
    const { error } = await sb.from("messages").insert(rows);
    if (error) {
      console.warn("[auth] migration failed:", error.message);
      return 0;
    }
    localStorage.removeItem(storageKey);
    return parsed.length;
  } catch {
    return 0;
  }
}

/** Phone OTP — kept for the upgrade flow later. */
export async function startPhoneOTP(phone: string) {
  const sb = getBrowserSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb.auth.signInWithOtp({ phone });
}

export async function verifyPhoneOTP(phone: string, token: string) {
  const sb = getBrowserSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb.auth.verifyOtp({ phone, token, type: "sms" });
}

export async function signOut() {
  const sb = getBrowserSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}
