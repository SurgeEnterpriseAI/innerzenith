"""Append high-value English sources to rag/chunks.jsonl:
  - BPHS English (Santhanam) PDF
  - Three Hundred Important Combinations (B.V. Raman) — archive.org OCR text
Run after rag/ingest.py. Idempotent-ish: rewrites only these source ids.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
PDFS = os.path.join(HERE, "_pdfs")
CHUNKS = os.path.join(HERE, "chunks.jsonl")
CHUNK, OVERLAP = 3200, 400

NEW = [
    {"id": "bphs_en", "title": "Brihat Parashara Hora Shastra (English, Santhanam)", "kind": "pdf", "path": os.path.join(PDFS, "bphs_en.pdf")},
    {"id": "three_hundred", "title": "Three Hundred Important Combinations (B.V. Raman)", "kind": "txt", "path": os.path.join(PDFS, "threehundred.txt")},
]


def clean(t):
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def pdf_text(path):
    from pypdf import PdfReader
    out = []
    for i, p in enumerate(PdfReader(path).pages):
        try:
            t = p.extract_text() or ""
        except Exception:
            t = ""
        if t.strip():
            out.append((f"p.{i+1}", clean(t)))
    return out


def txt_text(path):
    raw = open(path, encoding="utf-8", errors="ignore").read()
    # drop lines that are mostly non-alphabetic OCR noise
    lines = [l for l in raw.split("\n") if sum(c.isalpha() for c in l) >= max(8, len(l) * 0.4)]
    full = clean("\n".join(lines))
    # synthetic page markers every ~2500 chars
    out, i, pg = [], 0, 1
    while i < len(full):
        out.append((f"sec.{pg}", full[i:i + 2500]))
        i += 2500; pg += 1
    return out


def chunk(pages):
    chunks, buf, start = [], "", pages[0][0] if pages else "p.1"
    for loc, text in pages:
        buf += "\n" + text
        while len(buf) >= CHUNK:
            chunks.append({"location": start, "content": buf[:CHUNK].strip()})
            buf = buf[CHUNK - OVERLAP:]; start = loc
    if len(buf.strip()) > 200:
        chunks.append({"location": start, "content": buf.strip()})
    return chunks


def main():
    # keep existing chunks that are NOT from the new sources
    existing = []
    new_ids = {s["id"] for s in NEW}
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
            if not os.path.exists(s["path"]):
                print(f"  missing {s['path']}"); continue
            pages = pdf_text(s["path"]) if s["kind"] == "pdf" else txt_text(s["path"])
            cs = chunk(pages)
            for j, c in enumerate(cs):
                f.write(json.dumps({"id": f"{s['id']}_{j}", "source": s["id"], "title": s["title"],
                                    "tradition": "Vedic", "location": c["location"], "content": c["content"]},
                                   ensure_ascii=False) + "\n")
            added += len(cs)
            print(f"[{s['id']}] +{len(cs)} chunks")
    total = sum(1 for _ in open(CHUNKS, encoding="utf-8"))
    print(f"added {added}; corpus now {total} chunks")


if __name__ == "__main__":
    main()
