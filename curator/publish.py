"""Publish verified knowledge cards into the reading path.

Exports every status='verified' card from Supabase into rag/knowledge.json
(embedding included), which next.config bundles into /api/chat and lib/rag.ts
retrieves as the TOP-priority grounding — above the raw classical passages.

Usage:  python curator/publish.py     (then commit rag/knowledge.json + push)
"""
from __future__ import annotations

import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from store import fetch_verified

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "rag", "knowledge.json")


def main() -> None:
    cards = fetch_verified()
    records = []
    for c in cards:
        if not c.get("embedding"):
            continue
        records.append({
            "id": c["id"],
            "topic": c.get("topic"),
            "category": c.get("category"),
            "interpretation": c.get("interpretation"),
            "confidence": c.get("confidence"),
            "citations": c.get("classical_citations"),
            "embedding": c["embedding"],
        })
    payload = {"model": "voyage-3.5-lite", "dim": len(records[0]["embedding"]) if records else 1024,
               "records": records}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    mb = os.path.getsize(OUT) / 1e6
    print(f"Published {len(records)} verified card(s) -> rag/knowledge.json ({mb:.2f} MB)")
    print("Next: git add rag/knowledge.json && commit && push  (Vercel redeploys; readings use them)")


if __name__ == "__main__":
    main()
