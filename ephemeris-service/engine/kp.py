"""Stage 03 — KP (Krishnamurti Paddhati).

243 sub-lord divisions (27 nakshatras x 9 sub-lords). Uses a SEPARATE KP
ayanamsha (not Lahiri) and Placidus houses (mandatory for KP). Both engines
share Swiss Ephemeris planetary longitudes but apply different ayanamsha
offsets before the sub-lord lookup.
"""

from __future__ import annotations

import swisseph as swe

from .constants import (
    SIGNS, SIGN_LORDS, NAKSHATRAS, NAKSHATRA_LORD, NAKSHATRA_SPAN,
    VIMSHOTTARI_ORDER, VIMSHOTTARI_YEARS, VIMSHOTTARI_TOTAL, KP_INTERLINKS,
)
from .vedic import norm360, sign_of, sign_index, deg_in_sign, house_from, nth_sign

SWE_PLANETS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mars": swe.MARS, "Mercury": swe.MERCURY,
    "Jupiter": swe.JUPITER, "Venus": swe.VENUS, "Saturn": swe.SATURN,
    "Rahu": swe.MEAN_NODE,
}

# Vimshottari proportions across the 13.333° nakshatra produce the sub-lords.
_DASHA_FRACTION = [VIMSHOTTARI_YEARS[p] / VIMSHOTTARI_TOTAL for p in VIMSHOTTARI_ORDER]


def _setup_kp_ayanamsha():
    # KP (Krishnamurti) ayanamsha — built into Swiss Ephemeris.
    swe.set_sid_mode(swe.SIDM_KRISHNAMURTI, 0, 0)


