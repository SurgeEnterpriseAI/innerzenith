"""Stage 02 — Vedic Jyotish. Sidereal, Lahiri, Whole Sign (+Placidus MC/IC).

Computes the full natal picture: planetary longitudes, Lagna & special
points, functional nature, dignities, divisional charts, Arudha Padas,
Chara Karakas, Yogas, aspects, Ashtakavarga, and the dasha timelines.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import swisseph as swe

from .constants import (
    SIGNS, SIGN_LORDS, MODALITY, EVEN_SIGNS, NAKSHATRAS, NAKSHATRA_LORD,
    NAKSHATRA_SPAN, VIMSHOTTARI_YEARS, VIMSHOTTARI_ORDER, VIMSHOTTARI_TOTAL,
    EXALTATION, DEBILITATION, OWN_SIGNS, MOOLATRIKONA, NATURAL_BENEFICS,
    NATURAL_MALEFICS, SPECIAL_ASPECTS, DEFAULT_ASPECT,
)
from .timeconv import TimeContext

SWE_PLANETS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mars": swe.MARS, "Mercury": swe.MERCURY,
    "Jupiter": swe.JUPITER, "Venus": swe.VENUS, "Saturn": swe.SATURN,
    "Rahu": swe.MEAN_NODE,   # Mean nodes only (Stage 2.1)
}


# ─── small helpers ─────────────────────────────────────────────
def norm360(x: float) -> float:
    return x % 360.0


def sign_of(lon: float) -> str:
    return SIGNS[int(norm360(lon) // 30) % 12]


def sign_index(lon: float) -> int:
    return int(norm360(lon) // 30) % 12


def deg_in_sign(lon: float) -> float:
    return norm360(lon) - sign_index(lon) * 30


def to_dms(deg: float) -> str:
    d = int(deg)
    mfloat = (deg - d) * 60
    m = int(mfloat)
    s = (mfloat - m) * 60
    return f"{d}°{m}'{s:.1f}\""


def nakshatra_of(lon: float):
    lon = norm360(lon)
    idx = int(lon // NAKSHATRA_SPAN) % 27
    within = lon - idx * NAKSHATRA_SPAN
    pada = int(within // (NAKSHATRA_SPAN / 4)) + 1
    pct = within / NAKSHATRA_SPAN * 100
    return NAKSHATRAS[idx], pada, NAKSHATRA_LORD[idx], round(pct, 1), idx


def house_from(from_sign_idx: int, to_sign_idx: int) -> int:
    """House count (1..12) from one sign to another, inclusive of start."""
    return (to_sign_idx - from_sign_idx) % 12 + 1


def nth_sign(from_sign_idx: int, n: int) -> int:
    """Sign index n houses from a sign (n=1 is the sign itself)."""
    return (from_sign_idx + (n - 1)) % 12


# ─── 2.2 planetary longitudes ──────────────────────────────────
def planet_positions(tc: TimeContext) -> dict:
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    flag = swe.FLG_SIDEREAL | swe.FLG_SPEED
    out = {}
    for name, code in SWE_PLANETS.items():
        pos, _ = swe.calc_ut(tc.jd_ut, code, flag)
        lon = norm360(pos[0])
        naksh, pada, nlord, pct, _ = nakshatra_of(lon)
        out[name] = {
            "total_degrees": round(lon, 4),
            "sign": sign_of(lon),
            "degrees_in_sign": round(deg_in_sign(lon), 4),
            "dms": to_dms(deg_in_sign(lon)),
            "retrograde": pos[3] < 0 if name not in ("Sun", "Moon") else False,
            "speed_deg_day": round(pos[3], 4),
            "nakshatra": naksh,
            "nakshatra_pada": pada,
            "nakshatra_lord": nlord,
            "percent_through_nakshatra": pct,
        }
    # Ketu = exactly opposite Rahu
    rahu = out["Rahu"]["total_degrees"]
    ketu = norm360(rahu + 180)
    knaksh, kpada, knlord, kpct, _ = nakshatra_of(ketu)
    out["Ketu"] = {
        "total_degrees": round(ketu, 4),
        "sign": sign_of(ketu),
        "degrees_in_sign": round(deg_in_sign(ketu), 4),
        "dms": to_dms(deg_in_sign(ketu)),
        "retrograde": True,
        "speed_deg_day": -out["Rahu"]["speed_deg_day"],
        "nakshatra": knaksh,
        "nakshatra_pada": kpada,
        "nakshatra_lord": knlord,
        "percent_through_nakshatra": kpct,
    }
    return out


# ─── 2.3 Lagna & special points ────────────────────────────────
def lagna_and_houses(tc: TimeContext) -> dict:
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    # Whole Sign primary; also Placidus for MC/IC.
    cusps_p, ascmc = swe.houses_ex(tc.jd_ut, tc.lat, tc.lon, b"P",
                                   swe.FLG_SIDEREAL)
    asc = norm360(ascmc[0])
    mc = norm360(ascmc[1])
    asc_sign_idx = sign_index(asc)
    naksh, pada, nlord, pct, _ = nakshatra_of(asc)

    # Whole Sign: house 1 = whole Lagna sign starting at 0°.
    whole_cusps = [norm360((asc_sign_idx + i) * 30) for i in range(12)]

    return {
        "ascendant": {
            "total_degrees": round(asc, 4),
            "sign": sign_of(asc),
            "degrees_in_sign": round(deg_in_sign(asc), 4),
            "dms": to_dms(deg_in_sign(asc)),
            "nakshatra": naksh, "nakshatra_pada": pada, "nakshatra_lord": nlord,
        },
        "midheaven": {
            "total_degrees": round(mc, 4), "sign": sign_of(mc),
            "degrees_in_sign": round(deg_in_sign(mc), 4),
        },
        "descendant_sign": SIGNS[(asc_sign_idx + 6) % 12],
        "ic_sign": sign_of(norm360(mc + 180)),
        "house_system": "Whole Sign (primary), Placidus MC/IC",
        "whole_sign_cusps": [round(c, 4) for c in whole_cusps],
        "placidus_cusps": [round(norm360(c), 4) for c in cusps_p[:12]],
        "asc_sign_index": asc_sign_idx,
    }


def assign_houses(planets: dict, asc_sign_idx: int) -> None:
    """Whole-sign house number for each planet (in place)."""
    for p in planets.values():
        p["house_whole_sign"] = house_from(asc_sign_idx, sign_index(p["total_degrees"]))


# ─── 2.4 functional nature (Lagna-specific) ────────────────────
def functional_nature(asc_sign_idx: int) -> dict:
    asc_sign = SIGNS[asc_sign_idx]
    # houses each planet owns from this Lagna
    owned = {p: [] for p in OWN_SIGNS}
    for house in range(1, 13):
        s = SIGNS[nth_sign(asc_sign_idx, house)]
        lord = SIGN_LORDS[s]
        if lord in owned:
            owned[lord].append(house)
    kendra = {1, 4, 7, 10}
    trikona = {1, 5, 9}
    maraka = {2, 7}
    dusthana = {6, 8, 12}
    out = {}
    for planet, houses in owned.items():
        hs = set(houses)
        nature = "Mixed"
        reason = f"owns {sorted(houses)} for {asc_sign} Lagna"
        if hs & kendra and hs & trikona and len(houses) >= 2:
            nature = "Yogakaraka"
            reason = f"owns both a kendra and a trikona ({sorted(houses)})"
        elif hs <= dusthana:
            nature = "Malefic"
        elif hs <= trikona or hs <= {1, 4, 5, 9, 10}:
            nature = "Benefic"
        elif hs & maraka:
            nature = "Maraka"
        out[planet] = {"houses_owned": houses, "functional_nature": nature, "reason": reason}
    return out


# ─── 2.5 dignities ─────────────────────────────────────────────
def dignities(planets: dict, asc_sign_idx: int, navamsha: dict) -> dict:
    out = {}
    for name, p in planets.items():
        sign = p["sign"]
        deg = p["degrees_in_sign"]
        essential = "Neutral"
        if name in EXALTATION and sign == EXALTATION[name][0]:
            essential = "Exalted"
        elif name in DEBILITATION and sign == DEBILITATION[name]:
            essential = "Debilitated"
        elif name in MOOLATRIKONA:
            mt = MOOLATRIKONA[name]
            if sign == mt[0] and mt[1] <= deg <= mt[2]:
                essential = "Moolatrikona"
            elif sign in OWN_SIGNS.get(name, []):
                essential = "Own"
        elif sign in OWN_SIGNS.get(name, []):
            essential = "Own"
        # accidental: angular/succedent/cadent by whole-sign house
        h = p.get("house_whole_sign", 1)
        if h in (1, 4, 7, 10):
            acc = "Angular"
        elif h in (2, 5, 8, 11):
            acc = "Succedent"
        else:
            acc = "Cadent"
        kendradi = "high" if acc == "Angular" else ("medium" if acc == "Succedent" else "low")
        # vargottama: same sign in D1 and D9
        d9_sign = navamsha.get(name, {}).get("sign")
        vargottama = (d9_sign == sign)
        out[name] = {
            "essential_dignity": essential,
            "accidental_dignity": acc,
            "kendradi_bala": kendradi,
            "vargottama": vargottama,
        }
    return out


# ─── 2.6 divisional charts (Vargas) ────────────────────────────
def _varga_sign_index(lon: float, division: int) -> int:
    """Compute the varga sign index for a longitude using classical rules."""
    s = sign_index(lon)
    d = deg_in_sign(lon)
    part = int(d / (30.0 / division))  # which division (0-based)

    if division == 1:
        return s
    if division == 2:  # Hora — Sun's/Moon's hora
        # 0-15 Leo(odd)/Cancer(even); odd signs: 1st half Leo, 2nd Cancer
        if s % 2 == 0:  # odd sign (0-indexed even)
            return 4 if d < 15 else 3   # Leo / Cancer
        else:
            return 3 if d < 15 else 4
    if division == 3:  # Drekkana — 1st same, 2nd 5th, 3rd 9th
        return nth_sign(s, [1, 5, 9][part])
    if division == 9:  # Navamsha
        return (s * 9 + part) % 12  # standard continuous navamsha from Aries-start groups
    if division == 12:  # Dwadashamsha — start from the sign itself
        return nth_sign(s, part + 1)
    if division == 30:  # Trimshamsha — unequal; approximate by 5 parts mapped to signs
        # classical: 5/5/8/7/5 deg to Mars,Saturn,Jupiter,Mercury,Venus signs
        bounds = [(5, "Aries"), (10, "Aquarius"), (18, "Sagittarius"),
                  (25, "Gemini"), (30, "Libra")]
        for lim, sg in bounds:
            if d < lim:
                return SIGNS.index(sg)
        return SIGNS.index("Libra")
    # General rule for the rest (D4,D5,D6,D7,D8,D10,D16,D20,D24,D27,D40,D45,D60):
    # count `part` signs from a starting sign that depends on the varga.
    starts = {
        4: s, 5: s, 6: s, 7: (s if s % 2 == 0 else (s + 6) % 12),
        8: s, 10: (s if s % 2 == 0 else (s + 8) % 12),
        16: 0, 20: 0, 24: (4 if s % 2 == 0 else 3), 27: 0,
        40: 0, 45: 0, 60: s,
    }
    base = starts.get(division, s)
    return (base + part) % 12


def divisional_charts(planets: dict, asc_lon: float, time_known: bool,
                      time_to_minute: bool) -> dict:
    divisions = {
        "D1": 1, "D2": 2, "D3": 3, "D4": 4, "D5": 5, "D6": 6, "D7": 7,
        "D8": 8, "D9": 9, "D10": 10, "D12": 12, "D16": 16, "D20": 20,
        "D24": 24, "D27": 27, "D30": 30, "D40": 40, "D45": 45, "D60": 60,
    }
    charts = {}
    for label, dv in divisions.items():
        if label == "D60":
            if not time_known:
                charts[label] = {"available": False, "reason": "birth time unknown"}
                continue
            if not time_to_minute:
                charts[label] = {"available": False, "reason": "birth time not known to the minute"}
                continue
        entry = {"available": True, "lagna_sign": SIGNS[_varga_sign_index(asc_lon, dv)], "planets": {}}
        for name, p in planets.items():
            idx = _varga_sign_index(p["total_degrees"], dv)
            entry["planets"][name] = SIGNS[idx]
        charts[label] = entry
    return charts


def navamsha_simple(planets: dict, asc_lon: float) -> dict:
    """D9 sign per planet + ascendant, for dignity vargottama + Narayana D9."""
    out = {"ascendant": {"sign": SIGNS[_varga_sign_index(asc_lon, 9)]}}
    for name, p in planets.items():
        out[name] = {"sign": SIGNS[_varga_sign_index(p["total_degrees"], 9)]}
    return out


# ─── 2.7 Arudha Padas ──────────────────────────────────────────
def arudha_padas(planets: dict, asc_sign_idx: int) -> dict:
    """AL, A2..A12, UL using the count rule + the two exception rules."""
    out = {}
    labels = {1: "AL", 7: "A7", 12: "A12"}
    for house in range(1, 13):
        house_sign_idx = nth_sign(asc_sign_idx, house)
        lord = SIGN_LORDS[SIGNS[house_sign_idx]]
        lord_sign_idx = sign_index(planets[lord]["total_degrees"]) if lord in planets else house_sign_idx
        # distance from the house sign to its lord (1..12)
        dist = house_from(house_sign_idx, lord_sign_idx)
        # arudha = same distance again from the lord
        arudha_idx = nth_sign(lord_sign_idx, dist)
        # exception rules:
        # (1) lord in the same house -> arudha = 10th from it
        if dist == 1:
            arudha_idx = nth_sign(house_sign_idx, 10)
        # (2) lord in 7th from the house -> arudha = 4th from it
        elif dist == 7:
            arudha_idx = nth_sign(house_sign_idx, 4)
        key = "AL" if house == 1 else ("UL" if house == 12 else f"A{house}")
        # spec lists UL as 12th-lord arudha (Upapada); also keep A12.
        out[f"A{house}" if house not in (1,) else "AL"] = SIGNS[arudha_idx]
    # Upapada Lagna (UL) — arudha of the 12th house (relationship timing)
    h = 12
    house_sign_idx = nth_sign(asc_sign_idx, h)
    lord = SIGN_LORDS[SIGNS[house_sign_idx]]
    lord_sign_idx = sign_index(planets[lord]["total_degrees"])
    dist = house_from(house_sign_idx, lord_sign_idx)
    ul_idx = nth_sign(lord_sign_idx, dist)
    if dist == 1:
        ul_idx = nth_sign(house_sign_idx, 10)
    elif dist == 7:
        ul_idx = nth_sign(house_sign_idx, 4)
    out["UL"] = SIGNS[ul_idx]
    return out


# ─── 2.8 Chara Karakas (Jaimini) ───────────────────────────────
def chara_karakas(planets: dict) -> dict:
    ranking_planets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu"]
    vals = []
    for p in ranking_planets:
        d = planets[p]["degrees_in_sign"]
        if p == "Rahu":
            d = 30.0 - d  # retrograde -> invert
        vals.append((p, d))
    vals.sort(key=lambda x: x[1], reverse=True)
    names = ["AK", "AmK", "BK", "MK", "PK", "GK", "DK", "GK2"]
    out = {}
    for i, (planet, deg) in enumerate(vals):
        out[names[i]] = {"planet": planet, "degrees_in_sign": round(deg, 4)}
    out["SK"] = {"planet": "Ketu", "fixed": True}
    return out


# ─── 2.9 Yogas ─────────────────────────────────────────────────
def detect_yogas(planets: dict, asc_sign_idx: int, fnature: dict, navamsha: dict) -> list:
    yogas = []
    # build lord -> houses owned, and house -> occupants
    house_of = {name: house_from(asc_sign_idx, sign_index(p["total_degrees"]))
                for name, p in planets.items()}
    # which planet rules each house
    house_lord = {h: SIGN_LORDS[SIGNS[nth_sign(asc_sign_idx, h)]] for h in range(1, 13)}
    kendra = {1, 4, 7, 10}
    trikona = {1, 5, 9}

    # Raja Yoga — a kendra lord and a trikona lord conjunct (same house)
    kendra_lords = {house_lord[h] for h in kendra}
    trikona_lords = {house_lord[h] for h in trikona}
    for kl in kendra_lords:
        for tl in trikona_lords:
            if kl != tl and house_of.get(kl) == house_of.get(tl):
                yogas.append({"name": "Raja Yoga", "components": [kl, tl],
                              "strength": "strong", "life_area": "power/status",
                              "mitigated": False})
    # Gaja Kesari — Jupiter in kendra from Moon
    if abs((house_from(sign_index(planets["Moon"]["total_degrees"]),
                       sign_index(planets["Jupiter"]["total_degrees"])))) in (1, 4, 7, 10):
        yogas.append({"name": "Gaja Kesari Yoga", "components": ["Jupiter", "Moon"],
                      "strength": "strong", "life_area": "wisdom/respect", "mitigated": False})
    # Panch Mahapurusha — Ma/Me/Ju/Ve/Sa in own/exalt in a kendra
    pmp = {"Mars": "Ruchaka", "Mercury": "Bhadra", "Jupiter": "Hamsa",
           "Venus": "Malavya", "Saturn": "Sasa"}
    for pl, yname in pmp.items():
        if house_of.get(pl) in kendra:
            sgn = planets[pl]["sign"]
            if sgn in OWN_SIGNS.get(pl, []) or (pl in EXALTATION and sgn == EXALTATION[pl][0]):
                yogas.append({"name": f"{yname} Yoga (Mahapurusha)", "components": [pl],
                              "strength": "strong", "life_area": "character", "mitigated": False})
    # Amala — natural benefic in 10th from Lagna or Moon
    tenth_from_lagna = nth_sign(asc_sign_idx, 10)
    tenth_from_moon = nth_sign(sign_index(planets["Moon"]["total_degrees"]), 10)
    for b in NATURAL_BENEFICS:
        if b in planets and sign_index(planets[b]["total_degrees"]) in (tenth_from_lagna, tenth_from_moon):
            yogas.append({"name": "Amala Yoga", "components": [b], "strength": "medium",
                          "life_area": "reputation", "mitigated": False})
            break
    # Kuja Dosha — Mars in 1,2,4,7,8,12 from Lagna
    if house_of.get("Mars") in {1, 2, 4, 7, 8, 12}:
        yogas.append({"name": "Kuja Dosha", "components": ["Mars"], "strength": "note",
                      "life_area": "marriage", "mitigated": False})
    # Kaal Sarp — all 7 planets between Rahu and Ketu axis
    rahu = norm360(planets["Rahu"]["total_degrees"])
    ketu = norm360(planets["Ketu"]["total_degrees"])
    sevens = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]
    def between(a, lo, hi):
        if lo < hi:
            return lo <= a <= hi
        return a >= lo or a <= hi
    all_one_side = all(between(norm360(planets[p]["total_degrees"]), rahu, ketu) for p in sevens) or \
                   all(between(norm360(planets[p]["total_degrees"]), ketu, rahu) for p in sevens)
    if all_one_side:
        yogas.append({"name": "Kaal Sarp Yoga", "components": ["Rahu", "Ketu"],
                      "strength": "strong", "life_area": "whole life", "mitigated": False})

    # Neecha Bhanga — debilitated planet with cancellation
    for name, p in planets.items():
        if name in DEBILITATION and p["sign"] == DEBILITATION[name]:
            conditions = []
            # (3) exalted in navamsha
            if navamsha.get(name, {}).get("sign") == EXALTATION.get(name, (None,))[0]:
                conditions.append("exalted in navamsha")
            # (2) lord of debilitation sign in kendra from Lagna or Moon
            deb_lord = SIGN_LORDS[p["sign"]]
            if house_of.get(deb_lord) in kendra:
                conditions.append("dispositor in kendra")
            if conditions:
                yogas.append({"name": "Neecha Bhanga Raja Yoga", "components": [name],
                              "strength": "strong", "life_area": "transformation",
                              "mitigated": True, "conditions": conditions})

    # Parivartana — mutual reception
    for a in planets:
        if a in ("Rahu", "Ketu"):
            continue
        sa = planets[a]["sign"]
        la = SIGN_LORDS[sa]
        if la == a:
            continue
        if la in planets and SIGN_LORDS[planets[la]["sign"]] == a:
            pair = tuple(sorted([a, la]))
            if not any(y["name"] == "Parivartana Yoga" and tuple(sorted(y["components"])) == pair for y in yogas):
                yogas.append({"name": "Parivartana Yoga", "components": list(pair),
                              "strength": "strong", "life_area": "exchange", "mitigated": False})
    return yogas


# ─── 2.10 graha drishti (aspects) ──────────────────────────────
def graha_drishti(planets: dict, asc_sign_idx: int) -> dict:
    out = {}
    for name, p in planets.items():
        from_sign = sign_index(p["total_degrees"])
        aspect_houses = SPECIAL_ASPECTS.get(name, DEFAULT_ASPECT)
        aspected_signs = [SIGNS[nth_sign(from_sign, h)] for h in aspect_houses]
        out[name] = {"aspects_houses_from_self": aspect_houses, "aspected_signs": aspected_signs}
    return out


# ─── 2.11 Ashtakavarga ─────────────────────────────────────────
# Benefic-point contribution tables (Bhinnashtakavarga). Reference points:
# Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Ascendant.
# Each contributor gives bindus to specific houses counted from each reference.
# Standard Parashari tables:
_AV_TABLES = {
    "Sun": {"Sun": [1,2,4,7,8,9,10,11], "Moon": [3,6,10,11], "Mars": [1,2,4,7,8,9,10,11],
            "Mercury": [3,5,6,9,10,11,12], "Jupiter": [5,6,9,11], "Venus": [6,7,12],
            "Saturn": [1,2,4,7,8,9,10,11], "Asc": [3,4,6,10,11,12]},
    "Moon": {"Sun": [3,6,7,8,10,11], "Moon": [1,3,6,7,10,11], "Mars": [2,3,5,6,9,10,11],
             "Mercury": [1,3,4,5,7,8,10,11], "Jupiter": [1,4,7,8,10,11,12], "Venus": [3,4,5,7,9,10,11],
             "Saturn": [3,5,6,11], "Asc": [3,6,10,11]},
    "Mars": {"Sun": [3,5,6,10,11], "Moon": [3,6,11], "Mars": [1,2,4,7,8,10,11],
             "Mercury": [3,5,6,11], "Jupiter": [6,10,11,12], "Venus": [6,8,11,12],
             "Saturn": [1,4,7,8,9,10,11], "Asc": [1,3,6,10,11]},
    "Mercury": {"Sun": [5,6,9,11,12], "Moon": [2,4,6,8,10,11], "Mars": [1,2,4,7,8,9,10,11],
                "Mercury": [1,3,5,6,9,10,11,12], "Jupiter": [6,8,11,12], "Venus": [1,2,3,4,5,8,9,11],
                "Saturn": [1,2,4,7,8,9,10,11], "Asc": [1,2,4,6,8,10,11]},
    "Jupiter": {"Sun": [1,2,3,4,7,8,9,10,11], "Moon": [2,5,7,9,11], "Mars": [1,2,4,7,8,10,11],
                "Mercury": [1,2,4,5,6,9,10,11], "Jupiter": [1,2,3,4,7,8,10,11], "Venus": [2,5,6,9,10,11],
                "Saturn": [3,5,6,12], "Asc": [1,2,4,5,6,7,9,10,11]},
    "Venus": {"Sun": [8,11,12], "Moon": [1,2,3,4,5,8,9,11,12], "Mars": [3,5,6,9,11,12],
              "Mercury": [3,5,6,9,11], "Jupiter": [5,8,9,10,11], "Venus": [1,2,3,4,5,8,9,10,11],
              "Saturn": [3,4,5,8,9,10,11], "Asc": [1,2,3,4,5,8,9,11]},
    "Saturn": {"Sun": [1,2,4,7,8,10,11], "Moon": [3,6,11], "Mars": [3,5,6,10,11,12],
               "Mercury": [6,8,9,10,11,12], "Jupiter": [5,6,11,12], "Venus": [6,11,12],
               "Saturn": [3,5,6,11], "Asc": [1,3,4,6,10,11]},
}


def ashtakavarga(planets: dict, asc_sign_idx: int) -> dict:
    contributors = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]
    ref_sign = {p: sign_index(planets[p]["total_degrees"]) for p in contributors}
    ref_sign["Asc"] = asc_sign_idx

    individual = {}
    samudaya = [0] * 12
    for planet in contributors:
        chart = [0] * 12
        table = _AV_TABLES[planet]
        for contrib, houses in table.items():
            base = ref_sign[contrib]
            for h in houses:
                sign_idx = nth_sign(base, h)
                chart[sign_idx] += 1
        individual[planet] = chart
        for i in range(12):
            samudaya[i] += chart[i]

    # Pinda Sadhana: rank planets by their own bhinna bindu in their occupied sign
    pinda = {}
    for planet in contributors:
        occ = sign_index(planets[planet]["total_degrees"])
        pinda[planet] = individual[planet][occ]
    ranked = sorted(pinda.items(), key=lambda x: x[1], reverse=True)
    top3 = [p for p, _ in ranked[:3]]
    bottom2 = [p for p, _ in ranked[-2:]]

    return {
        "individual": {SIGNS[0:0] and 0 or p: {SIGNS[i]: individual[p][i] for i in range(12)} for p in contributors},
        "samudaya": {SIGNS[i]: samudaya[i] for i in range(12)},
        "samudaya_array": samudaya,
        "pinda_sadhana": pinda,
        "strongest_periods": top3,
        "weakest_periods": bottom2,
        "note": "Sign with >=28 samudaya bindus is strong; below 28 is weak.",
    }


# ─── 2.12 Vimshottari Dasha ────────────────────────────────────
def _add_years(dt: datetime, years: float) -> datetime:
    days = years * 365.25
    return dt + timedelta(days=days)


def vimshottari_dasha(moon_lon: float, birth_dt: datetime, span_years: int = 90) -> dict:
    naksh_idx = int(norm360(moon_lon) // NAKSHATRA_SPAN) % 27
    within = norm360(moon_lon) - naksh_idx * NAKSHATRA_SPAN
    frac_elapsed = within / NAKSHATRA_SPAN
    start_lord = NAKSHATRA_LORD[naksh_idx]
    balance_years = VIMSHOTTARI_YEARS[start_lord] * (1 - frac_elapsed)

    start_pos = VIMSHOTTARI_ORDER.index(start_lord)
    timeline = []
    cursor = birth_dt
    end_limit = _add_years(birth_dt, span_years)

    for i in range(0, 9 * 3):  # plenty of mahadashas to cover 90y
        lord = VIMSHOTTARI_ORDER[(start_pos + i) % 9]
        full = VIMSHOTTARI_YEARS[lord]
        md_years = balance_years if i == 0 else full
        md_start = cursor
        md_end = _add_years(cursor, md_years)
        # antardashas
        antars = []
        a_cursor = md_start
        for j in range(9):
            sub = VIMSHOTTARI_ORDER[(VIMSHOTTARI_ORDER.index(lord) + j) % 9]
            sub_years = md_years * (VIMSHOTTARI_YEARS[sub] / VIMSHOTTARI_TOTAL)
            antars.append({
                "lord": sub,
                "start": a_cursor.date().isoformat(),
                "end": _add_years(a_cursor, sub_years).date().isoformat(),
            })
            a_cursor = _add_years(a_cursor, sub_years)
        timeline.append({
            "maha_lord": lord,
            "start": md_start.date().isoformat(),
            "end": md_end.date().isoformat(),
            "antardashas": antars,
        })
        cursor = md_end
        if cursor > end_limit:
            break

    return {
        "balance_at_birth": {"lord": start_lord, "years_remaining": round(balance_years, 3)},
        "timeline": timeline,
    }


def current_periods(dasha: dict, now: datetime) -> dict:
    today = now.date().isoformat()
    cur_md = cur_ad = next_ad = None
    for md in dasha["timeline"]:
        if md["start"] <= today < md["end"]:
            cur_md = md
            for k, ad in enumerate(md["antardashas"]):
                if ad["start"] <= today < ad["end"]:
                    cur_ad = ad
                    if k + 1 < len(md["antardashas"]):
                        next_ad = md["antardashas"][k + 1]
                    break
            break
    return {
        "current_maha": cur_md["maha_lord"] if cur_md else None,
        "current_maha_end": cur_md["end"] if cur_md else None,
        "current_antar": cur_ad["lord"] if cur_ad else None,
        "current_antar_end": cur_ad["end"] if cur_ad else None,
        "next_antar": next_ad["lord"] if next_ad else None,
        "next_antar_start": next_ad["start"] if next_ad else None,
    }


# ─── 2.13 Narayana Dasha (D1) ──────────────────────────────────
def narayana_dasha(asc_sign_idx: int, planets: dict, birth_dt: datetime, span_years: int = 90) -> list:
    # direction by sign type of Lagna
    lagna_sign = SIGNS[asc_sign_idx]
    mod = MODALITY[lagna_sign]
    forward = mod == "movable"
    if mod == "dual":
        lord = SIGN_LORDS[lagna_sign]
        lord_sign = planets[lord]["sign"] if lord in planets else lagna_sign
        forward = MODALITY[lord_sign] == "movable"
    timeline = []
    cursor = birth_dt
    for i in range(12):
        if forward:
            sidx = (asc_sign_idx + i) % 12
        else:
            sidx = (asc_sign_idx - i) % 12
        # period length = houses from Dasha Lagna to the lord of that sign
        sgn = SIGNS[sidx]
        lord = SIGN_LORDS[sgn]
        lord_sign_idx = sign_index(planets[lord]["total_degrees"]) if lord in planets else sidx
        years = house_from(sidx, lord_sign_idx) - 1
        if years <= 0:
            years = 12  # full cycle when lord in same sign
        years = max(1, years)
        timeline.append({
            "sign": sgn,
            "sign_lord": lord,
            "direction": "forward" if forward else "reverse",
            "start": cursor.date().isoformat(),
            "end": _add_years(cursor, years).date().isoformat(),
        })
        cursor = _add_years(cursor, years)
        if (cursor - birth_dt).days > span_years * 365.25:
            break
    return timeline


# ─── 2.14 Conditional Dashas ───────────────────────────────────
def conditional_dashas(asc_sign_idx: int, planets: dict) -> dict:
    sun_house = house_from(asc_sign_idx, sign_index(planets["Sun"]["total_degrees"]))
    dwi = sun_house == 7  # Sun in 7th from Lagna
    shat = SIGNS[asc_sign_idx] in EVEN_SIGNS
    return {
        "dwi_saptati_sama": {"applies": dwi, "cycle_years": 72,
                             "trigger": "Sun in 7th house from Lagna"},
        "shat_trimsa_sama": {"applies": shat, "cycle_years": 36,
                             "trigger": "Lagna in even sign"},
        "applicable": dwi or shat,
        "note": "Vimshottari remains primary; conditional dashas are secondary indicators.",
    }
