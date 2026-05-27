// Anonymous-first auth. Phone OTP upgrades silently when the user
// decides to "save" or subscribe — keeps Rule 6 (no friction up front).

import { getBrowserSupabase } from "./supabase";

export async function ensureAnonymousSession(): Promise<string | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signIn, error } = await sb.auth.signInAnonymously();
  if (error || !signIn.user) return null;
  return signIn.user.id;
}

export async function startPhoneOTP(phone: string) {
  const sb = getBrowserSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb.auth.signInWithOtp({ phone });
}

export async function verifyPhoneOTP(phone: string, token: string) {
  const sb = getBrowserSupabase();
  if (!sb) throw new Error("Supabase not configured");
  // This *upgrades* the anonymous session into a phone-linked one,
  // preserving the same auth.users.id — so all the user's existing data
  // (birth chart, threads, messages) stays attached.
  return sb.auth.verifyOtp({ phone, token, type: "sms" });
}

export async function signOut() {
  const sb = getBrowserSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}
