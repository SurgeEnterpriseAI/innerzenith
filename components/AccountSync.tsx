"use client";

// Account / cross-device sync — email magic link. Renders nothing unless
// Supabase sync is configured, so the app is unchanged until keys land.
// Signed out: collect an email and send a magic link. Signed in: show who,
// and offer sign-out. Data sync itself is handled in lib/sync.ts.

import { useEffect, useState } from "react";
import { syncConfigured, syncWhoami, sendMagicLink, signOut } from "@/lib/sync";
import { loadProfile } from "@/lib/profile";
import { useT } from "@/lib/i18n";

export default function AccountSync() {
  const { t } = useT();
  const [ready, setReady] = useState(false);
  // pre-fill with the email captured at onboarding (Dot 7), if any (spec 13.13).
  const [email, setEmail] = useState(() => loadProfile()?.email ?? "");
  const [me, setMe] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      const who = await syncWhoami();
      if (!off) {
        setMe(who);
        setReady(true);
      }
    })();
    return () => {
      off = true;
    };
  }, []);

  if (!syncConfigured()) return null;
  if (!ready) return null;

  async function send() {
    const addr = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
      setError(t("Enter a valid email."));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await sendMagicLink(addr);
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error || t("Could not send the link. Try again."));
  }

  async function out() {
    setBusy(true);
    await signOut();
    setBusy(false);
    setMe(null);
    setSent(false);
    setEmail("");
  }

  return (
    <div className="mt-8 pt-6 border-t border-white/10">
      <p className="micro-label mb-3">{t("Sync across devices")}</p>

      {me ? (
        <div className="space-y-2">
          <p className="text-sm text-[#d4d4d4]">
            {t("Signed in as")} <span className="text-white">{me}</span>
          </p>
          <p className="text-[#777] text-[11px] leading-relaxed">
            {t("Your profile, chart, and conversations are saved to your account and follow you to any device you sign in on.")}
          </p>
          <button
            onClick={out}
            disabled={busy}
            className="block text-sm text-[#d4d4d4] mt-2 disabled:opacity-50"
          >
            {t("Sign out")}
          </button>
        </div>
      ) : sent ? (
        <p className="text-sm text-[#d4d4d4] leading-relaxed">
          {t("Check your inbox — we sent a sign-in link to {email}. Open it on any device to sync your readings there.", { email: email.trim() })}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-[#777] text-[11px] leading-relaxed">
            {t("Add your email to keep your profile and history safe and use dotit on more than one device. No password — we email you a sign-in link.")}
          </p>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="w-full bg-transparent border border-white/20 focus:border-white/40 rounded-full px-4 py-3 text-sm outline-none transition"
          />
          {error && <p className="text-red-400/80 text-[12px]">{error}</p>}
          <button
            onClick={send}
            disabled={busy}
            className="w-full border border-white/20 hover:border-white/40 rounded-full py-3 text-sm transition disabled:opacity-50"
          >
            {busy ? t("Sending…") : t("Email me a sign-in link")}
          </button>
        </div>
      )}
    </div>
  );
}
