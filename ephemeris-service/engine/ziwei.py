"""Stage 05 — Zi Wei Dou Shu (Purple Star Astrology).

A 12-palace chart. Major stars placed by lunar month/day/hour. Requires
birth date, time (2-hour branch), and gender. Without birth time we store
three possible Life Palaces and flag approximate.
"""

from __future__ import annotations

import swisseph as swe

from .constants import (
    PALACES, PALACE_EN, ZIWEI_MAJOR_STARS, HUA_BY_STEM, STEMS, BRANCHES,
    BRANCH_ANIMAL,
)

# Branch order for palace placement uses the 12 earthly branches as the
# 12 "houses" of the chart. Palace index 0 = Ming Gong (Life).

# Zi Wei group offsets relative to Zi Wei's palace (classical sequence).
# Tian Fu is mirror of Zi Wei. We model the canonical placement order.
_ZIWEI_GROUP = ["Zi Wei", "Tian Ji", None, "Tai Yang", "Wu Qu",
                "Tian Tong", None, None, "Lian Zhen"]
# Tian Fu group runs in opposite direction from Tian Fu position.
_TIANFU_GROUP = ["Tian Fu", "Tai Yin", "Tan Lang", "Ju Men", "Tian Xiang",
                 "Tian Liang", "Qi Sha", None, None, None, "Po Jun"]


