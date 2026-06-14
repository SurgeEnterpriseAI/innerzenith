"""Stage 08 (v3) — Ask Now: 7-layer Prashna / Hora Shastra engine.

Sidereal, Lahiri, Whole Sign houses throughout. Every planet (and the Moon
above all) is computed in real time for the exact user-reported moment — no
cached ephemeris. The engine outputs every layer as raw structured data;
the AI synthesises. The engine never pre-concludes interpretation.

Layers:
  7  Chart validity   (runs first)
  1  Kerala Anchors    (Udaya/Arudha Lagna, Kaala Hora, Gulika, Trisphuta, Drekkana)
  2  Pancha Mahasutra  (Samanya/Adhipati/Amsaka/Nakshatra/Maha)
  3  Sthira Karakas + combustion + nodal flags
  4  Tajika engine     (aspect matrix → Deethi orb → yoga, Frustration/Refranation)
  5  Moon Application Loop
  6  Event Timing
"""

from __future__ import annotations

from datetime import timedelta

import swisseph as swe

from .constants import (
    SIGNS, SIGN_LORDS, MODALITY, NAKSHATRAS, NAKSHATRA_LORD, NAKSHATRA_SPAN,
    DEETHI, PROMITTOR_HOUSE, STHIRA_KARAKA, MANDI_GHATI_DAY, HORA_DAY_LORD,
    HORA_SEQUENCE, DREKKANA_CLASS, DREKKANA_MEANING, NATURAL_FRIENDS,
    NATURAL_ENEMIES, NATURAL_BENEFICS,
)
from .vedic import (
    norm360, sign_of, sign_index, deg_in_sign, to_dms, nakshatra_of,
    house_from, nth_sign, _varga_sign_index,
)
from .timeconv import sunrise_jd, sunset_jd

SWE_PLANETS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mars": swe.MARS, "Mercury": swe.MERCURY,
    "Jupiter": swe.JUPITER, "Venus": swe.VENUS, "Saturn": swe.SATURN,
}
# orbital speed rank (faster → applies). Higher = faster.
SPEED_RANK = {"Moon": 7, "Mercury": 6, "Venus": 5, "Sun": 4, "Mars": 3,
              "Jupiter": 2, "Saturn": 1, "Rahu": 0, "Ketu": 0}


