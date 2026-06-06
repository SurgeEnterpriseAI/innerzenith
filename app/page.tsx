"use client";

// dotit — top-level router. Onboarding → Home (sky map) with bottom nav
// across Home / Ask Now / History / Profile, plus Session and Ask-Now-Session views.

import { useEffect, useState } from "react";
import { Profile, loadProfile } from "@/lib/profile";
import { CategoryKey } from "@/lib/categories";
import { Session as Sess } from "@/lib/sessions";
import Onboarding from "@/components/Onboarding";
import Home from "@/components/Home";
import Session from "@/components/Session";
import AskNow from "@/components/AskNow";
import History from "@/components/History";
import ProfileView from "@/components/ProfileView";
import BottomNav, { Tab } from "@/components/BottomNav";

type View =
  | { kind: "tab"; tab: Tab }
  | { kind: "session"; category: CategoryKey; existing?: Sess | null };

export default function Page() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>({ kind: "tab", tab: "home" });

  useEffect(() => {
    setProfile(loadProfile());
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="min-h-[100dvh] bg-[#2b2b2b]" />;
  }

  // Onboarding gate
  if (!profile || !profile.onboarding_complete) {
    return (
      <Onboarding
        onComplete={(p) => {
          setProfile(p);
          setView({ kind: "tab", tab: "home" });
        }}
      />
    );
  }

  // Full-screen session views (no bottom nav)
  if (view.kind === "session") {
    return (
      <Session
        profile={profile}
        category={view.category}
        isAskNow={false}
        existing={view.existing ?? null}
        onBack={() => setView({ kind: "tab", tab: "home" })}
      />
    );
  }
  // Tab views (with bottom nav)
  const tab = view.tab;
  return (
    <>
      {tab === "home" && (
        <Home
          profile={profile}
          onPick={(key) => setView({ kind: "session", category: key })}
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
          onEdit={() => {
            // re-run onboarding to edit (recalc disclaimer lives in spec Phase 7)
            setProfile({ ...profile, onboarding_complete: false });
          }}
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
