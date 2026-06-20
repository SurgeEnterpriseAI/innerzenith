"""Stage 6.2 — Cached AI semantic fields.

Pre-computed, highly compressed strings injected into the AI context
instead of raw astronomical data. The LLM reads named patterns, not numbers.
"""

from __future__ import annotations

from .constants import SIGNS
from .vedic import sign_index, house_from, nth_sign


def build_cache_keys(vedic: dict, bazi_dma: dict, bazi_pillars: dict,
                     ziwei: dict, dasha_current: dict, yogas: list,
                     ashtakavarga: dict, sade_sati: dict,
                     luck_pillars: dict | None = None, age: float | None = None,
                     ten_gods: dict | None = None,
                     branch_interactions: dict | None = None) -> dict:
    # yoga strings
    yoga_strings = [
        f"{y['name']} {y.get('strength','')}".strip() + (" Mitigated" if y.get("mitigated") else "")
        for y in yogas
    ]
    parivartana = [f"{'-'.join(y['components'])} exchange" for y in yogas
                   if y["name"] == "Parivartana Yoga"]

    # active period snapshot — luck pillar is now the AGE-appropriate pillar,
    # not the day-master placeholder.
    snapshot = {
        "vedic_dasha": f"{dasha_current.get('current_maha')}-{dasha_current.get('current_antar')}",
        "bazi_luck_pillar": _current_luck(luck_pillars, age, bazi_pillars),
        "ziwei_da_xian": (ziwei.get("da_xian", {}).get("periods", [{}])[0].get("palace")
                          if ziwei.get("available") else None),
    }

    # dominant BaZi element + imbalance
    dominant = f"{bazi_dma['dominant_element']}_{bazi_dma['strength']}"
    imbalance = f"Deficient_{bazi_dma['missing_element']}" if bazi_dma.get("missing_element") else None

    # temperament style (combine BaZi DM + Vedic moon sign tone)
    temperament = _temperament(bazi_dma, vedic)

    # life phase classification
    life_phase = _life_phase(dasha_current)

    return {
        "vedic_yoga_strings": yoga_strings,
        "parivartana_cache": parivartana,
        "active_period_snapshot": snapshot,
        "dominant_bazi_element": dominant,
        "elemental_imbalance_flag": imbalance,
        "ashtakavarga_matrix": ashtakavarga.get("samudaya_array"),
        "core_temperament_style": temperament,
        "life_phase_classification": life_phase,
        "sade_sati": sade_sati,
        "favourable_elements": bazi_dma.get("favourable_elements"),
        "unfavourable_elements": bazi_dma.get("unfavourable_elements"),
        "bazi_interaction_map": _interaction_map(branch_interactions, ten_gods),
    }


def _current_luck(luck_pillars: dict | None, age: float | None,
                  pillars: dict) -> str:
    """The luck pillar bracketing the user's CURRENT age (spec 4.5/7.5).
    Falls back to the day-master string only if luck data is unavailable."""
    if luck_pillars and age is not None:
        for p in luck_pillars.get("pillars", []):
            if p.get("from_age", -1) <= age < p.get("to_age", 1e9):
                return f"{p['stem']}/{p['stem_element']} ({p['animal']}/{p['branch_element']})"
    return f"{pillars['day_master']}/{pillars['day_master_element']}"


def _interaction_map(bi: dict | None, tg: dict | None) -> list:
    """Named BaZi clashes/combinations/harms + the Ten Gods on each pillar —
    spec 4.7/7.5 'BaZi interaction map'. Plain strings the AI can read."""
    out: list[str] = []
    bi = bi or {}
    for key, label in (("combinations", "combination"), ("clashes", "clash"),
                       ("harms", "harm"), ("destructions", "destruction")):
        for item in bi.get(key, []) or []:
            out.append(f"{label}: {item}")
    for item in bi.get("three_harmony", []) or []:
        if isinstance(item, dict):
            brs = "-".join(item.get("branches", []))
            kind = "full" if item.get("full") else "partial"
            out.append(f"three-harmony ({kind} {item.get('element','')}): {brs}")
        else:
            out.append(f"three-harmony: {item}")
    for item in (bi.get("dual_nature_resolution") or []):
        out.append(f"dual-nature {item.get('pair')}: {item.get('verdict')}")
    if tg:
        gods = [f"{k.replace('_stem','')}={v}" for k, v in tg.items()]
        if gods:
            out.append("ten-gods: " + ", ".join(gods))
    return out


