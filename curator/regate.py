"""Re-apply the verification gate to existing cards after tuning MIN_CONFIDENCE
in arbiter.py — WITHOUT re-running the 3-model panel (the arbiter's agreement /
classical_support / confidence judgments are already stored on each card).

Local mode only (cards.jsonl). Preserves any human-set decision (reviewed_at).
Usage:  python curator/regate.py   then   python curator/publish.py
"""
from __future__ import annotations

import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arbiter import MIN_CONFIDENCE, verdict  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(HERE, "cards.jsonl")


def main() -> None:
    rows = [json.loads(l) for l in open(CARDS, encoding="utf-8") if l.strip()]
    changed = 0
    for r in rows:
        if r.get("reviewed_at"):  # never override a human decision
            continue
        new = verdict(r.get("agreement", "split"), r.get("classical_support", "none"),
                      float(r.get("confidence", 0)))
        if new != r.get("status"):
            print(f"  {r['status']:8} → {new:8}  conf={r['confidence']} "
                  f"{r['agreement']}/{r['classical_support']}  {r['topic'][:48]}")
            r["status"] = new
            changed += 1
    with open(CARDS, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    v = sum(1 for r in rows if r["status"] == "verified")
    print(f"\nRe-gated at MIN_CONFIDENCE={MIN_CONFIDENCE}: {changed} changed. "
          f"Now {v} verified / {len(rows) - v} review of {len(rows)}.")
    print("Next: python curator/publish.py  (then commit rag/knowledge.json)")


if __name__ == "__main__":
    main()
