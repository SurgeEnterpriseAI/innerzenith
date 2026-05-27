// Server-side repository helpers. Used by API routes.
// All writes go through the admin client (service-role key) but the user_id
// is always provided by the verified server-side session — never trusted from the body.

import { getAdminSupabase } from "./supabase";

export type BirthChartInput = {
  name?: string | null;
  birth_date: string;            // ISO yyyy-mm-dd
  birth_time?: string | null;    // 'HH:MM:SS' or null
  birth_time_known: boolean;
  birth_place: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  chart_json?: unknown;
  rectified?: boolean;
  rectification_events?: unknown;
};

export async function upsertBirthChart(userId: string, input: BirthChartInput) {
  const sb = getAdminSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("birth_charts")
    .upsert({ user_id: userId, ...input }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getBirthChart(userId: string) {
  const sb = getAdminSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("birth_charts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function ensureThread(
  userId: string,
  threadId: string | null,
  firstMessage?: string
) {
  const sb = getAdminSupabase();
  if (!sb) return null;
  if (threadId) {
    const { data } = await sb
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return data;
  }
  const title = (firstMessage || "").slice(0, 80) || "new conversation";
  const { data, error } = await sb
    .from("threads")
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function appendMessage(
  threadId: string,
  role: "user" | "assistant" | "system",
  content: string,
  facts?: unknown
) {
  const sb = getAdminSupabase();
  if (!sb) return null;
  const { error } = await sb.from("messages").insert({
    thread_id: threadId,
    role,
    content,
    facts_json: facts ?? null,
  });
  if (error) throw error;
}

export async function loadThreadMessages(threadId: string, userId: string) {
  const sb = getAdminSupabase();
  if (!sb) return [];
  const { data: thread } = await sb
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!thread) return [];
  const { data } = await sb
    .from("messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  return data || [];
}
