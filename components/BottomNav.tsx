"use client";

// Stage 7.3 — bottom navigation, 4 items.

export type Tab = "home" | "asknow" | "history" | "profile";

export default function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const items: { key: Tab; label: string; icon: JSX.Element }[] = [
    { key: "home", label: "Home", icon: <HomeIcon /> },
    { key: "asknow", label: "Ask Now", icon: <BoltIcon /> },
    { key: "history", label: "History", icon: <HistoryIcon /> },
    { key: "profile", label: "Profile", icon: <UserIcon /> },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#2b2b2b]/95 backdrop-blur border-t border-white/10 z-20">
      <div className="max-w-md mx-auto flex">
        {items.map((it) => {
          const on = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5"
            >
              <span className="relative" style={{ color: on ? "#fff" : "#b3b3b3" }}>
                {on && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
                )}
                {it.icon}
              </span>
              <span className="text-[10px]" style={{ color: on ? "#fff" : "#b3b3b3" }}>
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