def prashna_chart(tc, question_type: str = "general") -> dict:
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    flag = swe.FLG_SIDEREAL | swe.FLG_SPEED

    # ── cast the chart (real-time, every planet) ──
    planets = {}
    for name, code in SWE_PLANETS.items():
        pos, _ = swe.calc_ut(tc.jd_ut, code, flag)
        lon = norm360(pos[0])
        planets[name] = {"lon": lon, "sign": sign_of(lon), "deg": deg_in_sign(lon),
                         "speed": pos[3], "retro": pos[3] < 0 and name not in ("Sun", "Moon")}
    rpos, _ = swe.calc_ut(tc.jd_ut, swe.MEAN_NODE, flag)
    rahu = norm360(rpos[0]); ketu = norm360(rahu + 180)
    planets["Rahu"] = {"lon": rahu, "sign": sign_of(rahu), "deg": deg_in_sign(rahu), "speed": -0.05, "retro": True}
    planets["Ketu"] = {"lon": ketu, "sign": sign_of(ketu), "deg": deg_in_sign(ketu), "speed": -0.05, "retro": True}

    _, ascmc = swe.houses_ex(tc.jd_ut, tc.lat, tc.lon, b"P", swe.FLG_SIDEREAL)
    udaya = norm360(ascmc[0])
    asc_sign_idx = sign_index(udaya)
    moon = planets["Moon"]["lon"]

    # ── Layer 7: validity (first) ──
    validity = _layer7_validity(udaya, planets, asc_sign_idx)

    # ── Significator & Promittor ──
    sp = _significator_promittor(udaya, asc_sign_idx, planets, question_type)

    # ── Layer 1: Kerala Anchors ──
    layer1 = _layer1_kerala(tc, udaya, asc_sign_idx, planets, moon, sp)

    # ── Layer 2: Pancha Mahasutra ──
    layer2 = _layer2_pancha(udaya, layer1["arudha_lagna"], asc_sign_idx, planets)

    # ── Layer 3: Sthira Karakas + flags ──
    layer3 = _layer3_sthira(planets, sp, question_type)

    # ── Layer 4: Tajika ──
    layer4 = _layer4_tajika(planets, sp, moon)

    # ── Layer 5: Moon Application Loop ──
    layer5 = _layer5_moon(planets, moon, asc_sign_idx)
    if layer5.get("voc"):
        validity["VOC_FLAG"] = True
    else:
        # Translate degrees-to-exact into a concrete calendar window: the Moon
        # moves ~13.2°/day. This is what lets the AI say "around June 15".
        days = layer5["degrees_to_exact"] / 13.2
        layer5["days_to_exact"] = round(days, 1)
        try:
            layer5["approx_date"] = (tc.local_dt.date() + timedelta(days=round(days))).isoformat()
        except Exception:
            pass

    # ── Strongest signal & notable contacts (so the AI names the loudest thing) ──
    notable = _notable_signals(planets, sp, moon)

    # ── Layer 6: Event Timing ──
    layer6 = _layer6_timing(layer4, sp, planets, moon, MODALITY[sign_of(udaya)], layer3)

    # ── Condition quality (dignity + placement of S and P) ──
    condition_quality = _condition_quality(planets, sp, asc_sign_idx)

    return {
        "engine": "prashna-7layer-v3",
        "prashna_lagna": {
            "sign": sign_of(udaya), "degrees_in_sign": round(deg_in_sign(udaya), 4),
            "dms": to_dms(deg_in_sign(udaya)), "modality": MODALITY[sign_of(udaya)],
            "nakshatra": nakshatra_of(udaya)[0], "pada": nakshatra_of(udaya)[1],
        },
        "significator": sp["S"], "promittor": sp["P"],
        "promittor_house": sp["P_house"], "sp_collision_resolved": sp["collision"],
        "question_type": question_type,
        "validity_flags": validity,
        "layer1_kerala_anchors": layer1,
        "layer2_pancha_mahasutra": layer2,
        "layer3_condition_flags": layer3,
        "layer4_tajika": layer4,
        "layer5_moon_application": layer5,
        "layer6_event_timing": layer6,
        "notable_signals": notable,
        "condition_quality": condition_quality,
    }


def _notable_signals(planets: dict, sp: dict, moon: float) -> dict:
    """Surface the single loudest thing in the chart so the AI can name it.
    Crucially, gives the AI the INTERPRETATION, not just the raw contact:
    a benefic (especially exalted) conjunct the querent's significator = a
    genuine opportunity forming right alongside them."""
    from .constants import EXALTATION
    S = sp.get("S")
    out = {"tightest_contact_to_S": None, "benefic_contacts_to_S": [],
           "exact_conjunctions": [], "opportunity_forming": None}
    if S not in planets:
        return out
    s_lon = planets[S]["lon"]
    benefics = {"Jupiter", "Venus", "Mercury", "Moon"}
    best = None
    opp = None
    for name, p in planets.items():
        if name == S:
            continue
        orb = _orb(s_lon, p["lon"])
        if best is None or orb < best[1]:
            best = (name, orb)
        if orb <= 2.0:
            out["exact_conjunctions"].append(f"{S}+{name} ({round(orb,2)}°)")
        if name in benefics and orb <= 8.0:
            exalted = name in EXALTATION and p["sign"] == EXALTATION[name][0]
            out["benefic_contacts_to_S"].append(
                f"{name} ({round(orb,1)}°{', exalted' if exalted else ''})")
            # tightest benefic contact becomes the 'opportunity forming' signal
            if orb <= 6.0 and (opp is None or orb < opp["orb"]):
                opp = {"planet": name, "orb": round(orb, 2), "exalted": exalted}
    if best:
        out["tightest_contact_to_S"] = {"planet": best[0], "orb": round(best[1], 2)}
    if opp:
        strength = "exceptionally strong (exalted)" if opp["exalted"] else "strong"
        out["opportunity_forming"] = (
            f"A benefic force is in close contact with the querent ({opp['orb']}°) and it is "
            f"{strength}. INTERPRET THIS AS: a genuine opportunity is forming right alongside "
            f"the person — fresh, real, and moving in the same direction as them — even if the "
            f"main question's own outcome reads as a 'no'. This is usually the headline of the reading."
        )
    return out