def _sub_lord_chain(lon: float):
    """Return (sign_lord, star_lord, sub_lord, sub_sub_lord) for a KP longitude."""
    lon = norm360(lon)
    sign_lord = SIGN_LORDS[sign_of(lon)]

    naksh_idx = int(lon // NAKSHATRA_SPAN) % 27
    star_lord = NAKSHATRA_LORD[naksh_idx]
    within = lon - naksh_idx * NAKSHATRA_SPAN  # 0..13.333

    # walk sub-lords starting from the star lord, each spanning a Vimshottari
    # fraction of the nakshatra
    start = VIMSHOTTARI_ORDER.index(star_lord)
    pos = 0.0
    sub_lord = None
    sub_start = 0.0
    sub_span = 0.0
    for k in range(9):
        lord = VIMSHOTTARI_ORDER[(start + k) % 9]
        span = _DASHA_FRACTION[(start + k) % 9] * NAKSHATRA_SPAN
        if within < pos + span or k == 8:
            sub_lord = lord
            sub_start = pos
            sub_span = span
            break
        pos += span

    # sub-sub-lord: subdivide the sub-lord span again by Vimshottari order
    sub_within = within - sub_start
    sstart = VIMSHOTTARI_ORDER.index(sub_lord)
    p2 = 0.0
    sub_sub = sub_lord
    for k in range(9):
        lord = VIMSHOTTARI_ORDER[(sstart + k) % 9]
        span = _DASHA_FRACTION[(sstart + k) % 9] * sub_span
        if sub_within < p2 + span or k == 8:
            sub_sub = lord
            break
        p2 += span

    return sign_lord, star_lord, sub_lord, sub_sub


def kp_chart(tc) -> dict:
    """Full KP block — planets + 12 Placidus cusps with sub-lord chains."""
    _setup_kp_ayanamsha()
    flag = swe.FLG_SIDEREAL | swe.FLG_SPEED

    # planets (KP ayanamsha)
    planets = {}
    for name, code in SWE_PLANETS.items():
        pos, _ = swe.calc_ut(tc.jd_ut, code, flag)
        lon = norm360(pos[0])
        sl, stl, subl, ssl = _sub_lord_chain(lon)
        planets[name] = {
            "longitude": round(lon, 4), "sign": sign_of(lon),
            "sign_lord": sl, "star_lord": stl, "sub_lord": subl, "sub_sub_lord": ssl,
        }
    rahu = planets["Rahu"]["longitude"]
    ketu = norm360(rahu + 180)
    sl, stl, subl, ssl = _sub_lord_chain(ketu)
    planets["Ketu"] = {"longitude": round(ketu, 4), "sign": sign_of(ketu),
                       "sign_lord": sl, "star_lord": stl, "sub_lord": subl, "sub_sub_lord": ssl}

    # Placidus cusps (mandatory for KP)
    cusps, ascmc = swe.houses_ex(tc.jd_ut, tc.lat, tc.lon, b"P", swe.FLG_SIDEREAL)
    cusp_data = []
    for i in range(12):
        clon = norm360(cusps[i])
        sl, stl, subl, ssl = _sub_lord_chain(clon)
        cusp_data.append({
            "house": i + 1, "longitude": round(clon, 4), "sign": sign_of(clon),
            "sign_lord": sl, "star_lord": stl, "sub_lord": subl, "sub_sub_lord": ssl,
        })

    asc_sign_idx = sign_index(norm360(ascmc[0]))

    return {
        "ayanamsha": "Krishnamurti (KP)",
        "house_system": "Placidus",
        "planets": planets,
        "cusps": cusp_data,
        "asc_sign_index": asc_sign_idx,
        "significators": _significators(planets, cusp_data, asc_sign_idx),
        "promise": _promise_analysis(cusp_data, planets, asc_sign_idx),
        "cuspal_interlinks": _cuspal_interlinks(cusp_data),
    }


def _house_of_planet(planet_lon, asc_sign_idx):
    return house_from(asc_sign_idx, sign_index(planet_lon))


def _significators(planets, cusps, asc_sign_idx) -> dict:
    """Stage 3.4 — three-level signification list per planet."""
    # houses owned by each planet (level 1)
    house_lord = {h: SIGN_LORDS[SIGNS[nth_sign(asc_sign_idx, h)]] for h in range(1, 13)}
    owned = {}
    for h, lord in house_lord.items():
        owned.setdefault(lord, []).append(h)

    out = {}
    for name, p in planets.items():
        occ_house = _house_of_planet(p["longitude"], asc_sign_idx)
        lvl1 = owned.get(name, [])
        lvl2 = [occ_house]
        # level 3: houses owned by the star lord of this planet (proxy for
        # "planets in the nakshatras this planet rules" — KP gives star-lord weight)
        star = p["star_lord"]
        lvl3 = owned.get(star, [])
        combined = sorted(set(lvl1 + lvl2 + lvl3))
        out[name] = {
            "owns": lvl1, "occupies": occ_house, "star_lord_owns": lvl3,
            "signifies": combined,
        }
    return out


def _promise_analysis(cusps, planets, asc_sign_idx) -> dict:
    """Stage 3.3 — does each house's sub-lord promise or deny its signification."""
    house_lord = {h: SIGN_LORDS[SIGNS[nth_sign(asc_sign_idx, h)]] for h in range(1, 13)}
    owned = {}
    for h, lord in house_lord.items():
        owned.setdefault(lord, []).append(h)

    out = {}
    for c in cusps:
        h = c["house"]
        sub = c["sub_lord"]
        # houses the sub-lord signifies (its owned + occupied)
        sub_occ = _house_of_planet(planets[sub]["longitude"], asc_sign_idx) if sub in planets else None
        sig = sorted(set(owned.get(sub, []) + ([sub_occ] if sub_occ else [])))
        # crude promise read: house promised if its sub-lord signifies the house itself
        # or a supportive house
        strong = h in sig
        out[str(h)] = {
            "cusp_sub_lord": sub, "sub_lord_signifies": sig,
            "promise": "strong" if strong else "mixed",
        }
    return out


def _cuspal_interlinks(cusps) -> dict:
    """Stage 3.6 — required-house sub-lord support per topic."""
    sub_by_house = {c["house"]: c["sub_lord"] for c in cusps}
    out = {}
    for topic, houses in KP_INTERLINKS.items():
        out[topic] = {"required_houses": houses,
                      "cusp_sub_lords": {h: sub_by_house.get(h) for h in houses}}
    return out


def ruling_planets(tc) -> dict:
    """Stage 3.5 — five ruling planets at a query moment (used for Ask Now)."""
    _setup_kp_ayanamsha()
    flag = swe.FLG_SIDEREAL
    cusps, ascmc = swe.houses_ex(tc.jd_ut, tc.lat, tc.lon, b"P", swe.FLG_SIDEREAL)
    asc = norm360(ascmc[0])
    moon_pos, _ = swe.calc_ut(tc.jd_ut, swe.MOON, flag)
    moon = norm360(moon_pos[0])
    moon_sl, moon_star, moon_sub, _ = _sub_lord_chain(moon)
    # day lord
    weekday = tc.utc_dt.weekday()  # Mon=0
    day_lords = ["Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Sun"]
    # Python Monday=0 -> Moon; classical: Sun=Sunday. Adjust: weekday() Sun=6
    day_lord_map = {0: "Moon", 1: "Mars", 2: "Mercury", 3: "Jupiter",
                    4: "Venus", 5: "Saturn", 6: "Sun"}
    return {
        "lagna_lord": SIGN_LORDS[sign_of(asc)],
        "moon_sign_lord": SIGN_LORDS[sign_of(moon)],
        "moon_star_lord": moon_star,
        "moon_sub_lord": moon_sub,
        "day_lord": day_lord_map[weekday],
    }
