"""Curator runner. For each topic: poll the 3-model panel, retrieve the
classical ground truth, arbitrate into a verified-or-review card, and store it.

Usage:
  python curator/curate.py                 # run the seed topics.json
  python curator/curate.py "Rahu in the 10th house" "What does Rahu in the 10th mean for career?"

Reads keys from .env.local: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
VOYAGE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
Safe to re-run — cards upsert, and human-reviewed cards are never overwritten.
"""
from __future__ import annotations

import json
import os
import sys
import time

try:  # Windows consoles default to cp1252 and crash on →/•/… — force UTF-8.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from arbiter import arbitrate
from panel import run_panel
from retrieval import classical_passages
from store import counts, save_card

HERE = os.path.dirname(os.path.abspath(__file__))


def curate_one(topic: str, question: str, category: str | None = None) -> dict:
    print(f"\n• {topic}")
    print("   panel…")
    panel = run_panel(topic, question)
    print(f"   retrieving classical passages…")
    citations = classical_passages(f"{topic}. {question}", k=6)
    print(f"   arbitrating ({len(panel)} models, {len(citations)} passages)…")
    card = arbitrate(topic, question, category, panel, citations)
    result = save_card(card)
    print(f"   → {card['status'].upper()}  conf={card['confidence']}  "
          f"agree={card['agreement']}  support={card['classical_support']}  [{result}]")
    return card


def main() -> None:
    if len(sys.argv) >= 3:
        topics = [{"topic": sys.argv[1], "question": sys.argv[2], "category": None}]
    else:
        topics = json.load(open(os.path.join(HERE, "topics.json"), encoding="utf-8"))

    print(f"Curating {len(topics)} topic(s)…")
    verified = review = failed = 0
    for i, t in enumerate(topics):
        try:
            card = curate_one(t["topic"], t["question"], t.get("category"))
            if card["status"] == "verified":
                verified += 1
            else:
                review += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"   ✗ failed: {str(e)[:160]}")
        if i < len(topics) - 1:
            time.sleep(3.0)  # pace to respect free-tier model rate limits

    print(f"\nDone. verified={verified}  review={review}  failed={failed}")
    try:
        print("Knowledge base totals:", counts())
    except Exception:
        pass
    print("\nReview pending cards in Supabase → Table editor → knowledge_cards "
          "(set status to 'verified' or 'rejected'). Then run: python curator/publish.py")


if __name__ == "__main__":
    main()
