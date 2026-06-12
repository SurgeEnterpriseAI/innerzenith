"""Persist cards. Two backends, auto-selected:

  • Supabase  — when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are in
                .env.local (the workbench/review-queue/audit home for the KB).
  • local     — otherwise, a curator/cards.jsonl file, so the curator runs even
                before the Supabase service_role key is added. Same shape; the
                pipeline upgrades to Supabase automatically once the key lands.

Both are read-first: a human review decision (verified/rejected) is never
silently overwritten by a re-run.
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from common import env, voyage_embed

HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL = os.path.join(HERE, "cards.jsonl")


def _use_supabase() -> bool:
    return bool(env("NEXT_PUBLIC_SUPABASE_URL") and env("SUPABASE_SERVICE_ROLE_KEY"))


def _card_id(topic: str, question: str) -> str:
    return hashlib.md5(f"{topic}||{question}".encode()).hexdigest()[:16]


# ── Supabase backend ────────────────────────────────────────────────────────

def _req(method: str, path: str, body=None, prefer: str | None = None) -> tuple[int, str]:
    url = env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="ignore")


def _sb_existing(topic: str, question: str) -> dict | None:
    qs = urllib.parse.urlencode({"topic": f"eq.{topic}", "question": f"eq.{question}",
                                 "select": "id,status,reviewed_at,version"})
    code, txt = _req("GET", f"/rest/v1/knowledge_cards?{qs}")
    rows = json.loads(txt) if code == 200 and txt else []
    return rows[0] if rows else None


def _sb_save(card: dict) -> str:
    prior = _sb_existing(card["topic"], card["question"])
    if prior and prior.get("reviewed_at"):
        return "kept (human-reviewed)"
    if prior:
        card = {**card, "version": (prior.get("version") or 1) + 1}
        code, txt = _req("PATCH", f"/rest/v1/knowledge_cards?id=eq.{prior['id']}", card, prefer="return=minimal")
        if code not in (200, 204):
            raise RuntimeError(f"update failed {code}: {txt[:200]}")
        return "updated"
    code, txt = _req("POST", "/rest/v1/knowledge_cards", card, prefer="return=minimal")
    if code not in (200, 201, 204):
        raise RuntimeError(f"insert failed {code}: {txt[:200]}")
    return "inserted"


def _sb_fetch_verified() -> list[dict]:
    qs = urllib.parse.urlencode({"status": "eq.verified",
                                 "select": "id,topic,category,question,interpretation,classical_citations,confidence,embedding"})
    code, txt = _req("GET", f"/rest/v1/knowledge_cards?{qs}")
    if code != 200:
        raise RuntimeError(f"fetch verified failed {code}: {txt[:200]}")
    return json.loads(txt)


# ── Local backend ───────────────────────────────────────────────────────────

def _local_all() -> list[dict]:
    if not os.path.exists(LOCAL):
        return []
    return [json.loads(l) for l in open(LOCAL, encoding="utf-8") if l.strip()]


def _local_write(rows: list[dict]) -> None:
    with open(LOCAL, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _local_save(card: dict) -> str:
    rows = _local_all()
    cid = _card_id(card["topic"], card["question"])
    card = {**card, "id": cid}
    for i, r in enumerate(rows):
        if r.get("id") == cid:
            if r.get("reviewed_at"):
                return "kept (human-reviewed)"
            card["version"] = (r.get("version") or 1) + 1
            rows[i] = card
            _local_write(rows)
            return "updated"
    card.setdefault("version", 1)
    rows.append(card)
    _local_write(rows)
    return "inserted"


def _local_fetch_verified() -> list[dict]:
    return [r for r in _local_all() if r.get("status") == "verified"]


# ── Public API ──────────────────────────────────────────────────────────────

def save_card(card: dict) -> str:
    card = dict(card)
    card["embedding"] = voyage_embed(f"{card['topic']}. {card['interpretation']}", "document")
    return _sb_save(card) if _use_supabase() else _local_save(card)


def fetch_verified() -> list[dict]:
    return _sb_fetch_verified() if _use_supabase() else _local_fetch_verified()


def counts() -> dict:
    if _use_supabase():
        out = {}
        for st in ("review", "verified", "rejected"):
            code, txt = _req("GET", f"/rest/v1/knowledge_cards?status=eq.{st}&select=id")
            out[st] = len(json.loads(txt)) if code == 200 and txt else 0
        return out
    rows = _local_all()
    return {st: sum(1 for r in rows if r.get("status") == st) for st in ("review", "verified", "rejected")}


def backend() -> str:
    return "supabase" if _use_supabase() else f"local ({LOCAL})"
