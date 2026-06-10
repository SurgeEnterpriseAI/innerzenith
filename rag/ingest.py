"""RAG ingestion (Stage 11.1) — download classical texts, extract text, chunk.

Produces rag/chunks.jsonl: one JSON object per passage with {id, source,
title, location, content}. Text-based PDFs extract directly; scanned ones
are detected (near-empty text) and flagged for a separate OCR pass.

Usage:  python rag/ingest.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, "_pdfs")
OUT = os.path.join(HERE, "chunks.jsonl")

CHUNK_CHARS = 3200       # ~800 tokens
OVERLAP = 400


def download(url: str, path: str) -> bool:
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "dotit-rag/1.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
            f.write(r.read())
        return os.path.getsize(path) > 10000
    except Exception as e:
        print(f"  download failed: {e}")
        return False


def extract_pages(path: str):
    from pypdf import PdfReader
    try:
        reader = PdfReader(path)
    except Exception as e:
        print(f"  cannot read pdf: {e}")
        return []
    pages = []
    for i, p in enumerate(reader.pages):
        try:
            t = p.extract_text() or ""
        except Exception:
            t = ""
        pages.append((i + 1, t))
    return pages


def clean(t: str) -> str:
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def chunk_pages(pages, src):
    # accumulate text across pages, splitting into overlapping windows
    chunks = []
    buf = ""
    buf_start = pages[0][0] if pages else 1
    for pageno, text in pages:
        text = clean(text)
        if not text:
            continue
        buf += f"\n{text}"
        while len(buf) >= CHUNK_CHARS:
            piece = buf[:CHUNK_CHARS]
            chunks.append({"location": f"p.{buf_start}", "content": piece.strip()})
            buf = buf[CHUNK_CHARS - OVERLAP:]
            buf_start = pageno
    if buf.strip() and len(buf.strip()) > 200:
        chunks.append({"location": f"p.{buf_start}", "content": buf.strip()})
    return chunks


def main():
    os.makedirs(TMP, exist_ok=True)
    sources = json.load(open(os.path.join(HERE, "sources.json")))
    only = sys.argv[1:] or None
    total = 0
    scanned_flagged = []
    with open(OUT, "w", encoding="utf-8") as out:
        for s in sources:
            if only and s["id"] not in only:
                continue
            if not s["url"].lower().endswith(".pdf"):
                print(f"[skip non-pdf] {s['id']}")
                continue
            print(f"[{s['id']}] {s['title']}")
            path = os.path.join(TMP, s["id"] + ".pdf")
            if not download(s["url"], path):
                continue
            pages = extract_pages(path)
            chars = sum(len(t) for _, t in pages)
            if not pages or chars < 2000:
                print(f"  → looks scanned/empty ({chars} chars). Flagged for OCR.")
                scanned_flagged.append(s["id"])
                continue
            chunks = chunk_pages(pages, s)
            for j, c in enumerate(chunks):
                out.write(json.dumps({
                    "id": f"{s['id']}_{j}",
                    "source": s["id"],
                    "title": s["title"],
                    "tradition": s.get("tradition", "Vedic"),
                    "location": c["location"],
                    "content": c["content"],
                }, ensure_ascii=False) + "\n")
            total += len(chunks)
            print(f"  → {len(chunks)} chunks ({chars} chars, {len(pages)} pages)")
    print(f"\nTOTAL chunks: {total} → {OUT}")
    if scanned_flagged:
        print(f"Need OCR (separate pass): {scanned_flagged}")


if __name__ == "__main__":
    main()