# ─── Condition quality of S and P (dignity + placement) ────────
# House themes in PLAIN language so the AI can speak the meaning of a
# placement without ever naming a house number (Rule 1).
_HOUSE_THEME = {
    1: "the person themselves — vitality, how they show up",
    2: "money, resources, security, family",
    3: "effort, initiative, communication, courage",
    4: "home, foundations, inner peace, property",
    5: "creativity, recognition, children, what they put into the world",
    6: "work, service, the daily grind, obstacles, health, competition",
    7: "partnership, the other person, deals, the other side",
    8: "upheaval, shared resources, hidden things, transformation",
    9: "fortune, belief, mentors, higher learning, luck",
    10: "career, public standing, authority, the institution",
    11: "gains, income, networks, fulfilment of desires",
    12: "endings, loss, letting go, foreign places, retreat",
}


def _condition_quality(planets, sp, asc_sign_idx):
    """Surface the DIGNITY (strength/quality) and house placement of the
    significator (the querent) and promittor (the outcome). This is what lets
    the AI say a thing is 'high-quality and well-resourced' vs 'compromised',
    and describe the mechanism of the outcome — instead of vague filler."""
    from .constants import EXALTATION, DEBILITATION, OWN_SIGNS, SIGNS as _S

    def one(planet):
        if planet not in planets:
            return None
        p = planets[planet]
        sign = p["sign"]
        if planet in EXALTATION and sign == EXALTATION[planet][0]:
            dignity = "exalted"; plain = "exceptionally strong, high-quality, well-resourced"
        elif planet in DEBILITATION and sign == DEBILITATION[planet]:
            dignity = "debilitated"; plain = "weakened, under strain, compromised or lower-quality"
        elif planet in OWN_SIGNS and sign in OWN_SIGNS[planet]:
            dignity = "own sign"; plain = "comfortable, on home ground, self-sufficient"
        else:
            dignity = "neutral"; plain = "workable — neither especially strong nor weak"
        house = house_from(asc_sign_idx, sign_index(p["lon"]))
        rules = []
        for s in OWN_SIGNS.get(planet, []):
            h = house_from(asc_sign_idx, _S.index(s))
            rules.append({"house": h, "theme": _HOUSE_THEME.get(h, "")})
        return {
            "sign": sign, "dignity": dignity, "quality_plain": plain,
            "sits_in_house": house, "sits_in_house_theme": _HOUSE_THEME.get(house, ""),
            "rules_houses": rules, "retrograde": p.get("retro", False),
        }

    return {"significator": one(sp.get("S")), "promittor": one(sp.get("P"))}


# ─── Significator / Promittor (8.2) ────────────────────────────
def _significator_promittor(udaya, asc_sign_idx, planets, qtype):
    s_lord = SIGN_LORDS[sign_of(udaya)]
    houses = PROMITTOR_HOUSE.get(qtype, [])
    collision = None
    if not houses:
        # ambiguous → open reading: strongest applying aspect to Lagna lord
        p_lord = _strongest_applying_to(s_lord, planets)
        p_house = None
    else:
        # if dual house, pick the one whose lord has the stronger connection to S
        candidates = []
        for h in houses:
            lord = SIGN_LORDS[SIGNS[nth_sign(asc_sign_idx, h)]]
            candidates.append((h, lord))
        # choose the lord with the smaller orb to S (proxy for stronger connection)
        def orb_to_s(lord):
            if lord == s_lord:
                return 999
            return _orb(planets[s_lord]["lon"], planets[lord]["lon"])
        h, p_lord = min(candidates, key=lambda c: orb_to_s(c[1]))
        p_house = h

    # S = P collision handler
    if p_lord == s_lord:
        if s_lord != "Moon":
            collision = "S=P → Moon becomes S, Lagna lord becomes P"
            return {"S": "Moon", "P": s_lord, "P_house": p_house, "collision": collision}
        else:
            collision = "Moon shared → Udaya Lagna degree acts as S"
            return {"S": "Lagna-degree", "P": s_lord, "P_house": p_house, "collision": collision}
    return {"S": s_lord, "P": p_lord, "P_house": p_house, "collision": collision}


def _orb(a, b):
    d = abs(norm360(a) - norm360(b))
    return min(d, 360 - d)