def _lunar_month_day(jd_ut: float):
    """Approximate Chinese lunar month & day from the moon-sun elongation.
    Day-in-lunar-month ~ (moon_lon - sun_lon) / 12.19; month from new-moon count.
    For palace placement we need lunar month (1-12) and lunar day (1-30).
    """
    sun, _ = swe.calc_ut(jd_ut, swe.SUN, swe.FLG_SWIEPH)
    moon, _ = swe.calc_ut(jd_ut, swe.MOON, swe.FLG_SWIEPH)
    elong = (moon[0] - sun[0]) % 360.0
    lunar_day = int(elong / 12.1907) + 1  # 1..30
    # lunar month: approximate from solar longitude (month index by 30° band from 315)
    sun_lon = sun[0] % 360.0
    lunar_month = (int(((sun_lon - 315) % 360) // 30) + 1)
    return max(1, min(30, lunar_day)), max(1, min(12, lunar_month))


def _hour_branch(local_dt, time_known: bool):
    if not time_known:
        return None
    h = local_dt.hour
    return ((h + 1) // 2) % 12  # Zi=0 spanning 23-1


def ziwei_chart(tc, gender: str) -> dict:
    lunar_day, lunar_month = _lunar_month_day(tc.jd_ut)
    hour_branch = _hour_branch(tc.local_dt, tc.time_known)

    if hour_branch is None:
        # fallback — three possible Life Palaces (Stage 5.1)
        options = []
        for hb in (0, 4, 8):
            life = _life_palace_index(lunar_month, hb)
            options.append(BRANCHES[life])
        return {"available": False, "approximate": True,
                "possible_life_palaces": options,
                "note": "birth time unknown — 3 candidate Life Palaces stored"}

    life_idx = _life_palace_index(lunar_month, hour_branch)
    body_idx = _body_palace_index(lunar_month, hour_branch)

    # assign the 12 palaces counter-clockwise from Life Palace
    palaces = {}
    for i, pal in enumerate(PALACES):
        branch_idx = (life_idx - i) % 12
        palaces[pal] = {
            "branch": BRANCHES[branch_idx], "animal": BRANCH_ANIMAL[branch_idx],
            "domain": PALACE_EN[pal], "branch_index": branch_idx, "stars": [],
        }

    # place Zi Wei by birth day (classical Wu Hu / table) — simplified mod
    ziwei_pos = _ziwei_position(lunar_day)
    _place_stars(palaces, ziwei_pos)

    # 4 Hua transformations from birth-year stem
    year_stem = _year_stem(tc)
    hua = HUA_BY_STEM.get(STEMS[year_stem], {})

    # brightness (simplified: assign by palace-star pairing tier)
    return {
        "available": True,
        "life_palace": _palace_at_branch(palaces, life_idx),
        "body_palace": BRANCHES[body_idx],
        "body_palace_name": _palace_name_at_branch(palaces, body_idx),
        "palaces": palaces,
        "hua_transformations": hua,
        "san_fang_si_zheng": _palace_groupings(),
        "opposition_pairs": _opposition_pairs(),
        "da_xian": _da_xian(palaces, life_idx, tc, gender),
    }


def _life_palace_index(lunar_month: int, hour_branch: int) -> int:
    # Life Palace: start at Yin (branch 2) for month 1, count forward by month,
    # then count back by hour. Classical formula.
    base = (2 + (lunar_month - 1)) % 12        # month count forward from Yin
    life = (base - hour_branch) % 12
    return life


def _body_palace_index(lunar_month: int, hour_branch: int) -> int:
    base = (2 + (lunar_month - 1)) % 12
    body = (base + hour_branch) % 12
    return body


def _ziwei_position(lunar_day: int) -> int:
    # simplified Zi Wei placement by day (full version uses the Wu-Ju table).
    return (lunar_day - 1) % 12


def _place_stars(palaces, ziwei_pos):
    # Zi Wei group placed forward; Tian Fu opposite. Map to branch indices.
    by_branch = {p["branch_index"]: name for name, p in palaces.items()}
    for offset, star in enumerate(_ZIWEI_GROUP):
        if star:
            b = (ziwei_pos - offset) % 12
            name = by_branch.get(b)
            if name:
                palaces[name]["stars"].append(star)
    tianfu_pos = (4 - ziwei_pos) % 12  # mirror across the Yin-Shen axis
    for offset, star in enumerate(_TIANFU_GROUP):
        if star:
            b = (tianfu_pos + offset) % 12
            name = by_branch.get(b)
            if name:
                palaces[name]["stars"].append(star)


def _palace_at_branch(palaces, branch_idx):
    for name, p in palaces.items():
        if p["branch_index"] == branch_idx:
            return {"palace": name, "domain": p["domain"], "branch": p["branch"],
                    "stars": p["stars"]}
    return None


def _palace_name_at_branch(palaces, branch_idx):
    for name, p in palaces.items():
        if p["branch_index"] == branch_idx:
            return name
    return None


def _year_stem(tc) -> int:
    y = tc.local_dt.year
    sun, _ = swe.calc_ut(tc.jd_ut, swe.SUN, swe.FLG_SWIEPH)
    if tc.local_dt.month <= 2 and sun[0] % 360 < 315 and sun[0] % 360 > 285:
        y -= 1
    return (y - 4) % 10


def _palace_groupings():
    return {
        "Life group": ["Ming Gong", "Guan Lu", "Cai Bo", "Qian Yi"],
        "Spouse group": ["Fu Qi", "Zi Nu", "Tian Zhai", "Fu De"],
        "Siblings group": ["Xiong Di", "Jiao You", "Fu Mu", "Ji E"],
    }


def _opposition_pairs():
    return {
        "Ming Gong": "Qian Yi", "Guan Lu": "Cai Bo", "Fu Qi": "Fu De",
        "Ji E": "Jiao You", "Tian Zhai": "Xiong Di", "Zi Nu": "Fu Mu",
    }


def _da_xian(palaces, life_idx, tc, gender):
    """10-year period cycles — direction by year stem polarity + gender."""
    ystem = _year_stem(tc)
    year_yang = ystem % 2 == 0
    male = gender == "M"
    forward = (year_yang and male) or (not year_yang and not male)
    periods = []
    start_age = 6  # placeholder start age band (1-10); refined by Jie in full impl
    for i in range(9):
        b = (life_idx + i) % 12 if forward else (life_idx - i) % 12
        name = None
        stars = []
        for nm, p in palaces.items():
            if p["branch_index"] == b:
                name, stars = nm, p["stars"]
        periods.append({"from_age": start_age + i * 10, "to_age": start_age + i * 10 + 9,
                        "palace": name, "stars": stars})
    return {"direction": "forward" if forward else "reverse", "periods": periods}
