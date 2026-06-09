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
import ProfileEdit from "@/components/ProfileEdit";
import SurpriseMe from "@/components/SurpriseMe";
import BottomNav, { Tab } from "@/components/BottomNav";

type View =
  | { kind: "tab"; tab: Tab }
  | { kind: "session"; category: CategoryKey; existing?: Sess | null }
  | { kind: "surprise" }
  | { kind: "edit" };

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
  // Surprise Me — full-screen, once-per-day
  if (view.kind === "surprise") {
    return <SurpriseMe profile={profile} onBack={() => setView({ kind: "tab", tab: "home" })} />;
  }

  // Focused birth-details editor (not the full onboarding restart)
  if (view.kind === "edit") {
    return (
      <ProfileEdit
        profile={profile}
        onSaved={(p) => {
          setProfile(p);
          setView({ kind: "tab", tab: "profile" });
        }}
        onCancel={() => setView({ kind: "tab", tab: "profile" })}
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