def _temperament(dma: dict, vedic: dict) -> str:
    el = dma["day_master_element"]
    mapping = {
        "Wood": "Growth_Oriented_Builder", "Fire": "Expressive_Visionary",
        "Earth": "Pragmatic_Stabiliser", "Metal": "Disciplined_Achiever",
        "Water": "Intuitive_Strategist",
    }
    return mapping.get(el, "Balanced_Generalist")


def _life_phase(dasha_current: dict) -> str:
    lord = dasha_current.get("current_maha")
    building = {"Saturn", "Ketu"}
    expansion = {"Jupiter", "Venus", "Mercury"}
    transition = {"Rahu", "Mars"}
    harvest = {"Sun", "Moon"}
    if lord in building:
        return "Consolidation Phase (building foundations)"
    if lord in expansion:
        return "Expansion Phase (growth and opportunity)"
    if lord in transition:
        return "Transition Phase (change and release)"
    if lord in harvest:
        return "Harvest Phase (results from past efforts)"
    return "Steady Phase"


def sade_sati_status(moon_sign_idx: int, saturn_sign_idx: int) -> dict:
    """Saturn's 7.5-yr transit over the 12th/1st/2nd from natal Moon sign."""
    diff = (saturn_sign_idx - moon_sign_idx) % 12
    if diff == 11:
        return {"active": True, "phase": "Rising", "detail": "Saturn in the sign before your Moon — pressure begins"}
    if diff == 0:
        return {"active": True, "phase": "Peak", "detail": "Saturn over your Moon sign — most intense phase"}
    if diff == 1:
        return {"active": True, "phase": "Setting", "detail": "Saturn in the sign after your Moon — gradual release"}
    return {"active": False, "phase": None}


# ── Stage 7.5 — token-efficient context slice per category ──────
CATEGORY_FIELDS = {
    "career": ["D10", "10th house planets", "A10", "BaZi career indicators", "Zi Wei Career Palace"],
    "relationships": ["7th house", "D9 Navamsha", "Darakaraka (DK)", "UL", "BaZi spouse pillar", "Zi Wei Spouse Palace"],
    "money": ["2nd and 11th house", "D2 Hora", "A2", "Dhana Yogas", "BaZi Wealth element", "Zi Wei Wealth Palace"],
    "property": ["4th house", "D4", "A4", "BaZi Earth element", "Zi Wei Property Palace"],
    "health": ["1st and 6th house", "D6", "BaZi Day Branch", "Zi Wei Health Palace"],
    "purpose": ["Atmakaraka (AK)", "9th house", "D9", "D20", "Zi Wei Karma Palace", "BaZi Day Master"],
}


def context_slice(profile: dict, category: str) -> dict:
    """Extract only the relevant slice for a topic (never inject full chart)."""
    cache = profile.get("cache_keys", {})
    vedic = profile.get("vedic", {})
    base = {
        "profile_fidelity": profile.get("profile_fidelity"),
        "temperament": cache.get("core_temperament_style"),
        "life_phase": cache.get("life_phase_classification"),
        "active_period": cache.get("active_period_snapshot"),
        "yogas": cache.get("vedic_yoga_strings"),
        "favourable_elements": cache.get("favourable_elements"),
        "sade_sati": cache.get("sade_sati"),
    }
    base["relevant_fields"] = CATEGORY_FIELDS.get(category, [])
    return base
