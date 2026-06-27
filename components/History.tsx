"use client";

// Stage 09 — all past sessions in one list, with category short-forms,
// keyword, real-time search, and per-conversation delete.

import { useMemo, useState } from "react";
import { loadSessions, deleteSession, Session } from "@/lib/sessions";
import { categoryByKey } from "@/lib/categories";
import { resolveGlyph } from "@/lib/symbols";
import { useT } from "@/lib/i18n";
import SymbolGlyph from "./SymbolGlyph";

export default function History({ onOpen }: { onOpen: (s: Session) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [version, setVersion] = useState(0); // bump to refresh after delete
  const all = useMemo(() => loadSessions(), [version]);
  const filtered = all.filter((s) =>
    (s.keyword + " " + (categoryByKey(s.category)?.short ?? "")).toLowerCase().includes(q.toLowerCase())
  );

  function remove(id: string) {
    if (!confirm(t("Delete this conversation?"))) return;
    deleteSession(id);
    setVersion((v) => v + 1);
  }

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2b] text-white px-6 py-10 pb-28">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif-i text-2xl mb-5">{t("History")}</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 outline-none text-sm mb-6"
        />
        {filtered.length === 0 && (
          <p className="text-[#b3b3b3] text-sm italic font-serif-i">{t("No sessions yet. Tap a constellation to begin.")}</p>
        )}
        <ul className="space-y-1">
          {filtered.map((s) => {
            const short = s.isAskNow ? t("ASK NOW") : categoryByKey(s.category)?.short ?? "";
            const sym = s.symbol ?? resolveGlyph(s.messages.find((m) => m.role === "assistant")?.content || "", s.category);
            return (
              <li key={s.id} className="flex items-center gap-2 border-b border-white/8">
                <button
                  onClick={() => onOpen(s)}
                  className="flex-1 text-left py-3 flex items-center gap-3 hover:bg-white/[0.03] transition"
                >
                  <SymbolGlyph keyName={sym} size={30} className="w-8 shrink-0" />
                  <span className="micro-label w-16 shrink-0">{short}</span>
                  <span className="text-sm text-[#d4d4d4] truncate">{s.keyword}</span>
                </button>
                <button
                  onClick={() => remove(s.id)}
                  aria-label="delete conversation"
                  className="text-[#b3b3b3] hover:text-red-400/80 px-2 py-1 text-sm shrink-0"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
