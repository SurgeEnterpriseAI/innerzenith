"use client";

// Stage 09 — all past sessions in one list, with category short-forms,
// keyword, real-time search, and per-conversation delete.

import { useMemo, useState } from "react";
import { loadSessions, deleteSession, newId, Session } from "@/lib/sessions";
import { categoryByKey } from "@/lib/categories";
import { useT } from "@/lib/i18n";

export default function History({ onOpen }: { onOpen: (s: Session) => void }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [version, setVersion] = useState(0); // bump to refresh after delete
  const [openId, setOpenId] = useState<string | null>(null);
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
            const short = s.isAskNow ? t("ASK NOW") : categoryByKey(s.category)?.short ?? "";
            const isOpen = openId === s.id;
            return (
              <li key={s.id} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="micro-label text-[#d4d4d4] flex-1">{short}</span>
                  <span className="text-[11px] font-light text-[#b3b3b3]">
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
                <button
                  onClick={() => setOpenId((id) => (id === s.id ? null : s.id))}
                  className="block w-full text-left mt-1"
                >
                  <span className="text-[13px] font-light text-white truncate block">{s.keyword}</span>
                </button>
                {isOpen && (
                  <div className="mt-3 flex items-center justify-center gap-3 text-[15px] font-serif-i text-[#d4d4d4]">
                    <button onClick={() => onOpen(s)}>{t("Continue")}</button>
                    <span>·</span>
                    <button
                      onClick={() =>
                        onOpen({
                          id: newId(),
                          category: s.category,
                          isAskNow: s.isAskNow,
                          keyword: "",
                          messages: [],
                          created_at: new Date().toISOString(),
                        })
                      }
                    >
                      {t("Start Fresh")}
                    </button>
                  </div>
                )}
                <hr className="reading-divider w-full mt-3" />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
