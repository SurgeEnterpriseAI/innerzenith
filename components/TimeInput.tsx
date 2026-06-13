"use client";

// Reliable in-app time picker — three native <select> dropdowns (hour /
// minute / AM-PM). Avoids the flaky native <input type="time"> whose
// confirm button is missing or broken on some Android browsers.
// Emits "HH:MM" in 24-hour format.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

export default function TimeInput({
  value,
  onChange,
}: {
  value: string; // "HH:MM" 24h, or ""
  onChange: (v: string) => void;
}) {
  const { t } = useT();
  const parse = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v || "");
    if (!m) return { h12: "", min: "", ap: "AM" };
    let h = parseInt(m[1], 10);
    const ap = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return { h12: String(h12), min: m[2], ap };
  };

  const init = parse(value);
  const [h12, setH12] = useState(init.h12);
  const [min, setMin] = useState(init.min);
  const [ap, setAp] = useState(init.ap);

  useEffect(() => {
    if (h12 === "" || min === "") return;
    let h = parseInt(h12, 10) % 12;
    if (ap === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${min}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h12, min, ap]);

  const sel =
    "bg-[#1f1f1f] border border-[#b3b3b3]/40 focus:border-white outline-none rounded-lg px-3 py-2.5 text-base [color-scheme:dark]";

  return (
    <div className="flex items-center gap-2">
      <select value={h12} onChange={(e) => setH12(e.target.value)} className={sel} aria-label="hour">
        <option value="" disabled>{t("hh")}</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <span className="text-[#b3b3b3]">:</span>
      <select value={min} onChange={(e) => setMin(e.target.value)} className={sel} aria-label="minute">
        <option value="" disabled>{t("mm")}</option>
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select value={ap} onChange={(e) => setAp(e.target.value)} className={sel} aria-label="am/pm">
        <option value="AM">{t("AM")}</option>
        <option value="PM">{t("PM")}</option>
      </select>
    </div>
  );
}
