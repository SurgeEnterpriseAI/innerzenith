"""Embed rag/chunks.jsonl via Voyage AI into a self-contained file vector
store: rag/embeddings.json. No database — at query time the app loads this
file and does an in-process cosine scan (710 vectors = sub-millisecond).

Respects Voyage free-tier limits (3 RPM / 10K TPM): small batches, paced
requests, 429 backoff, and resumable (skips already-embedded ids on restart).

Reads VOYAGE_API_KEY from the repo-root .env.local.
Usage:  python rag/embed_local.py
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHUNKS = os.path.join(HERE, "chunks.jsonl")
OUT = os.path.join(HERE, "embeddings.json")
MODEL = "voyage-3.5-lite"
BATCH = 64          # paid tier — large batches OK
DELAY = 0.3         # paid tier — high RPM; small courtesy gap only
ROUND = 5


def voyage_key():
    for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        if line.startswith("VOYAGE_API_KEY="):
            return line.split("=", 1)[1].strip()
    return None


def embed(texts, key):
    body = json.dumps({"input": texts, "model": MODEL, "input_type": "document"}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(
                "https://api.voyageai.com/v1/embeddings", data=body,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return [d["embedding"] for d in json.loads(r.read())["data"]]
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"    429 — backing off {wait}s")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("giving up after repeated 429s")


def load_existing():
    if os.path.exists(OUT):
        try:
            data = json.load(open(OUT, encoding="utf-8"))
            return {r["id"]: r for r in data.get("records", [])}
        except Exception:
            pass
    return {}


def save(records):
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"model": MODEL, "dim": len(records[0]["embedding"]) if records else 0,
                   "records": records}, f, ensure_ascii=False)


def main():
    key = voyage_key()
    if not key:
        print("VOYAGE_API_KEY missing in .env.local")
        return
    chunks = [json.loads(l) for l in open(CHUNKS, encoding="utf-8")]
    have = load_existing()
    todo = [c for c in chunks if c["id"] not in have]
    print(f"{len(chunks)} chunks, {len(have)} already embedded, {len(todo)} to do")
    records = list(have.values())
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        embs = embed([c["content"] for c in batch], key)
        for c, e in zip(batch, embs):
            records.append({
                "id": c["id"], "source": c["source"], "title": c.get("title"),
                "location": c.get("location"), "content": c["content"],
                "embedding": [round(x, ROUND) for x in e],
            })
        save(records)  # incremental — resumable
        print(f"  {len(records)}/{len(chunks)}")
        time.sleep(DELAY)
    mb = os.path.getsize(OUT) / 1e6
    print(f"DONE: {len(records)} vectors → {OUT} ({mb:.1f} MB)")


if __name__ == "__main__":
    main()