def _strongest_applying_to(target, planets):
    best, best_orb = None, 999
    for name, p in planets.items():
        if name == target:
            continue
        o = _orb(p["lon"], planets[target]["lon"])
        if o < best_orb:
            best, best_orb = name, o
    return best


# ─── Layer 1: Kerala Anchors (8.3) ─────────────────────────────
def _layer1_kerala(tc, udaya, asc_sign_idx, planets, moon, sp):
    # Arudha Lagna of the Prashna chart
    lagna_lord = SIGN_LORDS[sign_of(udaya)]
    lord_sign_idx = sign_index(planets[lagna_lord]["lon"])
    x = house_from(asc_sign_idx, lord_sign_idx)
    arudha_idx = nth_sign(lord_sign_idx, x)
    if x == 1:
        arudha_idx = nth_sign(asc_sign_idx, 10)
    elif x == 7:
        arudha_idx = nth_sign(asc_sign_idx, 4)

    # Kaala Hora
    hora = _kaala_hora(tc)
    hora_res = hora["hora_lord"] in {lagna_lord, SIGN_LORDS[SIGNS[arudha_idx]], sp.get("P")}

    # Gulika
    gulika = _gulika(tc)
    if gulika:
        gulika["house_from_lagna"] = house_from(asc_sign_idx, sign_index(gulika["lon"]))

    # Trisphuta = Udaya + Moon + Gulika longitudes
    tris_lon = norm360(udaya + moon + (gulika["lon"] if gulika else 0))
    tnaksh, tpada, tnlord, _, _ = nakshatra_of(tris_lon)
    tris_node = None
    for nd in ("Rahu", "Ketu"):
        if _orb(tris_lon, planets[nd]["lon"]) <= 3:
            tris_node = nd
    trisphuta = {
        "sign": sign_of(tris_lon), "degree": round(deg_in_sign(tris_lon), 2),
        "house": house_from(asc_sign_idx, sign_index(tris_lon)),
        "nakshatra": tnaksh, "nakshatra_lord": tnlord,
        "node_within_3deg": tris_node,
    }

    # Drekkana of Udaya Lagna
    drek_idx = _varga_sign_index(udaya, 3)
    drek_class = DREKKANA_CLASS[SIGNS[drek_idx]]

    return {
        "udaya_lagna": {"sign": sign_of(udaya), "degree": round(deg_in_sign(udaya), 2),
                        "nakshatra": nakshatra_of(udaya)[0], "pada": nakshatra_of(udaya)[1],
                        "modality": MODALITY[sign_of(udaya)]},
        "arudha_lagna": {"sign": SIGNS[arudha_idx], "lord": SIGN_LORDS[SIGNS[arudha_idx]]},
        "kaala_hora": {"hora_lord": hora["hora_lord"], "hora_resonance": hora_res},
        "gulika": gulika,
        "trisphuta": trisphuta,
        "drekkana": {"sign": SIGNS[drek_idx], "classification": drek_class,
                     "meaning": DREKKANA_MEANING[drek_class]},
    }


def _kaala_hora(tc):
    sr = sunrise_jd(tc.jd_ut, tc.lat, tc.lon)
    ss = sunset_jd(tc.jd_ut, tc.lat, tc.lon)
    weekday = tc.local_dt.weekday()  # Mon=0..Sun=6
    day_lord = HORA_DAY_LORD[weekday]
    if sr is None or ss is None:
        return {"hora_lord": day_lord}
    jd = tc.jd_ut
    if sr <= jd < ss:                       # daytime
        elapsed = jd - sr
        hora_len = (ss - sr) / 12.0
    elif jd >= ss:                          # evening/night after sunset
        elapsed = jd - ss
        hora_len = ((sr + 1.0) - ss) / 12.0
    else:                                   # before sunrise (early morning)
        prev_set = ss - 1.0
        elapsed = jd - prev_set
        hora_len = (sr - prev_set) / 12.0
    hora_num = int(elapsed / hora_len) if hora_len > 0 else 0
    start = HORA_SEQUENCE.index(day_lord)
    lord = HORA_SEQUENCE[(start + hora_num) % 7]
    return {"hora_lord": lord, "hora_number": hora_num + 1}


