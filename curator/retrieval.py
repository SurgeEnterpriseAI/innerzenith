"""Retrieve the classical-text passages relevant to a topic — the curator's
ground truth. Reuses the same rag/embeddings.json the app reads, so the
arbiter is grounded in exactly the corpus that powers live readings."""
from __future__ import annotations

import json
import os

from common import cosine, voyage_embed

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STORE = os.path.join(ROOT, "rag", "embeddings.json")

_records: list[dict] | None = None


def _load() -> list[dict]:
    global _records
    if _records is None:
        _records = json.load(open(STORE, encoding="utf-8")).get("records", [])
    return _records


def classical_passages(query: str, k: int = 6, min_sim: float = 0.30) -> list[dict]:
    """Top-k classical passages for the query, each with title/location/excerpt/similarity."""
    store = _load()
    q = voyage_embed(query, input_type="query")
    if not q:
        return []
    scored = []
    for r in store:
        s = cosine(q, r["embedding"])
        if s >= min_sim:
            scored.append((s, r))
    scored.sort(key=lambda x: -x[0])
    out = []
    for s, r in scored[:k]:
        out.append({
            "title": r.get("title"),
            "location": r.get("location"),
            "excerpt": (r.get("content") or "")[:900],
            "similarity": round(s, 3),
        })
    return out
