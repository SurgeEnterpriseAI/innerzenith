"""Stage 08 — Ask Now (Prashna / Hora Shastra).

Casts a chart for the exact moment & place a question arose. Validity
checks, Lagna-lord significator, house assignments by question type, and
Tajika yogas computed with individual Deethi orbs (not Western orbs).
"""

from __future__ import annotations

import swisseph as swe

from .constants import (
    SIGNS, SIGN_LORDS, MODALITY, NAKSHATRAS, NAKSHATRA_LORD, NAKSHATRA_SPAN,
    DEETHI, PRASHNA_HOUSES,
)
from .vedic import norm360, sign_of, sign_index, deg_in_sign, to_dms, nakshatra_of, house_from, nth_sign

SWE_PLANETS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mars": swe.MARS, "Mercury": swe.MERCURY,
    "Jupiter": swe.JUPITER, "Venus": swe.VENUS, "Saturn": swe.SATURN,
}


def prashna_chart(tc, question_type: str = "general") -> dict:
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    flag = swe.FLG_SIDEREAL | swe.FLG_SPEED

    cusps, ascmc = swe.houses_ex(tc.jd_ut, tc.lat, tc.lon, b"P", swe.FLG_SIDEREAL)
    asc = norm360(ascmc[0])
    asc_sign = sign_of(asc)
    asc_sign_idx = sign_index(asc)
    asc_deg = deg_in_sign(asc)

    # planets
    planets = {}
    for name, code in SWE_PLANETS.items():
        pos, _ = swe.calc_ut(tc.jd_ut, code, flag)
        lon = norm360(pos[0])
        planets[name] = {"longitude": lon, "sign": sign_of(lon),
                         "speed": pos[3], "retrograde": pos[3] < 0 and name not in ("Sun", "Moon")}

    moon = planets["Moon"]["longitude"]
    mnaksh, mpada, mlord, mpct, _ = nakshatra_of(moon)

    # ── validity (Stage 8.4) ──
    flags = []
    if asc_deg < 3:
        flags.append({"type": "asc_first_degrees",
                      "message": "The timing of this question suggests the situation may still be forming — the answer I can give you now is directional rather than definitive."})
    if asc_deg > 27:
        flags.append({"type": "asc_last_degrees",
                      "message": "The timing of this question suggests the situation may already be resolving beyond your control."})
    void = _moon_void_of_course(tc, moon, planets)
    if void:
        flags.append({"type": "moon_void",
                      "message": "The chart of this moment suggests this situation may resolve on its own without requiring action from you."})

    # ── Tajika yogas (Deethi orbs) ──
    tajika = _tajika_yogas(planets, moon)

    # significator + promittor
    lagna_lord = SIGN_LORDS[asc_sign]
    houses_for_q = PRASHNA_HOUSES.get(question_type, {})

    return {
        "prashna_lagna": {"sign": asc_sign, "degrees_in_sign": round(asc_deg, 4),
                          "dms": to_dms(asc_deg), "modality": MODALITY[asc_sign]},
        "lagna_lord": lagna_lord,
        "modality_meaning": {
            "movable": "swift movement, quick resolution",
            "fixed": "situation static or delayed",
            "dual": "mixed; first half fixed, second half movable",
        }[MODALITY[asc_sign]],
        "moon": {"sign": planets["Moon"]["sign"], "nakshatra": mnaksh,
                 "degrees_in_sign": round(deg_in_sign(moon), 4)},
        "moon_void_of_course": void,
        "validity_flags": flags,
        "tajika_yogas": tajika,
        "question_type": question_type,
        "house_assignments": houses_for_q,
        "planets": {k: {"sign": v["sign"], "retrograde": v["retrograde"]} for k, v in planets.items()},
    }


def _moon_void_of_course(tc, moon_lon, planets) -> bool:
    """Will the Moon make any more applying Tajika (Deethi) aspect before
    leaving its sign? If not → void of course."""
    moon_sign_end = (sign_index(moon_lon) + 1) * 30
    deg_to_edge = moon_sign_end - norm360(moon_lon)
    moon_deethi = DEETHI["Moon"]
    for name, p in planets.items():
        if name == "Moon":
            continue
        orb = (moon_deethi + DEETHI.get(name, 8)) / 2.0
        # applying if Moon is behind the planet within combined orb and moving toward
        sep = abs(norm360(moon_lon - p["longitude"]))
        sep = min(sep, 360 - sep)
        # consider conjunction(0), trine(120), sextile(60), opp(180), square(90)
        for asp in (0, 60, 90, 120, 180):
            if abs(sep - asp) <= orb and deg_to_edge > 0:
                return False  # an aspect still forms
    return True


def _tajika_yogas(planets, moon_lon) -> dict:
    """Ithasala (applying), Eshrafa (separating), Yamaya (mutual reception)."""
    results = {"ithasala": [], "eshrafa": [], "yamaya": []}
    names = list(planets.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            pa, pb = planets[a], planets[b]
            orb = (DEETHI.get(a, 8) + DEETHI.get(b, 8)) / 2.0
            sep = abs(norm360(pa["longitude"] - pb["longitude"]))
            sep = min(sep, 360 - sep)
            within = any(abs(sep - asp) <= orb for asp in (0, 60, 90, 120, 180))
            if within:
                # faster planet applying to slower => Ithasala; else Eshrafa
                faster = a if abs(pa["speed"]) >= abs(pb["speed"]) else b
                slower = b if faster == a else a
                # crude applying test by relative longitude
                applying = norm360(planets[faster]["longitude"]) < norm360(planets[slower]["longitude"])
                (results["ithasala"] if applying else results["eshrafa"]).append(f"{a}-{b}")
            # Yamaya — mutual reception (each in the other's sign)
            if SIGN_LORDS[pa["sign"]] == b and SIGN_LORDS[pb["sign"]] == a:
                results["yamaya"].append(f"{a}-{b}")
    return results