def _gulika(tc):
    sr = sunrise_jd(tc.jd_ut, tc.lat, tc.lon)
    ss = sunset_jd(tc.jd_ut, tc.lat, tc.lon)
    if sr is None or ss is None:
        return None
    weekday = tc.local_dt.weekday()
    if sr <= tc.jd_ut < ss:  # daytime
        mandi = MANDI_GHATI_DAY[weekday]
        gulika_jd = sr + (mandi / 30.0) * (ss - sr)
    else:  # nighttime — night Gulika starts from the lord of the 5th weekday,
           # i.e. the day Mandi-ghati of (weekday+4). Verified against the
           # classical night Gulika table (Sun-night=10, Mon=6, Tue=2, Wed=26,
           # Thu=22, Fri=18, Sat=14 ghatis from sunset).
        next_sr = sr + 1.0
        mandi = MANDI_GHATI_DAY[(weekday + 4) % 7]
        gulika_jd = ss + (mandi / 30.0) * (next_sr - ss)
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    _, ascmc = swe.houses_ex(gulika_jd, tc.lat, tc.lon, b"P", swe.FLG_SIDEREAL)
    glon = norm360(ascmc[0])
    return {"lon": glon, "sign": sign_of(glon), "degree": round(deg_in_sign(glon), 2)}


