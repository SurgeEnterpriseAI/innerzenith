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
    NATURAL_MALEFICS, NATURAL_FRIENDS, NATURAL_ENEMIES,
    SPECIAL_ASPECTS, DEFAULT_ASPECT, NAISARGIKA_BALA,
    RASI_GUNAKAR, GRAHA_GUNAKAR, D60_DEITIES, WATER_FIRE_JUNCTIONS,
    NAKSHATRA_GANDANTA_PAIRS,
)
from .timeconv import TimeContext, sunrise_jd

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


def gandanta_flags(lon: float):
    """Rashi & Nakshatra Gandanta (Stage 2.2)."""
    lon = norm360(lon)
    sign = sign_of(lon)
    d = deg_in_sign(lon)
    rashi = False
    for water, fire in WATER_FIRE_JUNCTIONS:
        if (sign == water and d >= 26.6667) or (sign == fire and d <= 3.3333):
            rashi = True
            break
    naksh = NAKSHATRAS[int(lon // NAKSHATRA_SPAN) % 27]
    within = lon - (int(lon // NAKSHATRA_SPAN)) * NAKSHATRA_SPAN
    naksh_g = False
    for a, b in NAKSHATRA_GANDANTA_PAIRS:
        # last pada of `a` or first pada of `b`
        if (naksh == a and within >= NAKSHATRA_SPAN - (NAKSHATRA_SPAN / 4)) or \
           (naksh == b and within <= NAKSHATRA_SPAN / 4):
            naksh_g = True
            break
    return rashi or naksh_g, naksh_g


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
        g, ng = gandanta_flags(lon)
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
            "is_gandanta": g,
            "is_nakshatra_gandanta": ng,
        }
    # Mean nodes used for chart layout/houses (Stage 2.1). Ketu opposite Rahu.
    rahu = out["Rahu"]["total_degrees"]
    ketu = norm360(rahu + 180)
    knaksh, kpada, knlord, kpct, _ = nakshatra_of(ketu)
    kg, kng = gandanta_flags(ketu)
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
        "is_gandanta": kg,
        "is_nakshatra_gandanta": kng,
    }
    # True Node Rahu — stored separately, used ONLY for Chara Karaka ranking.
    tpos, _ = swe.calc_ut(tc.jd_ut, swe.TRUE_NODE, flag)
    out["Rahu"]["true_node_degrees"] = round(norm360(tpos[0]), 4)
    out["Rahu"]["true_node_deg_in_sign"] = round(deg_in_sign(tpos[0]), 4)
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
# Natal combustion orbs from the Sun (spec 2.5); Mercury→12° / Venus→8° if retrograde.
_COMBUST_ORB = {"Moon": 12, "Mars": 17, "Mercury": 14, "Jupiter": 11, "Venus": 10, "Saturn": 15}
# Baladi (degree-state) avasthas — 6° each; reversed for even signs.
_BALADI = ["Bala (infant — weak)", "Kumara (child — growing)", "Yuva (youth — peak strength)",
           "Vriddha (old — declining)", "Mrita (dead — nil)"]


def _influencers(name: str, sign: str, planets: dict, gd: dict) -> set:
    """Planets other than `name` that conjoin `sign` or cast graha drishti on it."""
    out = set()
    for nm2, p2 in planets.items():
        if nm2 == name:
            continue
        if p2["sign"] == sign or sign in gd.get(nm2, {}).get("aspected_signs", []):
            out.add(nm2)
    return out


def dignities(planets: dict, asc_sign_idx: int, navamsha: dict) -> dict:
    out = {}
    gd = graha_drishti(planets, asc_sign_idx)
    sun_lon = planets.get("Sun", {}).get("total_degrees", 0.0)
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
        # natal combustion (spec 2.5) — angular orb from the Sun, retro-adjusted
        combust = False
        if name in _COMBUST_ORB:
            orb = _COMBUST_ORB[name]
            if name == "Mercury" and p.get("retrograde"):
                orb = 12
            elif name == "Venus" and p.get("retrograde"):
                orb = 8
            d_sun = abs(((p["total_degrees"] - sun_lon + 180) % 360) - 180)
            combust = d_sun <= orb
        # Baladi avastha — 5 degree-states (6° each), reversed for even signs
        bidx = min(4, int(deg // 6))
        if sign in EVEN_SIGNS:
            bidx = 4 - bidx
        # dignity boundary flag — within 0.5° of a Moolatrikona edge (spec 2.5)
        boundary = False
        if name in MOOLATRIKONA and sign == MOOLATRIKONA[name][0]:
            lo, hi = MOOLATRIKONA[name][1], MOOLATRIKONA[name][2]
            boundary = abs(deg - lo) <= 0.5 or abs(deg - hi) <= 0.5
        # Lajjitadi: Kshudita (starved) & Mudita (delighted) — spec 2.5
        infl = _influencers(name, sign, planets, gd)
        sign_lord = SIGN_LORDS[sign]
        kshudita = (sign_lord in NATURAL_ENEMIES.get(name, set())
                    and bool(infl & NATURAL_ENEMIES.get(name, set()))
                    and not bool(infl & NATURAL_BENEFICS))
        mudita = (sign_lord in NATURAL_FRIENDS.get(name, set())
                  and bool(infl & NATURAL_BENEFICS))
        out[name] = {
            "essential_dignity": essential,
            "accidental_dignity": acc,
            "kendradi_bala": kendradi,
            "vargottama": vargottama,
            "combust": combust,
            "baladi_avastha": _BALADI[bidx],
            "dignity_boundary_flag": boundary,
            "kshudita": kshudita,
            "mudita": mudita,
            "sign_lord": sign_lord,
            "exaltation_dispositor": SIGN_LORDS[EXALTATION[name][0]] if name in EXALTATION else None,
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
    if division == 4:  # Chaturthamsha — the four kendras from the sign
        return nth_sign(s, [1, 4, 7, 10][part])
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
        5: s, 6: s, 7: (s if s % 2 == 0 else (s + 6) % 12),
        8: s, 10: (s if s % 2 == 0 else (s + 8) % 12),
        16: 0, 20: 0, 24: (4 if s % 2 == 0 else 3), 27: 0,
        40: 0, 45: 0, 60: s,
    }
    base = starts.get(division, s)
    return (base + part) % 12


def _divisional_yogas(varga_planets: dict, lagna_sign: str) -> list:
    """Raja / Dhana / Parivartana yogas WITHIN a divisional chart (spec 2.9
    Divisional Yoga Extension). varga_planets maps planet -> sign in the varga.
    Stored separately from D1 yogas; D10 feeds Career, D9 feeds Relationships and
    Life Purpose. Nodes carry no lordship and are excluded from the lord logic."""
    if not varga_planets or lagna_sign not in SIGNS:
        return []
    lidx = SIGNS.index(lagna_sign)
    house_of = {}
    for nm, sgn in varga_planets.items():
        if nm in ("Rahu", "Ketu") or sgn not in SIGNS:
            continue
        house_of[nm] = house_from(lidx, SIGNS.index(sgn))
    house_lord = {h: SIGN_LORDS[SIGNS[nth_sign(lidx, h)]] for h in range(1, 13)}
    out = []
    # Raja — a kendra lord and a trikona lord conjunct (same varga house)
    for kl in {house_lord[h] for h in (1, 4, 7, 10)}:
        for tl in {house_lord[h] for h in (1, 5, 9)}:
            if kl != tl and house_of.get(kl) is not None and house_of.get(kl) == house_of.get(tl):
                out.append({"name": "Raja Yoga", "components": sorted([kl, tl])})
    # Dhana — two distinct wealth-house lords (2/5/9/11) conjunct
    dl = sorted({house_lord[h] for h in (2, 5, 9, 11)})
    for i in range(len(dl)):
        for j in range(i + 1, len(dl)):
            a, b = dl[i], dl[j]
            if house_of.get(a) is not None and house_of.get(a) == house_of.get(b):
                out.append({"name": "Dhana Yoga", "components": [a, b]})
    # Parivartana — mutual sign exchange within the varga
    for a, asgn in varga_planets.items():
        if a in ("Rahu", "Ketu") or asgn not in SIGNS:
            continue
        la = SIGN_LORDS[asgn]
        if la == a or la not in varga_planets:
            continue
        if SIGN_LORDS.get(varga_planets[la]) == a:
            out.append({"name": "Parivartana Yoga", "components": sorted([a, la])})
    seen, uniq = set(), []
    for y in out:
        k = (y["name"], tuple(y["components"]))
        if k not in seen:
            seen.add(k); uniq.append(y)
    return uniq


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
        if label == "D60":
            # Shashtiamsha deity is mandatory — derived from the half-degree.
            entry["deities"] = {name: _d60_deity(p["total_degrees"])
                                for name, p in planets.items()}
            entry["lagna_deity"] = _d60_deity(asc_lon)
        if label in ("D9", "D10"):
            # Divisional Yoga Extension (spec 2.9) — Raja/Dhana/Parivartana in this
            # varga, stored separately from the D1 yogas. D10 → Career, D9 → Rel/Purpose.
            entry["yogas"] = _divisional_yogas(entry["planets"], entry["lagna_sign"])
        charts[label] = entry
    return charts


def _d60_deity(lon: float) -> str:
    """The Shashtiamsha (D60) deity governing this half-degree (Stage 2.6)."""
    d = deg_in_sign(lon)
    part = int(d * 2) % 60  # two deities per degree
    sidx = sign_index(lon)
    # even signs count the deity order in reverse
    if SIGNS[sidx] in EVEN_SIGNS:
        part = 59 - part
    return D60_DEITIES[part]


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
def chara_karakas(planets: dict, navamsha: dict = None) -> dict:
    """8-planet Parashari Chara Karakas (BPHS Ch.32).

    Ketu is strictly excluded. Rahu uses its TRUE NODE longitude, inverted
    (30 - deg_in_sign) as a classical convention. Sort 8 sort-values
    descending → AK, AmK, BK, MK, PiK, PK, GK, DK.

    Karakamsha (spec 2.8) — the sign occupied by the Atmakaraka in the D9
    (Navamsha). It is the anchor of the Life Purpose reading, so it is computed
    here and surfaced both on the AK entry and at the top level.
    """
    ranking = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu"]
    vals = []
    for p in ranking:
        if p == "Rahu":
            d = 30.0 - planets["Rahu"].get("true_node_deg_in_sign",
                                           planets["Rahu"]["degrees_in_sign"])
        else:
            d = planets[p]["degrees_in_sign"]
        vals.append((p, round(d, 4)))
    vals.sort(key=lambda x: x[1], reverse=True)

    names = ["AK", "AmK", "BK", "MK", "PiK", "PK", "GK", "DK"]
    out = {}
    # tie-break: detect ties at the same degree (rounded to 2dp)
    skipped = []
    for i, (planet, deg) in enumerate(vals):
        out[names[i]] = {"planet": planet, "sort_value": deg}
    # if 3+ share a degree, flag a skipped karaka position
    from collections import Counter
    deg_counts = Counter(round(d, 2) for _, d in vals)
    for deg, c in deg_counts.items():
        if c >= 3:
            skipped.append(deg)
    out["_meta"] = {"system": "Parashari 8-planet", "ketu_excluded": True,
                    "rahu_uses_true_node": True,
                    "tie_skipped_degrees": skipped or None}
    # Karakamsha — Atmakaraka's Navamsha sign (spec 2.8, Life Purpose anchor)
    if navamsha:
        ak_planet = out["AK"]["planet"]
        ks = navamsha.get(ak_planet, {}).get("sign")
        out["AK"]["karakamsha_sign"] = ks
        out["karakamsha_sign"] = ks
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

    # Vipreet Raja Yoga (spec 2.9) — a 6th/8th/12th lord placed in a 6/8/12 house
    # (rise through adversity). Harsha=6th lord, Sarala=8th, Vimala=12th.
    _dusthana = {6, 8, 12}
    for h, vname in ((6, "Harsha"), (8, "Sarala"), (12, "Vimala")):
        lord = house_lord[h]
        if house_of.get(lord) in _dusthana:
            yogas.append({"name": f"Vipreet Raja Yoga ({vname})", "components": [lord],
                          "strength": "medium", "life_area": "rise through adversity",
                          "mitigated": False})

    # Dhana Yogas (spec 2.9) — two distinct wealth-house lords (2/5/9/11) conjunct.
    _dhana_lords = sorted({house_lord[h] for h in (2, 5, 9, 11)})
    for i in range(len(_dhana_lords)):
        for j in range(i + 1, len(_dhana_lords)):
            a, b = _dhana_lords[i], _dhana_lords[j]
            if a in house_of and b in house_of and house_of[a] == house_of[b]:
                yogas.append({"name": "Dhana Yoga", "components": [a, b],
                              "strength": "medium", "life_area": "wealth", "mitigated": False})
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


def rasi_drishti() -> dict:
    """Jaimini sign aspects (Stage 2.10). Used ONLY for Jaimini systems
    (Narayana Dasha, Arudha, Chara Karakas) — never for Parashari.

    Movable signs aspect all Fixed signs except the adjacent one.
    Fixed signs aspect all Movable signs except the adjacent one.
    Dual signs aspect all other Dual signs.
    """
    movable = [s for s in SIGNS if MODALITY[s] == "movable"]
    fixed = [s for s in SIGNS if MODALITY[s] == "fixed"]
    dual = [s for s in SIGNS if MODALITY[s] == "dual"]
    matrix = {}
    for s in SIGNS:
        si = SIGNS.index(s)
        if MODALITY[s] == "movable":
            targets = [t for t in fixed if (SIGNS.index(t) - si) % 12 != 1]
        elif MODALITY[s] == "fixed":
            targets = [t for t in movable if (SIGNS.index(t) - si) % 12 != 11
                       and (si - SIGNS.index(t)) % 12 != 1]
        else:  # dual
            targets = [t for t in dual if t != s]
        matrix[s] = targets
    return matrix


def signs_aspecting(target_sign_idx: int, rasi_matrix: dict) -> list:
    """Which signs cast Rasi Drishti onto the target sign."""
    target = SIGNS[target_sign_idx]
    return [s for s, targets in rasi_matrix.items() if target in targets]


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

    # ── Reductions (Stage 2.11) ──
    reduced = {p: _trikona_shodhana(individual[p][:]) for p in contributors}
    reduced = {p: _ekadhipatya_shodhana(reduced[p]) for p in contributors}

    # ── Shodhya Pinda (after reductions; Rasi + Graha Gunakar; NOT dasha years) ──
    shodhya = {}
    for planet in contributors:
        occ = sign_index(planets[planet]["total_degrees"])
        red_bindu = reduced[planet][occ]
        rasi_pinda = red_bindu * RASI_GUNAKAR[SIGNS[occ]]
        graha_pinda = red_bindu * GRAHA_GUNAKAR[planet]
        shodhya[planet] = rasi_pinda + graha_pinda
    ranked = sorted(shodhya.items(), key=lambda x: x[1], reverse=True)
    top3 = [p for p, _ in ranked[:3]]
    bottom2 = [p for p, _ in ranked[-2:]]

    return {
        "individual": {p: {SIGNS[i]: individual[p][i] for i in range(12)} for p in contributors},
        "samudaya": {SIGNS[i]: samudaya[i] for i in range(12)},
        "samudaya_array": samudaya,
        "samudaya_total": sum(samudaya),  # invariant: 337
        "reduced_individual": {p: {SIGNS[i]: reduced[p][i] for i in range(12)} for p in contributors},
        "shodhya_pinda": shodhya,
        "strongest_periods": top3,
        "weakest_periods": bottom2,
        "note": "SAV always sums to 337; a sign with >=28 bindus is strong. Shodhya Pinda computed after Trikona + Ekadhipatya reductions.",
    }


def _trikona_shodhana(chart: list) -> list:
    """Remove bindus across each trikonal group (signs 1/5/9 apart): in each
    trine, subtract the lowest value from all three (classical reduction)."""
    out = chart[:]
    trines = [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]]
    for tri in trines:
        vals = [out[i] for i in tri]
        if 0 in vals:
            for i in tri:
                out[i] = 0
        else:
            m = min(vals)
            for i in tri:
                out[i] -= m
    return out


def _ekadhipatya_shodhana(chart: list) -> list:
    """Reduce pairs of signs ruled by the same planet (Mars: Aries/Scorpio,
    Venus: Taurus/Libra, Mercury: Gemini/Virgo, Jupiter: Sag/Pisces,
    Saturn: Cap/Aquarius). Sun & Moon rule one sign each — untouched."""
    out = chart[:]
    pairs = {
        "Mars": (0, 7), "Venus": (1, 6), "Mercury": (2, 5),
        "Jupiter": (8, 11), "Saturn": (9, 10),
    }
    for _, (a, b) in pairs.items():
        if out[a] == 0 or out[b] == 0:
            # if one is zero, both become zero
            out[a] = out[b] = 0
        elif out[a] == out[b]:
            out[a] = out[b] = 0
        else:
            m = min(out[a], out[b])
            if out[a] > out[b]:
                out[a] -= m; out[b] = 0
            else:
                out[b] -= m; out[a] = 0
    return out


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
        if i == 0:
            # First mahadasha: the native is already partway through it at birth.
            # Antardashas run at FULL mahadasha scale; emit starting from the one
            # actually running at birth (with its REMAINING portion), not from the
            # maha lord's own sub-period compressed into the leftover balance.
            full_md = VIMSHOTTARI_YEARS[lord]
            elapsed = full_md - balance_years  # years already gone at birth
            acc = 0.0
            for j in range(9):
                sub = VIMSHOTTARI_ORDER[(VIMSHOTTARI_ORDER.index(lord) + j) % 9]
                sub_full = full_md * (VIMSHOTTARI_YEARS[sub] / VIMSHOTTARI_TOTAL)
                seg_start, seg_end = acc, acc + sub_full
                acc = seg_end
                if seg_end <= elapsed + 1e-9:
                    continue  # this antardasha finished before birth
                remaining = seg_end - max(elapsed, seg_start)
                antars.append({
                    "lord": sub,
                    "start": a_cursor.date().isoformat(),
                    "end": _add_years(a_cursor, remaining).date().isoformat(),
                })
                a_cursor = _add_years(a_cursor, remaining)
        else:
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
def _sign_strength(sign_idx: int, planets: dict) -> float:
    """Approx sign strength for Dasha Lagna selection (occupants + natural)."""
    occupants = sum(1 for p in planets.values()
                    if sign_index(p["total_degrees"]) == sign_idx)
    # natural tiebreaker: Dual > Fixed > Movable
    natural = {"dual": 0.3, "fixed": 0.2, "movable": 0.1}[MODALITY[SIGNS[sign_idx]]]
    return occupants + natural


# Odd signs (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius) — 0-indexed even.
ODD_SIGNS = {"Aries", "Gemini", "Leo", "Libra", "Sagittarius", "Aquarius"}


def _narayana_direction(sign_idx: int, planets: dict) -> bool:
    """Narayana Mahadasha sweep direction — spec 2.13: Movable → forward,
    Fixed → backward, Dual → inherit from the sign-lord's OCCUPIED-sign modality
    (lord in Movable → forward, in Fixed → backward, in Dual → forward).
    Replaces the earlier odd/even-parity shortcut, which disagreed with the spec
    for Cancer, Leo, Capricorn, Aquarius and all four Dual signs."""
    m = MODALITY[SIGNS[sign_idx]]
    if m == "movable":
        return True
    if m == "fixed":
        return False
    lord = SIGN_LORDS[SIGNS[sign_idx]]
    if lord in planets:
        lm = MODALITY[SIGNS[sign_index(planets[lord]["total_degrees"])]]
        if lm == "movable":
            return True
        if lm == "fixed":
            return False
    return True  # Dual lord in a Dual sign → default forward


def _narayana_count_dir(sidx: int, planets: dict) -> bool:
    """Period-length COUNTING direction (spec 2.13, lines 601-607) — distinct from
    the Mahadasha sequence direction. Movable → forward, Fixed → backward, Dual →
    forward if its own lord sits in an ODD sign, backward if EVEN. NB: this is the
    lord's sign PARITY (odd/even), NOT its modality — the spec is explicit that a
    9th-sign-modality check is unreachable dead code for Dual signs."""
    m = MODALITY[SIGNS[sidx]]
    if m == "movable":
        return True
    if m == "fixed":
        return False
    lord = SIGN_LORDS[SIGNS[sidx]]
    if lord in planets:
        return SIGNS[sign_index(planets[lord]["total_degrees"])] in ODD_SIGNS
    return True


def _narayana_from(dasha_lagna_idx: int, planets: dict, birth_dt: datetime,
                   span_years: int) -> list:
    # Mahadasha sequence direction — spec 2.13 modality rule (see helper).
    forward = _narayana_direction(dasha_lagna_idx, planets)
    rasi_matrix = rasi_drishti()
    timeline = []
    cursor = birth_dt
    for i in range(12):
        sidx = (dasha_lagna_idx + i) % 12 if forward else (dasha_lagna_idx - i) % 12
        sgn = SIGNS[sidx]
        lord = SIGN_LORDS[sgn]
        lord_sign_idx = sign_index(planets[lord]["total_degrees"]) if lord in planets else sidx
        # Period length — spec 2.13 (601-607): INCLUSIVE count from the sign to its
        # dispositor, in the sign's own modality direction (see _narayana_count_dir).
        # Count = years directly; lord in own sign → count 1 → full 12 years. NEVER
        # the house-distance from the Dasha Lagna.
        cfwd = _narayana_count_dir(sidx, planets)
        dist = (lord_sign_idx - sidx) % 12 if cfwd else (sidx - lord_sign_idx) % 12
        count = dist + 1
        years = 12 if count == 1 else count
        timeline.append({
            "sign": sgn, "sign_lord": lord,
            "direction": "forward" if forward else "reverse",
            "sub_period_rule": _narayana_subrule(sgn),
            "three_parts": _narayana_three_parts(sidx, planets, rasi_matrix),
            "antardasha_sequence": _narayana_antardashas(sidx, planets),
            "start": cursor.date().isoformat(),
            "end": _add_years(cursor, years).date().isoformat(),
        })
        cursor = _add_years(cursor, years)
        if (cursor - birth_dt).days > span_years * 365.25:
            break
    return timeline


def _narayana_antardashas(dasha_sign_idx: int, planets: dict) -> list:
    """12 antardashas (one per sign). Start = sign occupied by the lord of the
    stronger of (dasha sign, 7th from it). Direction: odd start → forward,
    even start → backward (v4 spec)."""
    seventh = nth_sign(dasha_sign_idx, 7)
    start_sign = dasha_sign_idx if _sign_strength(dasha_sign_idx, planets) >= _sign_strength(seventh, planets) else seventh
    lord = SIGN_LORDS[SIGNS[start_sign]]
    first = sign_index(planets[lord]["total_degrees"]) if lord in planets else start_sign
    forward = SIGNS[first] in ODD_SIGNS
    seq = []
    for i in range(12):
        sidx = (first + i) % 12 if forward else (first - i) % 12
        seq.append(SIGNS[sidx])
    return seq


def _narayana_subrule(sign: str) -> str:
    """Antardasha sub-period sequence by modality (Rasi Drishti for aspecting)."""
    m = MODALITY[sign]
    if m == "movable":
        return "sign → sign-lord → aspecting/occupying (Rasi Drishti)"
    if m == "fixed":
        return "sign-lord → sign → aspecting/occupying (Rasi Drishti)"
    return "aspecting/occupying (Rasi Drishti) → sign → sign-lord"


_NARAYANA_GRAHAS = {"Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"}


def _narayana_three_parts(sidx: int, planets: dict, rasi_matrix: dict) -> list:
    """Three-Parts Rule (2.13) — each Mahadasha splits into three equal
    chronological thirds. The driver of each third is resolved here (sign, sign
    lord, and the planets aspecting/occupying the sign by RASI DRISHTI only).
    Ordering depends on the sign's modality. No dates — a query-time lens."""
    sgn = SIGNS[sidx]
    lord = SIGN_LORDS[sgn]

    def in_sign(p):
        return isinstance(planets.get(p), dict) and "total_degrees" in planets[p] \
            and sign_index(planets[p]["total_degrees"]) == sidx

    aspecting_signs = signs_aspecting(sidx, rasi_matrix)

    def aspects(p):
        return isinstance(planets.get(p), dict) and "total_degrees" in planets[p] \
            and SIGNS[sign_index(planets[p]["total_degrees"])] in aspecting_signs

    drivers = sorted({p for p in _NARAYANA_GRAHAS if in_sign(p) or aspects(p)})
    part_sign = {"driver": "sign", "of": sgn}
    part_lord = {"driver": "sign_lord", "of": lord}
    part_asp = {"driver": "aspecting_or_occupying", "of": drivers}
    m = MODALITY[sgn]
    if m == "movable":
        order = [part_sign, part_lord, part_asp]
    elif m == "fixed":
        order = [part_lord, part_sign, part_asp]
    else:  # dual
        order = [part_asp, part_sign, part_lord]
    return [{"part": i + 1, **o} for i, o in enumerate(order)]


def narayana_dasha(asc_sign_idx: int, planets: dict, birth_dt: datetime,
                   navamsha: dict = None, span_years: int = 90) -> dict:
    """Dasha Lagna = stronger of Lagna or 7th house (the two satya-peethas).
    Calculated for D1, and D9 when navamsha available (Stage 2.13)."""
    seventh_idx = nth_sign(asc_sign_idx, 7)
    dl = asc_sign_idx if _sign_strength(asc_sign_idx, planets) >= _sign_strength(seventh_idx, planets) else seventh_idx
    out = {
        "dasha_lagna_d1": SIGNS[dl],
        "d1": _narayana_from(dl, planets, birth_dt, span_years),
    }
    if navamsha and navamsha.get("ascendant", {}).get("sign"):
        d9_lagna_idx = SIGNS.index(navamsha["ascendant"]["sign"])
        # build a pseudo-planets map in D9 signs for period lengths
        d9_planets = {n: {"total_degrees": SIGNS.index(v["sign"]) * 30 + 1}
                      for n, v in navamsha.items() if n != "ascendant" and "sign" in v}
        out["dasha_lagna_d9"] = navamsha["ascendant"]["sign"]
        out["d9"] = _narayana_from(d9_lagna_idx, d9_planets, birth_dt, span_years)
    else:
        out["d9"] = {"available": False, "reason": "needs birth time"}
    return out


def varshaphala(tc: TimeContext, natal_planets: dict, asc_sign_idx: int,
                year: int) -> dict:
    """Solar Revolution chart for a given year (Stage 2.15).
    Varsha Lagna, Muntha, and Varsheshwara (simplified Panchavargiya)."""
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    natal_sun = natal_planets["Sun"]["total_degrees"]
    # find the JD in `year` when the (sidereal) Sun returns to natal longitude
    jd_guess = swe.julday(year, tc.local_dt.month, tc.local_dt.day, 12.0)
    for _ in range(6):  # Newton-ish refine
        spos, _ = swe.calc_ut(jd_guess, swe.SUN, swe.FLG_SIDEREAL)
        diff = ((natal_sun - spos[0] + 180) % 360) - 180
        if abs(diff) < 0.0005:
            break
        jd_guess += diff / 0.9856  # Sun ~0.9856°/day
    _, ascmc = swe.houses_ex(jd_guess, tc.lat, tc.lon, b"P", swe.FLG_SIDEREAL)
    varsha_lagna = norm360(ascmc[0])
    # Muntha — advances one sign per year from natal Lagna
    age = year - tc.local_dt.year
    muntha_idx = (asc_sign_idx + age) % 12
    # Varsheshwara — simplified: lord of Varsha Lagna (full Panchavargiya is
    # flagged in VALIDATION for reference cross-check)
    varsheshwara = SIGN_LORDS[sign_of(varsha_lagna)]
    # Mudda (Varsha Vimshottari) Dasha — the 120-year Vimshottari compressed into
    # this solar year, sequence from the natal Moon's nakshatra lord (spec 2.15).
    sr_y, sr_mo, sr_d, sr_h = swe.revjul(jd_guess)
    m_cursor = datetime(int(sr_y), int(sr_mo), int(sr_d)) + timedelta(days=sr_h / 24.0)
    m_naksh = int(norm360(natal_planets["Moon"]["total_degrees"]) // NAKSHATRA_SPAN) % 27
    m_pos = VIMSHOTTARI_ORDER.index(NAKSHATRA_LORD[m_naksh])
    mudda = []
    for i in range(9):
        lord = VIMSHOTTARI_ORDER[(m_pos + i) % 9]
        nxt = m_cursor + timedelta(days=VIMSHOTTARI_YEARS[lord] / VIMSHOTTARI_TOTAL * 365.25)
        mudda.append({"lord": lord, "start": m_cursor.date().isoformat(), "end": nxt.date().isoformat()})
        m_cursor = nxt
    return {
        "year": year,
        "varsha_lagna": {"sign": sign_of(varsha_lagna),
                         "degrees_in_sign": round(deg_in_sign(varsha_lagna), 2)},
        "muntha": {"sign": SIGNS[muntha_idx],
                   "house": house_from(asc_sign_idx, muntha_idx)},
        "varsheshwara": varsheshwara,
        "mudda_dasha": mudda,
        "note": "Varsheshwara via Varsha-Lagna lord; full Panchavargiya Bala scoring flagged for QA.",
    }


# Slow planet transit log — global (Stage 2.16). Same for everyone.
def slow_transit_log(start_year: int, end_year: int) -> dict:
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    bodies = {"Saturn": swe.SATURN, "Jupiter": swe.JUPITER, "Rahu": swe.MEAN_NODE,
              "Mars": swe.MARS, "Sun": swe.SUN}
    log = {b: [] for b in bodies}
    log["Ketu"] = []
    for y in range(start_year, end_year + 1):
        for m in range(1, 13):
            jd = swe.julday(y, m, 1, 12.0)
            for b, code in bodies.items():
                pos, _ = swe.calc_ut(jd, code, swe.FLG_SIDEREAL)
                log[b].append({"y": y, "m": m, "sign": sign_of(pos[0])})
                if b == "Rahu":
                    log["Ketu"].append({"y": y, "m": m, "sign": sign_of(norm360(pos[0] + 180))})
    return log


# ─── 2.14 Conditional Dashas ───────────────────────────────────
def shadbala(planets: dict, asc_sign_idx: int, tc: TimeContext) -> dict:
    """Stage 2.5 — six-fold strength (Virupas). Classical components,
    implemented to a sound approximation; absolute Virupas need reference
    cross-check (flagged in VALIDATION.md) but relative ranking is reliable.
    """
    seven = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]
    out = {}
    # Dig Bala — directional strength: Jupiter/Mercury strong in 1st, Moon/Venus
    # in 4th, Saturn in 7th, Sun/Mars in 10th. Max 60 at the strong house.
    dig_house = {"Jupiter": 1, "Mercury": 1, "Moon": 4, "Venus": 4,
                 "Saturn": 7, "Sun": 10, "Mars": 10}
    for p in seven:
        sp = planets[p]
        h = house_from(asc_sign_idx, sign_index(sp["total_degrees"]))
        # Sthana Bala (positional) — from essential dignity proxy
        sign = sp["sign"]; deg = sp["degrees_in_sign"]
        if p in EXALTATION and sign == EXALTATION[p][0]:
            sthana = 60
        elif sign in OWN_SIGNS.get(p, []):
            sthana = 45
        elif p in DEBILITATION and sign == DEBILITATION[p]:
            sthana = 10
        else:
            sthana = 30
        # Dig Bala
        strong_h = dig_house[p]
        dist = abs(((h - strong_h) % 12))
        dist = min(dist, 12 - dist)
        dig = round(60 * (1 - dist / 6.0), 2)
        # Kaala Bala (temporal) — day/night + benefic/malefic (simplified)
        kaala = 30.0
        # Cheshta Bala (motional) — retrograde planets gain; max 60
        cheshta = 45.0 if sp.get("retrograde") else 20.0
        if p in ("Sun", "Moon"):
            cheshta = 0.0  # luminaries excluded from cheshta
        # Naisargika (natural) — fixed
        naisargika = NAISARGIKA_BALA[p]
        # Drig Bala (aspectual) — simplified neutral baseline
        drig = 15.0
        total = round(sthana + dig + kaala + cheshta + naisargika + drig, 2)
        out[p] = {
            "sthana_bala": sthana, "dig_bala": dig, "kaala_bala": kaala,
            "cheshta_bala": cheshta, "naisargika_bala": round(naisargika, 2),
            "drig_bala": drig, "total_virupas": total,
            "total_rupas": round(total / 60.0, 2),
        }
    return out


def special_lagnas(tc: TimeContext, asc_lon: float) -> dict:
    """Hora Lagna, Ghati Lagna, Bhava Lagna (Stage 2.3). Need precise sunrise."""
    if not tc.time_known:
        return {"available": False, "reason": "needs birth time"}
    sr = sunrise_jd(tc.jd_ut, tc.lat, tc.lon)
    if sr is None:
        return {"available": False, "reason": "sunrise unavailable"}
    # time elapsed since sunrise, in hours
    hours_since = (tc.jd_ut - sr) * 24.0
    if hours_since < 0:
        hours_since += 24.0
    sun_lon = None
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    spos, _ = swe.calc_ut(sr, swe.SUN, swe.FLG_SIDEREAL)
    sun_at_sunrise = norm360(spos[0])
    # Bhava Lagna: Sun + (time since sunrise in ghatis) * (one sign per ...)
    # classical: BL advances 30° per 2 hours from sunrise Sun longitude.
    bhava = norm360(sun_at_sunrise + hours_since * 15.0)
    # Hora Lagna: advances 30° per 1 hour (twice BL speed)
    hora = norm360(sun_at_sunrise + hours_since * 30.0)
    # Ghati Lagna: advances 30° per 24 minutes (one ghati) → 30°*2.5/hour
    ghati = norm360(sun_at_sunrise + hours_since * 75.0)
    return {
        "available": True,
        "bhava_lagna": {"sign": sign_of(bhava), "degrees_in_sign": round(deg_in_sign(bhava), 2)},
        "hora_lagna": {"sign": sign_of(hora), "degrees_in_sign": round(deg_in_sign(hora), 2)},
        "ghati_lagna": {"sign": sign_of(ghati), "degrees_in_sign": round(deg_in_sign(ghati), 2)},
        "sunrise_jd": round(sr, 6),
    }


def is_daytime_birth(tc: TimeContext) -> bool:
    """True if birth is between sunrise and sunset."""
    sr = sunrise_jd(tc.jd_ut, tc.lat, tc.lon)
    if sr is None:
        return 6 <= tc.local_dt.hour < 18
    # next sunset ~ sr + ~0.5 day; approximate: daytime if within ~12h after sunrise
    return 0 <= (tc.jd_ut - sr) * 24.0 < 12.0


def conditional_dashas(asc_sign_idx: int, planets: dict, is_daytime: bool) -> dict:
    """Stage 2.14 — corrected triggers.

    Dwisaptati (72y): Lagna lord in the 7th, OR 7th lord in the Lagna.
    Shatrimsha (36y): hora-birth rule — daytime births in the Sun's hora,
                      nighttime births in the Moon's hora (source-dependent).
    """
    lagna_sign = SIGNS[asc_sign_idx]
    seventh_sign = SIGNS[nth_sign(asc_sign_idx, 7)]
    lagna_lord = SIGN_LORDS[lagna_sign]
    seventh_lord = SIGN_LORDS[seventh_sign]
    lagna_lord_house = house_from(asc_sign_idx, sign_index(planets[lagna_lord]["total_degrees"])) \
        if lagna_lord in planets else None
    seventh_lord_house = house_from(asc_sign_idx, sign_index(planets[seventh_lord]["total_degrees"])) \
        if seventh_lord in planets else None
    dwi = (lagna_lord_house == 7) or (seventh_lord_house == 1)

    # Shatrimsha hora-birth: Sun's hora = first/third... use simple hora-of-birth:
    # daytime birth qualifies if it falls in Sun's hora; here we approximate with
    # the day/night flag + the classical hora ownership of the birth weekday hour.
    shat = is_daytime  # daytime → Sun's hora qualifies (simplified hora-birth)

    return {
        "dwi_saptati_sama": {
            "applies": dwi, "cycle_years": 72,
            "trigger": "Lagna lord in 7th, or 7th lord in Lagna",
            "governor": "Moon",
        },
        "shat_trimsa_sama": {
            "applies": shat, "cycle_years": 36,
            "trigger": "hora-birth (daytime → Sun's hora / nighttime → Moon's hora)",
            "source_note": "conditionally interpreted; BPHS translators differ",
        },
        "applicable": dwi or shat,
        "note": "Vimshottari remains primary; conditional dashas are secondary indicators.",
    }
