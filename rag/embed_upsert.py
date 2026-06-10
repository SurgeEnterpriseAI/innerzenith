"""Embed rag/chunks.jsonl via Voyage AI and upsert into Supabase pgvector.

One-time (re-run when the corpus changes). Reads credentials from the repo
root .env.local:
  VOYAGE_API_KEY
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Usage:  python rag/embed_upsert.py
"""

from __future__ import annotations

import json
import os
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHUNKS = os.path.join(HERE, "chunks.jsonl")
MODEL = "voyage-3.5-lite"   # 1024-dim, matches pgvector_schema.sql
BATCH = 64


def load_env():
    env = {}
    try:
        for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env


def voyage_embed(texts, api_key):
    body = json.dumps({"input": texts, "model": MODEL, "input_type": "document"}).encode()
    req = urllib.request.Request(
        "https://api.voyageai.com/v1/embeddings",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    return [d["embedding"] for d in data["data"]]


def supabase_upsert(rows, url, key):
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/knowledge_chunks?on_conflict=id",
        data=body,
        headers={
            "apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    urllib.request.urlopen(req, timeout=120).read()


def main():
    env = load_env()
    vkey = env.get("VOYAGE_API_KEY")
    surl = env.get("NEXT_PUBLIC_SUPABASE_URL")
    skey = env.get("SUPABASE_SERVICE_ROLE_KEY")
    missing = [k for k, v in [("VOYAGE_API_KEY", vkey),
                              ("NEXT_PUBLIC_SUPABASE_URL", surl),
                              ("SUPABASE_SERVICE_ROLE_KEY", skey)] if not v]
    if missing:
        print("Missing in .env.local:", ", ".join(missing))
        return

    chunks = [json.loads(l) for l in open(CHUNKS, encoding="utf-8")]
    print(f"{len(chunks)} chunks to embed + upsert via {MODEL}")
    done = 0
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i:i + BATCH]
        embs = voyage_embed([c["content"] for c in batch], vkey)
        rows = [{
            "id": c["id"], "source": c["source"], "title": c.get("title"),
            "tradition": c.get("tradition", "Vedic"), "location": c.get("location"),
            "content": c["content"], "embedding": e,
        } for c, e in zip(batch, embs)]
        supabase_upsert(rows, surl, skey)
        done += len(batch)
        print(f"  {done}/{len(chunks)}")
        time.sleep(0.3)  # gentle on rate limits
    print("Done.")


if __name__ == "__main__":
    main()