# ─── Layer 2: Pancha Mahasutra (8.4) ───────────────────────────
def _layer2_pancha(udaya, arudha, asc_sign_idx, planets):
    u_sign = sign_of(udaya)
    a_sign = arudha["sign"]
    u_lord = SIGN_LORDS[u_sign]
    a_lord = arudha["lord"]

    # Samanya — modal/odd-even alignment
    same_modality = MODALITY[u_sign] == MODALITY[a_sign]
    same_parity = (SIGNS.index(u_sign) % 2) == (SIGNS.index(a_sign) % 2)
    samanya = "aligned" if (same_modality or same_parity) else "misaligned"

    # Adhipati — natural friendship of the two lords
    if a_lord in NATURAL_FRIENDS.get(u_lord, set()):
        adhipati = "friends — circumstances cooperate"
    elif a_lord in NATURAL_ENEMIES.get(u_lord, set()):
        adhipati = "enemies — environment works against the intent"
    else:
        adhipati = "neutral"

    # Amsaka — D9 sign relationship
    u_d9 = SIGNS[_varga_sign_index(udaya, 9)]
    a_d9 = SIGNS[_varga_sign_index(SIGNS.index(a_sign) * 30 + 1, 9)]
    u_d9_lord = SIGN_LORDS[u_d9]; a_d9_lord = SIGN_LORDS[a_d9]
    if a_d9_lord in NATURAL_FRIENDS.get(u_d9_lord, set()):
        amsaka = "supportive subconscious"
    elif a_d9_lord in NATURAL_ENEMIES.get(u_d9_lord, set()):
        amsaka = "hostile subconscious — a deep belief works against the wish"
    else:
        amsaka = "neutral subconscious"

    # Nakshatra — Tara Bala (count / 9 remainder)
    u_nak = int(norm360(udaya) // NAKSHATRA_SPAN)
    a_nak = NAKSHATRAS.index(nakshatra_of(SIGNS.index(a_sign) * 30 + 1)[0])
    count = ((a_nak - u_nak) % 27) + 1
    tara = count % 9
    tara_quality = "anxious / unsteady" if tara in (3, 5, 7) else "confident / ready"

    # Maha — Arudha vs 10th from Udaya
    tenth_sign = SIGNS[nth_sign(asc_sign_idx, 10)]
    maha = "user has genuine agency" if MODALITY[a_sign] == MODALITY[tenth_sign] else "outcome largely outside user's control"

    return {
        "samanya": samanya, "adhipati": adhipati, "amsaka": amsaka,
        "nakshatra_tara": {"tara_number": tara, "quality": tara_quality},
        "maha": maha,
    }


# ─── Layer 3: Sthira Karakas + flags (8.5) ─────────────────────
def _layer3_sthira(planets, sp, qtype):
    sthira = STHIRA_KARAKA.get(qtype, [])
    sun_lon = planets["Sun"]["lon"]

    def combust(name):
        if name in ("Sun", "Lagna-degree") or name not in planets:
            return False
        return _orb(planets[name]["lon"], sun_lon) <= 8

    def nodal(name):
        if name not in planets:
            return "None"
        if _orb(planets[name]["lon"], planets["Rahu"]["lon"]) <= 3:
            return "Rahu"
        if _orb(planets[name]["lon"], planets["Ketu"]["lon"]) <= 3:
            return "Ketu"
        return "None"

    S, P = sp["S"], sp["P"]
    return {
        "sthira_karakas": sthira,
        "sthira_condition": {
            k: {"combust": combust(k), "retrograde": planets[k]["retro"], "nodal": nodal(k)}
            for k in sthira if k in planets
        },
        "S_combust": combust(S), "P_combust": combust(P),
        "S_nodal_affliction": nodal(S), "P_nodal_affliction": nodal(P),
    }


# ─── Layer 4: Tajika (8.6) ─────────────────────────────────────
_ASPECT_MATRIX = {
    1: ("Ekatva", "conjunction"),
    3: ("Paroksha", "indirect friendly"), 11: ("Paroksha", "indirect friendly"),
    5: ("Pratyaksha", "direct friendly"), 9: ("Pratyaksha", "direct friendly"),
    7: ("Pratyaksha Shatrutva", "direct hostile"),
    4: ("Paroksha Shatrutva", "hidden hostile"), 10: ("Paroksha Shatrutva", "hidden hostile"),
    2: ("Asambandhah", "no aspect"), 6: ("Asambandhah", "no aspect"),
    8: ("Asambandhah", "no aspect"), 12: ("Asambandhah", "no aspect"),
}


def _layer4_tajika(planets, sp, moon):
    S, P = sp["S"], sp["P"]
    if S not in planets or P not in planets:
        return {"yoga": "Indeterminate", "reason": "S or P is a non-planet point"}

    ps, pp = planets[S], planets[P]
    dist = house_from(sign_index(ps["lon"]), sign_index(pp["lon"]))
    aspect_name, aspect_nature = _ASPECT_MATRIX[dist]

    # Step 2 — Deethi orb (only if a valid aspect, i.e. not Asambandhah)
    yoga = None; retro_ith = False; details = {}
    if aspect_name == "Asambandhah":
        # scan Nakta bridge via Moon
        nakta = _nakta_bridge(planets, S, P, moon)
        yoga = "Nakta" if nakta else "Durapha"
        details["nakta_bridge"] = nakta
    else:
        orb = (DEETHI.get(S, 8) + DEETHI.get(P, 8)) / 2.0
        sep = _orb(ps["lon"], pp["lon"])
        within = sep <= orb
        # Kamboola — mutual reception
        kamboola = SIGN_LORDS[ps["sign"]] == P and SIGN_LORDS[pp["sign"]] == S
        if dist == 1:
            yoga = "Ekatva"
        elif within:
            faster = S if SPEED_RANK[S] >= SPEED_RANK[P] else P
            slower = P if faster == S else S
            applying = planets[faster]["deg"] < planets[slower]["deg"]
            if applying:
                yoga = "Ithasala"
                retro_ith = planets[faster]["retro"] or planets[slower]["retro"]
            else:
                yoga = "Eshrafa"
        else:
            nakta = _nakta_bridge(planets, S, P, moon)
            yoga = "Nakta" if nakta else "Durapha"
            details["nakta_bridge"] = nakta
        details["orb"] = round(orb, 2)
        details["separation"] = round(sep, 2)
        details["kamboola"] = kamboola

    # Frustration (Kuttha) & Refranation (Tambira) — simplified detection
    frustration = _frustration(planets, S, P)
    refranation = (ps["retro"] or pp["retro"]) and yoga == "Ithasala"

    return {
        "aspect": {"sign_distance": dist, "name": aspect_name, "nature": aspect_nature},
        "yoga": yoga, "retrograde_ithasala": retro_ith,
        "frustration": frustration, "refranation": refranation,
        **details,
    }


def _nakta_bridge(planets, S, P, moon):
    """Moon forms an Ithasala with both S and P (faster intermediary)."""
    for x in (S, P):
        if x not in planets:
            return False
    orb_s = (DEETHI["Moon"] + DEETHI.get(S, 8)) / 2.0
    orb_p = (DEETHI["Moon"] + DEETHI.get(P, 8)) / 2.0
    return _orb(moon, planets[S]["lon"]) <= orb_s and _orb(moon, planets[P]["lon"]) <= orb_p


def _frustration(planets, S, P):
    """A faster third planet reaches P's degree before S completes the aspect."""
    if S not in planets or P not in planets:
        return {"flag": False}
    for name, p in planets.items():
        if name in (S, P) or name in ("Rahu", "Ketu"):
            continue
        if SPEED_RANK[name] > SPEED_RANK[S] and _orb(p["lon"], planets[P]["lon"]) <= 3:
            return {"flag": True, "intercepting_planet": name}
    return {"flag": False}


# ─── Layer 5: Moon Application Loop (8.7) ───────────────────────
def _layer5_moon(planets, moon, asc_sign_idx):
    moon_sign_idx = sign_index(moon)
    sign_end = (moon_sign_idx + 1) * 30
    candidates = []
    for name, p in planets.items():
        if name == "Moon":
            continue
        # planet must be ahead of the Moon within its current sign sweep
        if planets["Moon"]["lon"] < p["lon"] < sign_end:
            dist = house_from(moon_sign_idx, sign_index(p["lon"]))
            aspect_name, nature = _ASPECT_MATRIX[dist]
            if aspect_name != "Asambandhah":
                candidates.append((p["lon"] - moon, name, aspect_name, nature))
    if not candidates:
        return {"voc": True, "note": "Moon forms no qualifying Tajika aspect before leaving its sign"}
    candidates.sort()
    delta, name, aspect_name, nature = candidates[0]
    nat = "Friendly" if "friendly" in nature else ("Hostile" if "hostile" in nature else "Neutral")
    return {
        "voc": False,
        "next_applying_planet": name,
        "aspect_type": aspect_name,
        "aspect_nature": nat,
        "degrees_to_exact": round(delta, 2),
    }


# ─── Layer 6: Event Timing (8.8) ───────────────────────────────
def _layer6_timing(layer4, sp, planets, moon, lagna_modality, layer3):
    yoga = layer4.get("yoga")
    if yoga not in ("Ithasala", "Nakta"):
        return None  # timing skipped for Eshrafa / Durapha / hostile Ekatva

    S, P = sp["S"], sp["P"]
    if yoga == "Ithasala":
        anchor = "S_to_P"
        delta = _orb(planets[S]["lon"], planets[P]["lon"]) if S in planets and P in planets else 0
    else:  # Nakta
        anchor = "Moon_to_P"
        delta = _orb(moon, planets[P]["lon"]) if P in planets else 0

    # modality multiplier (v4 — base scale only; Sthira adjustment is an AI
    # synthesis note, not a hardcoded sub-modifier)
    if lagna_modality == "movable":
        scale, unit = "days", "1° = 1 day"
    elif lagna_modality == "dual":
        scale, unit = "weeks", "1° = 1 week"
    else:
        scale, unit = "months", "1° = 1 month"

    slow_sthira = any(k in ("Saturn", "Jupiter") for k in layer3.get("sthira_karakas", []))

    return {
        "degree_delta": round(delta, 2),
        "timing_anchor": anchor,
        "time_scale": scale,
        "estimated_units": round(delta, 1),
        "rule": unit,
        # AI cross-references: if the matter involves a slow/entrenched theme,
        # widen the framing (days→weeks, weeks→months) rather than taking the
        # raw number literally.
        "sthira_is_slow": slow_sthira,
    }


# ─── Layer 7: Validity (8.9) ───────────────────────────────────
def _layer7_validity(udaya, planets, asc_sign_idx):
    deg = deg_in_sign(udaya)
    flags = {}
    if deg < 3:
        flags["FLAG_EARLY"] = True
    if deg > 27:
        flags["FLAG_LATE"] = True
    # sign boundary (within 1°)
    if deg < 1 or deg > 29:
        flags["FLAG_SIGN_BOUNDARY"] = True
    # nakshatra boundary (within 0.5°)
    within_nak = norm360(udaya) % NAKSHATRA_SPAN
    if within_nak < 0.5 or within_nak > (NAKSHATRA_SPAN - 0.5):
        flags["FLAG_NAKSHATRA_BOUNDARY"] = True
    flags["VOC_FLAG"] = False  # set by layer 5
    return flags
