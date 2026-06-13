"""Ingest the founder's Google Drive folder of source texts into the RAG corpus.

The folder (1IAPL4EEkigP2TqRVIdCfMYExegttalbX) holds ~29 PDFs. ~13 are already
in the corpus (PVR, BPHS, Three-Hundred, Light-on-Life, Phaladeepika, Saravali,
Uttara, Brihat Jataka/Samhita) — those are SKIPPED. The rest fill the gaps for
the OTHER three systems + Prashna (KP Readers + Krishnamurti Padhdhati, Joey Yap
BaZi, Zi Wei Dou Shu, Prasna Marga, Tajika) which the corpus currently lacks.

ACCESS: the folder must be reachable. Either
  (a) set the folder sharing to "Anyone with the link", then this script's
      gdown step downloads it automatically, OR
  (b) drop the PDFs into rag/_drive/ manually.

Run:  python rag/ingest_drive.py     then     python rag/embed_local.py
"""
from __future__ import annotations

import json, os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
DRIVE = os.path.join(HERE, "_drive")
CHUNKS = os.path.join(HERE, "chunks.jsonl")
FOLDER_URL = "https://drive.google.com/drive/folders/1IAPL4EEkigP2TqRVIdCfMYExegttalbX"
CHUNK, OVERLAP, PAGE = 3200, 400, 2500

# Filenames already represented in the corpus → skip (substring match, lower).
SKIP = [
    "three-hundred", "light_on_life", "book1-for-cd", "book2-for-cd",
    "bphs", "6945", "uttarakaalaamruta", "saravali", "brihat jataka",
    "brihat samhita", "jataka-parijata", "hora shastra",
]

# Title fragment → (source_id, nice title) for the NEW texts. Anything not
# matched here gets an auto id from its filename.
NEW = [
    ("krishnamurti-padhdhati", "kp_padhdhati", "Krishnamurti Padhdhati Vol I (KP)"),
    ("kp reader_1", "kp_reader_1", "KP Reader 1 — Casting the Horoscope"),
    ("kp reader_2", "kp_reader_2", "KP Reader 2 — Fundamental Principles of Astrology"),
    ("kp reader_3", "kp_reader_3", "KP Reader 3 — Predictive Stellar Astrology"),
    ("kp reader_4", "kp_reader_4", "KP Reader 4 — Marriage, Married Life & Children"),
    ("kp reader_5", "kp_reader_5", "KP Reader 5 — Transits"),
    ("kp reader_6", "kp_reader_6", "KP Reader 6 — Horary Astrology"),
    ("destiny code (book 1)", "bazi_destiny_1", "BaZi: The Destiny Code, Book 1 (Joey Yap)"),
    ("destiny code revealed (book 2)", "bazi_destiny_2", "BaZi: The Destiny Code Revealed, Book 2 (Joey Yap)"),
    ("enter-the-10-gods", "bazi_10gods_enter", "The Power of X: Enter the 10 Gods (Joey Yap)"),
    ("qualifying-the-10-gods", "bazi_10gods_qual", "The Power of X: Qualifying the 10 Gods (Joey Yap)"),
    ("ziweidoushu", "ziwei_doushu", "Zi Wei Dou Shu (Purple Star Astrology)"),
    ("prasna-marga-ii", "prasna_marga_2", "Prasna Marga Vol II (B.V. Raman)"),
    ("prasna-marga-pdf", "prasna_marga_1", "Prasna Marga (B.V. Raman)"),
    ("tajika_nilakanthi", "tajika_nilakanthi", "Tajika Nilakanthi (Hindi)"),
]


def clean(t):
    t = t.replace("\x0c", "\n")
    t = re.sub(r"-\s*\n\s*", "", t)            # rejoin hyphenated line breaks
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def pdf_pages(path):
    from pypdf import PdfReader
    out = []
    try:
        reader = PdfReader(path)
    except Exception as e:
        print(f"    cannot open: {e}"); return out
    for i, p in enumerate(reader.pages):
        try:
            txt = p.extract_text() or ""
        except Exception:
            txt = ""
        # keep lines that are mostly ASCII letters (drop OCR/scan noise)
        lines = [l for l in txt.split("\n")
                 if sum(c.isalpha() and c.isascii() for c in l) >= max(6, len(l) * 0.4)]
        c = clean("\n".join(lines))
        if c:
            out.append((f"p.{i+1}", c))
    return out


def english_ratio(pages):
    text = " ".join(t for _, t in pages)[:200000]
    words = re.findall(r"[A-Za-z]{2,}", text)
    return len(words)


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


def source_for(fname):
    low = fname.lower()
    if any(s in low for s in SKIP):
        return None
    for frag, sid, title in NEW:
        if frag in low:
            return sid, title
    sid = re.sub(r"[^a-z0-9]+", "_", os.path.splitext(low)[0])[:40]
    return sid, os.path.splitext(fname)[0]


def try_download():
    if not os.path.isdir(DRIVE) or not [f for f in os.listdir(DRIVE) if f.lower().endswith(".pdf")]:
        try:
            import gdown
            os.makedirs(DRIVE, exist_ok=True)
            print("downloading folder via gdown…")
            gdown.download_folder(url=FOLDER_URL, output=DRIVE, quiet=True, use_cookies=False)
        except Exception as e:
            print(f"gdown failed ({str(e)[:80]}). Put the PDFs in rag/_drive/ manually.")


def main():
    try_download()
    pdfs = sorted(f for f in os.listdir(DRIVE) if f.lower().endswith(".pdf")) if os.path.isdir(DRIVE) else []
    if not pdfs:
        print("No PDFs in rag/_drive/. Make the Drive folder public or drop files there."); return

    # keep existing chunks that aren't from sources we're (re)ingesting
    new_ids = set()
    plan = []
    for f in pdfs:
        s = source_for(f)
        if s:
            plan.append((f, s[0], s[1])); new_ids.add(s[0])
        else:
            print(f"  skip (already in corpus): {f}")

    existing = [json.loads(l) for l in open(CHUNKS, encoding="utf-8")] if os.path.exists(CHUNKS) else []
    existing = [o for o in existing if o.get("source") not in new_ids]

    added = 0
    with open(CHUNKS, "w", encoding="utf-8") as out:
        for o in existing:
            out.write(json.dumps(o, ensure_ascii=False) + "\n")
        for fname, sid, title in plan:
            pages = pdf_pages(os.path.join(DRIVE, fname))
            words = english_ratio(pages)
            if words < 2000:
                print(f"  [{sid}] {title}: only {words} english words (scanned/low-text) — SKIPPED")
                continue
            cs = chunk(pages)
            for j, c in enumerate(cs):
                out.write(json.dumps({"id": f"{sid}_{j}", "source": sid, "title": title,
                                      "tradition": "mixed", "location": c["location"],
                                      "content": c["content"]}, ensure_ascii=False) + "\n")
            added += len(cs)
            print(f"  [{sid}] {title}: +{len(cs)} chunks ({words} words)")
    total = sum(1 for _ in open(CHUNKS, encoding="utf-8"))
    print(f"\nadded {added} chunks; corpus now {total}. Next: python rag/embed_local.py")


if __name__ == "__main__":
    main()
