"""The arbiter. Cross-references the 3 model answers against the classical
passages and distills a single VERIFIED interpretation — keeping only what is
BOTH agreed across the panel AND supported by the source texts. This is the
mechanism that makes the in-house knowledge base more reliable than any one
model: disputed or textually-unsupported claims are dropped or quarantined."""
from __future__ import annotations

from common import env, extract_json, post_json

# The classical source texts are the authority. A card promotes to the live
# reading path when the texts STRONGLY back it (model consensus is a bonus when
# more models are available); partial support additionally needs panel agreement.
# Everything else waits in the review queue.
MIN_CONFIDENCE = 0.72

ARBITER_SYS = (
    "You are the arbiter of dotit's knowledge base. You distill interpretations "
    "that are more reliable than any single AI by keeping ONLY what is both (a) "
    "agreed across the model panel and (b) supported by the classical source "
    "texts. You are conservative: when in doubt, lower confidence and flag for "
    "review. Write the final interpretation in plain language — never name a "
    "text, never use astrological jargon the user wouldn't know."
)


def _arbiter_prompt(topic: str, question: str, panel: list[dict], citations: list[dict]) -> str:
    panel_txt = "\n".join(
        f"[{p['model']}] {p['interpretation']}\n   claims: {'; '.join(p.get('claims', []))}"
        for p in panel
    ) or "(no model answers available)"
    cite_txt = "\n".join(
        f"({i+1}) {c['title']} — {c['location']} [sim {c['similarity']}]\n    {c['excerpt']}"
        for i, c in enumerate(citations)
    ) or "(no classical passages retrieved)"
    return (
        f"TOPIC: {topic}\nQUESTION: {question}\n\n"
        f"MODEL PANEL (independent answers from 3 AIs):\n{panel_txt}\n\n"
        f"CLASSICAL SOURCE PASSAGES (ground truth):\n{cite_txt}\n\n"
        "Distill a JSON knowledge card. Respond ONLY as JSON:\n"
        "{\n"
        '  "interpretation": "<verified, plain-language answer. ONLY claims supported by the '
        'passages and not disputed across the panel. If texts/models disagree, state the reliable '
        'core and omit the rest. No jargon, no text names.>",\n'
        '  "agreement": "unanimous|majority|split",\n'
        '  "classical_support": "strong|partial|none",\n'
        '  "supporting_citations": [<1-based indices of passages that directly support it>],\n'
        '  "confidence": <0.0-1.0>,\n'
        '  "notes": "<one line: what was dropped or disputed, if anything>"\n'
        "}"
    )


def arbitrate(topic: str, question: str, category: str | None,
              panel: list[dict], citations: list[dict]) -> dict:
    key = env("ANTHROPIC_API_KEY")
    model = env("ARBITER_MODEL") or env("ANTHROPIC_MODEL", "claude-opus-4-5")
    data = post_json(
        "https://api.anthropic.com/v1/messages",
        {"model": model, "max_tokens": 1500, "system": ARBITER_SYS,
         "messages": [{"role": "user", "content": _arbiter_prompt(topic, question, panel, citations)}]},
        {"x-api-key": key, "anthropic-version": "2023-06-01"},
    )
    card = extract_json(data["content"][0]["text"])

    agreement = card.get("agreement", "split")
    support = card.get("classical_support", "none")
    confidence = float(card.get("confidence", 0.0))

    idxs = card.get("supporting_citations", []) or []
    chosen = [citations[i - 1] for i in idxs if isinstance(i, int) and 1 <= i <= len(citations)]
    if not chosen:
        chosen = citations[:3]

    # Texts are king: strong textual support + confidence is enough on its own.
    # Partial support also needs cross-model agreement. No support → review.
    verified = confidence >= MIN_CONFIDENCE and (
        support == "strong"
        or (support == "partial" and agreement in ("unanimous", "majority") and confidence >= 0.75)
    )

    return {
        "topic": topic,
        "category": category,
        "question": question,
        "interpretation": card.get("interpretation", "").strip(),
        "model_panel": [{"model": p["model"], "stance": p["interpretation"]} for p in panel],
        "classical_citations": chosen,
        "agreement": agreement,
        "classical_support": support,
        "confidence": round(confidence, 3),
        "status": "verified" if verified else "review",
        "notes": card.get("notes", ""),
    }
