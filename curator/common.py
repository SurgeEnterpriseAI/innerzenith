"""Shared helpers for the curator agent — env loading, HTTP, embeddings, cosine.
Stdlib only (urllib), matching rag/embed_local.py. Runs LOCALLY; reads keys from
the repo-root .env.local. None of these keys ever ship to Vercel or git."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENV = os.path.join(ROOT, ".env.local")

_cache: dict | None = None


def env(key: str, default: str | None = None) -> str | None:
    """Read a var from .env.local (preferred) then the process env."""
    global _cache
    if _cache is None:
        _cache = {}
        if os.path.exists(ENV):
            for line in open(ENV, encoding="utf-8"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                _cache[k.strip()] = v.strip().strip('"').strip("'")
    return _cache.get(key) or os.environ.get(key) or default


def post_json(url: str, payload: dict, headers: dict, timeout: int = 120, retries: int = 4) -> dict:
    body = json.dumps(payload).encode()
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers={**headers, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="ignore")[:400]
            last = f"HTTP {e.code}: {detail}"
            if e.code in (429, 500, 502, 503, 529):
                wait = 5 * (attempt + 1)
                print(f"      {e.code} — retry in {wait}s")
                time.sleep(wait)
                continue
            raise RuntimeError(last) from None
        except (urllib.error.URLError, TimeoutError) as e:
            last = str(e)
            time.sleep(4 * (attempt + 1))
    raise RuntimeError(f"giving up: {last}")


def voyage_embed(text: str, input_type: str = "document") -> list[float] | None:
    key = env("VOYAGE_API_KEY")
    if not key:
        return None
    data = post_json(
        "https://api.voyageai.com/v1/embeddings",
        {"input": [text[:8000]], "model": "voyage-3.5-lite", "input_type": input_type},
        {"Authorization": f"Bearer {key}"},
    )
    return data["data"][0]["embedding"]


def cosine(a: list[float], b: list[float]) -> float:
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    return dot / ((na ** 0.5) * (nb ** 0.5)) if na and nb else 0.0


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model response (handles ```json fences)."""
    t = text.strip()
    if "```" in t:
        # take the largest fenced block
        parts = t.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("{"):
                t = p
                break
    start, depth = t.find("{"), 0
    if start < 0:
        raise ValueError("no JSON object in response")
    for i in range(start, len(t)):
        if t[i] == "{":
            depth += 1
        elif t[i] == "}":
            depth -= 1
            if depth == 0:
                return json.loads(t[start : i + 1])
    raise ValueError("unbalanced JSON in response")
