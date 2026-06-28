"use client";

// Stage 09 / spec 13.12 — past sessions. Each row: full category name + em-dash +
// qualifier on one line (name #D4D4D4, qualifier #FFFFFF so the topic stands out),
// date right, delete ×, divider beneath. Tapping a row reopens and continues it.

import { useMemo, useState } from "react";
import { loadSessions, deleteSession, Session } from "@/lib/sessions";
import { categoryByKey } from "@/lib/categories";
import { useT } from "@/lib/i18n";

// Full title for a session: category name (or "Ask Now") + the qualifier, which is
// the extracted keyword or "Initial" for a broad first reading (locked at save).
function sessionTitle(s: Session): { name: string; qualifier: string } {
  const name = s.isAskNow ? "Ask Now" : categoryByKey(s.category)?.title ?? "";
  const kw = (s.keyword || "").trim();
  // Old broad readings stored the category name as the keyword → treat as Initial.
  const isInitial = !kw || kw.toLowerCase() === name.toLowerCase();
  const qualifier = isInitial ? "Initial" : kw.charAt(0).toUpperCase() + kw.slice(1);
  return { name, qualifier };
}

export default function History({ onOpen }: { onOpen: (s: Session) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [version, setVersion] = useState(0); // bump to refresh after delete
  const all = useMemo(() => loadSessions(), [version]);
  const filtered = all.filter((s) => {
    const { name, qualifier } = sessionTitle(s);
    return (name + " " + qualifier).toLowerCase().includes(q.toLowerCase());
  });

  function remove(id: string) {
    if (!confirm(t("Delete this conversation?"))) return;
    deleteSession(id);
    setVersion((v) => v + 1);
  }

  return (
    <div className="min-h-[100dvh] bg-[#0D0D0D] text-white px-6 py-10 pb-28">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif-i text-[28px] mb-5">{t("History")}</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search your history...")}
          className="input-underline w-full text-[13px] font-light text-white placeholder:text-[#b3b3b3] py-2 mb-6"
        />
        {filtered.length === 0 && (
          <p className="text-[#b3b3b3] text-sm italic font-serif-i">{t("No sessions yet. Tap a constellation to begin.")}</p>
        )}
        <ul>
          {filtered.map((s) => {
            const { name, qualifier } = sessionTitle(s);
            return (
              <li key={s.id} className="border-b border-[#d4d4d4]/20">
                <div className="flex items-center gap-3 py-3">
                  <button onClick={() => onOpen(s)} className="flex-1 min-w-0 text-left">
                    <span className="text-[13px] font-light flex min-w-0">
                      <span className="text-[#d4d4d4] whitespace-nowrap">{name} — </span>
                      <span className="text-white truncate">{qualifier}</span>
                    </span>
                  </button>
                  <span className="text-[11px] font-light text-[#b3b3b3] shrink-0">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => remove(s.id)}
                    aria-label="delete conversation"
                    className="text-[#b3b3b3] hover:text-red-400/80 text-sm shrink-0"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
