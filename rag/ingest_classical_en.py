"""Append five clean ENGLISH editions of classical texts to rag/chunks.jsonl.

These are the high-value sources that were missing because the founder's
original links were Devanagari/Sanskrit scans (garbled OCR). For each we
substitute the well-known English translation (archive.org djvu.txt OCR layer,
verified clean: 0% Devanagari, 85-93% ASCII, 80k-145k words):

  - Phaladeepika (Mantreswara)            <- covers IGNCA 6945
  - Brihat Jataka (Varahamihira, Iyer)    <- covers jyotisha.zip flagship
  - Brihat Samhita (Varahamihira, Iyer)   <- covers jyotisha.zip flagship
  - Jataka Parijata Vol I  (Sastri)       <- covers Jataka Parijata
  - Jataka Parijata Vol II (Sastri)       <- covers Jataka Parijata

Raw OCR text lives in rag/_raw/. Idempotent: rewrites only these source ids,
preserving every other chunk already in chunks.jsonl.
Run:  python rag/ingest_classical_en.py   then   python rag/embed_local.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "_raw")
CHUNKS = os.path.join(HERE, "chunks.jsonl")
CHUNK, OVERLAP, PAGE = 3200, 400, 2500

NEW = [
    {"id": "phaladeepika",        "title": "Phaladeepika of Mantreswara (English)",                 "file": "phaladeepika.txt"},
    {"id": "brihat_jataka_en",    "title": "Brihat Jataka of Varahamihira (English, Iyer)",         "file": "brihat_jataka_en.txt"},
    {"id": "brihat_samhita_en",   "title": "Brihat Samhita of Varahamihira (English, Iyer)",        "file": "brihat_samhita_en.txt"},
    {"id": "jataka_parijata_en",  "title": "Jataka Parijata Vol I (V. Subrahmanya Sastri, English)", "file": "jataka_parijata_en_v1.txt"},
    {"id": "jataka_parijata_en2", "title": "Jataka Parijata Vol II (V. Subrahmanya Sastri, English)","file": "jataka_parijata_en_v2.txt"},
]


def clean(t):
    t = t.replace("\x0c", "\n")            # treat form-feeds as paragraph breaks
    t = re.sub(r"-\s*\n\s*", "", t)        # rejoin OCR hyphenated line-breaks (Aya-\nnamsa -> Ayanamsa)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def pages(path):
    """Return [(location, text)] pseudo-pages of ~PAGE chars, dropping OCR-noise
    lines (lines that are mostly non-alphabetic)."""
    raw = open(path, encoding="utf-8", errors="ignore").read()
    lines = [l for l in raw.split("\n")
             if sum(c.isalpha() and c.isascii() for c in l) >= max(8, len(l) * 0.4)]
    full = clean("\n".join(lines))
    out, i, pg = [], 0, 1
    while i < len(full):
        out.append((f"sec.{pg}", full[i:i + PAGE]))
        i += PAGE; pg += 1
    return out


BOILER = ("scanned by google", "google book search", "about google book search",
          "usage guidelines", "public domain book is one", "watermark you see on each file",
          "department of archaeology", "central archaeological")


def is_boilerplate(text):
    low = text.lower()
    return sum(m in low for m in BOILER) >= 2


def chunk(ps):
    chunks, buf, start = [], "", ps[0][0] if ps else "sec.1"
    for loc, text in ps:
        buf += "\n" + text
        while len(buf) >= CHUNK:
            chunks.append({"location": start, "content": buf[:CHUNK].strip()})
            buf = buf[CHUNK - OVERLAP:]; start = loc
    if len(buf.strip()) > 200:
        chunks.append({"location": start, "content": buf.strip()})
    return chunks


def main():
    new_ids = {s["id"] for s in NEW}
    existing = []
    if os.path.exists(CHUNKS):
        for l in open(CHUNKS, encoding="utf-8"):
            o = json.loads(l)
            if o["source"] not in new_ids:
                existing.append(o)
    added = 0
    with open(CHUNKS, "w", encoding="utf-8") as f:
        for o in existing:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
        for s in NEW:
            path = os.path.join(RAW, s["file"])
            if not os.path.exists(path):
                print(f"  MISSING {path}"); continue
            cs = [c for c in chunk(pages(path)) if not is_boilerplate(c["content"])]
            for j, c in enumerate(cs):
                f.write(json.dumps({
                    "id": f"{s['id']}_{j}", "source": s["id"], "title": s["title"],
                    "tradition": "Vedic", "location": c["location"], "content": c["content"],
                }, ensure_ascii=False) + "\n")
            added += len(cs)
            print(f"[{s['id']:20}] +{len(cs)} chunks")
    total = sum(1 for _ in open(CHUNKS, encoding="utf-8"))
    print(f"added {added}; corpus now {total} chunks (was 1197)")


if __name__ == "__main__":
    main()
