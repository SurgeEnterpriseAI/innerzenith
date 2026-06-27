"use client";

// dotit — top-level router. Onboarding → Home (sky map) with bottom nav
// across Home / Ask Now / History / Profile, plus Session and Ask-Now-Session views.
// The whole UI renders in the user's language (device locale on first open, or
// their saved preference) via I18nProvider.

import { useEffect, useState } from "react";
import { Profile, loadProfile, saveProfile } from "@/lib/profile";
import { syncInit, onAuthSignIn } from "@/lib/sync";
import { I18nProvider } from "@/lib/i18n";
import { matchDeviceLanguage } from "@/lib/languages";
import { fetchGeoLocale } from "@/lib/geo";
import { CategoryKey } from "@/lib/categories";
import { Session as Sess } from "@/lib/sessions";
import Onboarding from "@/components/Onboarding";
import Home from "@/components/Home";
import Session from "@/components/Session";
import AskNow from "@/components/AskNow";
import History from "@/components/History";
import ProfileView from "@/components/ProfileView";
import ProfileEdit from "@/components/ProfileEdit";
import SurpriseMe from "@/components/SurpriseMe";
import BottomNav, { Tab } from "@/components/BottomNav";
import LanguageToast from "@/components/LanguageToast";

type View =
  | { kind: "tab"; tab: Tab }
  | { kind: "session"; category: CategoryKey | "asknow"; existing?: Sess | null }
  | { kind: "surprise" }
  | { kind: "edit" };

export default function Page() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [suggested, setSuggested] = useState("en-US"); // the regional language we OFFER
  const [localeChoice, setLocaleChoice] = useState<string | null>(null); // pre-profile pick
  const [view, setView] = useState<View>({ kind: "tab", tab: "home" });

  useEffect(() => {
    let cancelled = false;
    const device = matchDeviceLanguage(
      typeof navigator !== "undefined" ? navigator.language : "en-US"
    );
    // On cold load: if signed in, hydrate localStorage from Supabase first so
    // the UI reads the synced data. No-op (instant) when sync is unconfigured.
    const hydrate = async () => {
      try {
        await syncInit();
      } catch {}
      const p = loadProfile();
      // English is the default. We still detect the visitor's regional language
      // (Vercel edge geo → e.g. Bengaluru = Kannada; else browser language) but
      // only to OFFER it via a small nudge — never to switch automatically.
      let offer = device;
      if (!p?.language) {
        const geo = await fetchGeoLocale();
        if (geo) offer = geo;
      }
      if (cancelled) return;
      setProfile(p);
      setSuggested(offer);
      setReady(true);
    };
    hydrate();
    // Re-hydrate when a sign-in lands (e.g. returning from a magic link).
    const unsub = onAuthSignIn(hydrate);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // English by default; only the user's explicit choice (picker or the nudge)
  // changes it.
  const locale = profile?.language || localeChoice || "en-US";

  // The nudge's action: switch to the offered regional language.
  function switchToLocal() {
    setLocaleChoice(suggested);
    if (profile && profile.language !== suggested) {
      const u = { ...profile, language: suggested };
      saveProfile(u);
      setProfile(u);
    }
  }

  let content: React.ReactNode;

  if (!ready) {
    content = <div className="min-h-[100dvh] bg-[#0D0D0D]" />;
  } else if (!profile || !profile.onboarding_complete) {
    // Onboarding gate
    content = (
      <Onboarding
        onComplete={(p) => {
          if (localeChoice && !p.language) {
            p.language = localeChoice; // they tapped the nudge during onboarding
            saveProfile(p);
          }
          setProfile(p);
          setView({ kind: "tab", tab: "home" });
        }}
      />
    );
  } else if (view.kind === "session") {
    content = (
      <Session
        profile={profile}
        category={view.category}
        isAskNow={view.existing?.isAskNow ?? false}
        existing={view.existing ?? null}
        onBack={() => setView({ kind: "tab", tab: "home" })}
      />
    );
  } else if (view.kind === "surprise") {
    content = <SurpriseMe profile={profile} onBack={() => setView({ kind: "tab", tab: "home" })} />;
  } else if (view.kind === "edit") {
    content = (
      <ProfileEdit
        profile={profile}
        onSaved={(p) => {
          setProfile(p);
          setView({ kind: "tab", tab: "profile" });
        }}
        onCancel={() => setView({ kind: "tab", tab: "profile" })}
      />
    );
  } else {
    const tab = view.tab;
    content = (
      <>
        {tab === "home" && (
          <Home
            profile={profile}
            onPick={(key) =>
              key === "surprise"
                ? setView({ kind: "surprise" })
                : setView({ kind: "session", category: key })
            }
            onProfile={() => setView({ kind: "tab", tab: "profile" })}
          />
        )}
        {tab === "asknow" && <AskNow profile={profile} />}
        {tab === "history" && (
          <History
            onOpen={(s) => setView({ kind: "session", category: s.category, existing: s })}
          />
        )}
        {tab === "profile" && (
          <ProfileView
            profile={profile}
            onEdit={() => setView({ kind: "edit" })}
            onChange={(p) => setProfile(p)}
            onReset={() => {
              setProfile(null);
              setView({ kind: "tab", tab: "home" });
            }}
          />
        )}
        <BottomNav active={tab} onChange={(t) => setView({ kind: "tab", tab: t })} />
      </>
    );
  }

  return (
    <I18nProvider locale={locale}>
      {content}
      {ready && <LanguageToast locale={locale} suggested={suggested} onSwitch={switchToLocal} />}
    </I18nProvider>
  );
}
