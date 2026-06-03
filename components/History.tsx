"use client";

// Stage 09 — all past sessions in one list, with category short-forms,
// keyword, and real-time search.

import { useMemo, useState } from "react";
import { loadSessions, Session } from "@/lib/sessions";
import { categoryByKey } from "@/lib/categories";

export default function History({ onOpen }: { onOpen: (s: Session) => void }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => loadSessions(), []);
  const filtered = all.filter((s) =>
    (s.keyword + " " + (categoryByKey(s.category)?.short ?? "")).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2b] text-white px-6 py-10 pb-28">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif-i text-2xl mb-5">History</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search"
          className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 outline-none text-sm mb-6"
        />
        {filtered.length === 0 && (
          <p className="text-[#b3b3b3] text-sm italic font-serif-i">No sessions yet. Tap a constellation to begin.</p>
        )}
        <ul className="space-y-1">
          {filtered.map((s, i) => {
            const short = s.isAskNow ? "ASK NOW" : categoryByKey(s.category)?.short ?? "";
            return (
              <li key={s.id}>
                <button
                  onClick={() => onOpen(s)}
                  className="w-full text-left py-3 border-b border-white/8 flex gap-3 hover:bg-white/[0.03] transition"
                >
                  <span className="text-[#b3b3b3] text-xs w-5 pt-0.5">{i + 1}</span>
                  <span className="micro-label pt-0.5 w-16 shrink-0">{short}</span>
                  <span className="text-sm text-[#d4d4d4] truncate">{s.keyword}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
