"""The 3-model panel. Each foundation model answers the topic INDEPENDENTLY
from its own training — they do NOT see the classical texts. The arbiter later
checks which of their claims the texts actually support. That gap is how the
in-house knowledge base becomes more accurate than any single model."""
from __future__ import annotations

from common import env, extract_json, post_json

PANEL_SYS = (
    "You are a master of classical Vedic astrology (Jyotish) and the wider "
    "predictive traditions. Answer with precise, classical, specific "
    "interpretations — name concrete effects, conditions and tendencies. "
    "Avoid hedging and generic horoscope language."
)


def _prompt(topic: str, question: str) -> str:
    return (
        f"Topic: {topic}\nQuestion: {question}\n\n"
        "Give your most accurate interpretation grounded in classical principles. "
        'Respond ONLY as JSON: {"interpretation": "<3-6 sentence plain answer>", '
        '"claims": ["<specific falsifiable claim>", "..."]}'
    )


def ask_claude(topic: str, question: str) -> dict:
    key = env("ANTHROPIC_API_KEY")
    model = env("ANTHROPIC_MODEL", "claude-opus-4-5")
    data = post_json(
        "https://api.anthropic.com/v1/messages",
        {"model": model, "max_tokens": 1024, "system": PANEL_SYS,
         "messages": [{"role": "user", "content": _prompt(topic, question)}]},
        {"x-api-key": key, "anthropic-version": "2023-06-01"},
    )
    return extract_json(data["content"][0]["text"])


def ask_openai(topic: str, question: str) -> dict:
    key = env("OPENAI_API_KEY")
    model = env("OPENAI_MODEL", "gpt-4o")
    data = post_json(
        "https://api.openai.com/v1/chat/completions",
        {"model": model, "temperature": 0.4,
         "messages": [{"role": "system", "content": PANEL_SYS},
                      {"role": "user", "content": _prompt(topic, question)}]},
        {"Authorization": f"Bearer {key}"},
    )
    return extract_json(data["choices"][0]["message"]["content"])


def ask_gemini(topic: str, question: str) -> dict:
    key = env("GEMINI_API_KEY") or env("GOOGLE_API_KEY")
    model = env("GEMINI_MODEL", "gemini-2.0-flash")
    data = post_json(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
        {"contents": [{"parts": [{"text": PANEL_SYS + "\n\n" + _prompt(topic, question)}]}],
         "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1024}},
        {},
    )
    return extract_json(data["candidates"][0]["content"]["parts"][0]["text"])


PANELISTS = [("claude", ask_claude), ("gpt", ask_openai), ("gemini", ask_gemini)]


def run_panel(topic: str, question: str) -> list[dict]:
    """Return [{model, interpretation, claims}] for each model that answered.
    A model that errors or has no key is skipped (logged), so the panel still
    runs with whatever models are available."""
    stances = []
    for name, fn in PANELISTS:
        try:
            ans = fn(topic, question)
            stances.append({"model": name, "interpretation": ans.get("interpretation", ""),
                            "claims": ans.get("claims", [])})
            print(f"      [{name}] ok")
        except Exception as e:  # noqa: BLE001 — one model failing must not abort
            print(f"      [{name}] skipped: {str(e)[:120]}")
    return stances
