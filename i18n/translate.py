"""Generate UI translations for all 100 languages.

Collects every English UI string (t("...") literals across the app, plus the
indirect ones: onboarding steps, the Ask Now opening, category labels, fidelity
labels), then asks Claude to translate the whole set into each locale. Writes
lib/i18n/translations.json = { locale: { english: translated } }.

t() falls back to the English key when a translation is missing, so a partial
run never breaks the app. Re-runnable: keeps existing locales, fills gaps.

Run:  python i18n/translate.py            (all locales)
      python i18n/translate.py hi-IN es-ES   (just these)
"""
from __future__ import annotations

import json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "curator"))
from common import env, extract_json, post_json  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "lib", "i18n", "translations.json")


def read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()


def collect_strings() -> list[str]:
    strings: set[str] = set()
    # 1. t("...") and t('...') literals across components + lib
    files = []
    for d in ("components", "lib"):
        for root, _, names in os.walk(os.path.join(ROOT, d)):
            for n in names:
                if n.endswith((".tsx", ".ts")):
                    files.append(os.path.join(root, n))
    lit = re.compile(r"\bt\(\s*(\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*')")
    for f in files:
        for m in lit.finditer(open(f, encoding="utf-8").read()):
            raw = m.group(1)
            try:
                strings.add(json.loads(raw) if raw[0] == '"' else json.loads('"' + raw[1:-1].replace('"', '\\"') + '"'))
            except Exception:
                pass
    # 2. onboarding steps (title/sub passed via t(s.title))
    ob = read("components/Onboarding.tsx")
    for m in re.finditer(r'(?:title|sub):\s*"((?:\\.|[^"\\])*)"', ob):
        strings.add(json.loads('"' + m.group(1) + '"'))
    # 3. Ask Now opening (the OPENING backtick block)
    m = re.search(r"const OPENING = `([^`]*)`", read("components/AskNow.tsx"), re.S)
    if m:
        strings.add(m.group(1).strip())
    # 4. category labels + titles
    cat = read("lib/categories.ts")
    for m in re.finditer(r'(?:title|label):\s*"((?:\\.|[^"\\])*)"', cat):
        strings.add(json.loads('"' + m.group(1) + '"'))
    # 5. fidelity labels
    strings.update(["Complete", "High (approx time)", "Macro (no birth time)", "Session"])
    return sorted(s for s in strings if s and len(s) > 0)


def languages() -> list[tuple[str, str, str]]:
    js = read("lib/languages.ts")
    out = []
    for m in re.finditer(r'\{\s*code:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*native:\s*"([^"]*)"', js):
        out.append((m.group(1), m.group(2), m.group(3)))
    return out


CHUNK = 12  # small batches → small JSON → far fewer delimiter/escape errors


def _translate_chunk(chunk: list[str], name: str, native: str) -> dict:
    key = env("ANTHROPIC_API_KEY")
    model = env("ANTHROPIC_MODEL", "claude-opus-4-5")
    src = {s: s for s in chunk}
    prompt = (
        f"Translate the VALUES of this JSON object into {name} ({native}) for a calm, warm "
        f"astrology wellness app UI. Rules: keep every KEY byte-for-byte identical (keys are the "
        f"English source — never change them). Translate each value into natural, friendly {name} "
        f"as a native speaker would say it in an app. Preserve placeholders like {{n}} exactly. "
        f"Output STRICTLY valid JSON: escape any double-quote inside a value as \\\", and write any "
        f"newline inside a value as \\n (never a literal line break). Return ONLY the JSON object.\n\n"
        + json.dumps(src, ensure_ascii=False)
    )
    for attempt in range(3):
        data = post_json(
            "https://api.anthropic.com/v1/messages",
            {"model": model, "max_tokens": 4000, "messages": [{"role": "user", "content": prompt}]},
            {"x-api-key": key, "anthropic-version": "2023-06-01"},
        )
        try:
            out = extract_json(data["content"][0]["text"])
            return {k: v for k, v in out.items() if k in src and isinstance(v, str) and v.strip() and v != k}
        except Exception:
            if attempt == 2:
                return {}  # give up on this chunk; its strings fall back to English
    return {}


def translate(strings: list[str], name: str, native: str) -> dict:
    result: dict = {}
    for i in range(0, len(strings), CHUNK):
        result.update(_translate_chunk(strings[i : i + CHUNK], name, native))
    if not result:
        raise RuntimeError("all chunks failed")
    return result


def main():
    strings = collect_strings()
    print(f"collected {len(strings)} UI strings")
    langs = languages()
    only = set(sys.argv[1:])
    existing = {}
    if os.path.exists(OUT):
        try:
            existing = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            pass
    done = skipped = failed = 0
    for code, name, native in langs:
        if code.split("-")[0] == "en":
            continue
        if only and code not in only:
            continue
        have = existing.get(code, {})
        # Delta: translate only the strings this locale is missing (new strings,
        # or everything for a locale that failed earlier).
        missing = [s for s in strings if s not in have]
        if not missing:
            skipped += 1
            continue
        try:
            new = translate(missing, name, native)
            existing.setdefault(code, {}).update(new)
            json.dump(existing, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
            done += 1
            print(f"  [{code}] {name}: +{len(new)} ({len(existing[code])} total)")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  [{code}] {name}: FAILED {str(e)[:120]}")
        time.sleep(0.3)
    print(f"done={done} skipped={skipped} failed={failed}; wrote {OUT}")


if __name__ == "__main__":
    main()
