"""Stage 04 — BaZi (Four Pillars of Destiny).

Solar (Hsia) calendar. Month boundaries (Jie) are computed astronomically
via Swiss Ephemeris solar-longitude crossings — never a static table.
Late Zi rule (11 PM day advance) is hardcoded. Day Master, Ten Gods,
10-year luck pillars (gender + stem direction, exact transition age),
branch interactions, Shen Sha, and Kong Wang are computed.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import swisseph as swe

from .constants import (
    STEMS, STEM_ELEMENT, STEM_YANG, BRANCHES, BRANCH_ANIMAL, BRANCH_ELEMENT,
    BRANCH_HIDDEN, PRODUCES, CONTROLS,
)

# Solar longitude that begins each solar month, mapped to the month branch.
# Tiger month starts at Sun=315° (Li Chun). Branch index: Tiger=2.
_JIE = [
    (315, 2), (345, 3), (15, 4), (45, 5), (75, 6), (105, 7),
    (135, 8), (165, 9), (195, 10), (225, 11), (255, 0), (285, 1),
]


def _sun_longitude(jd_ut: float) -> float:
    pos, _ = swe.calc_ut(jd_ut, swe.SUN, swe.FLG_SWIEPH)  # tropical
    return pos[0] % 360.0


def _solar_month_branch(jd_ut: float) -> int:
    """Earthly branch index of the BaZi solar month for this moment."""
    lon = _sun_longitude(jd_ut)
    # find the Jie segment containing lon. Segments wrap at 315.
    # order the boundaries ascending by their position relative to 315 start.
    seq = [(315, 2), (345, 3), (15, 4), (45, 5), (75, 6), (105, 7),
           (135, 8), (165, 9), (195, 10), (225, 11), (255, 0), (285, 1)]
    # normalise so 315 is the cycle start
    def rel(x):
        return (x - 315) % 360
    rl = rel(lon)
    chosen = seq[0][1]
    for boundary, branch in seq:
        if rel(boundary) <= rl:
            chosen = branch
    return chosen


# Calibrated against the documented anchor 2000-01-01 = Wu-Wu (戊午, Earth
# Horse) day. The sexagenary day index = (JDN_noon + 49) % 60, where index 0
# is Jia-Zi. Using a SINGLE index guarantees a valid stem/branch pairing
# (independent offsets could otherwise yield an impossible combination).
DAY_PILLAR_JDN_OFFSET = 49


def _day_ganzhi_index(day_dt: datetime) -> int:
    jdn_noon = int(swe.julday(day_dt.year, day_dt.month, day_dt.day, 12.0))
    return (jdn_noon + DAY_PILLAR_JDN_OFFSET) % 60


def four_pillars(tc) -> dict:
    local = tc.local_dt
    hour = local.hour
    minute = local.minute

    # ── Late Zi rule: births 23:00–23:59 advance the day pillar to next day
    day_dt = datetime(local.year, local.month, local.day)
    if tc.time_known and hour == 23:
        day_dt = day_dt + timedelta(days=1)

    # ── Year pillar: anchored to Li Chun (solar year start ~Feb 4).
    # If born before Li Chun, the BaZi year is the previous year.
    sun_lon = _sun_longitude(tc.jd_ut)
    bazi_year = local.year
    # Li Chun is when Sun hits 315°. Before that (Sun in 285..315 in Jan/Feb), prior year.
    if (local.month == 1) or (local.month == 2 and sun_lon < 315 and sun_lon > 285):
        bazi_year = local.year - 1
    year_stem_idx = (bazi_year - 4) % 10
    year_branch_idx = (bazi_year - 4) % 12

    # ── Month pillar: branch from solar term; stem by Five Tigers rule.
    month_branch_idx = _solar_month_branch(tc.jd_ut)
    # Five Tigers: month stem = (year_stem*2 + month_number_from_tiger) ...
    # Tiger month index offset from year stem group.
    tiger_offset = (month_branch_idx - 2) % 12  # months since Tiger
    month_stem_idx = ((year_stem_idx % 5) * 2 + 2 + tiger_offset) % 10

    # ── Day pillar: single sexagenary index (Late-Zi-adjusted day).
    ganzhi = _day_ganzhi_index(day_dt)
    day_stem_idx = ganzhi % 10
    day_branch_idx = ganzhi % 12

    # ── Hour pillar (only if time known).
    hour_known = tc.time_known
    if hour_known:
        hb = ((hour + 1) // 2) % 12   # 23-1 = Zi(0)
        # hour stem from day stem (Five Rats rule)
        hour_stem_idx = ((day_stem_idx % 5) * 2 + hb) % 10
        hour_branch_idx = hb
    else:
        hour_stem_idx = None
        hour_branch_idx = None

    def pillar(s_idx, b_idx):
        if s_idx is None:
            return {"available": False}
        return {
            "stem": STEMS[s_idx], "stem_element": STEM_ELEMENT[s_idx],
            "stem_polarity": "Yang" if STEM_YANG[s_idx] else "Yin",
            "branch": BRANCHES[b_idx], "animal": BRANCH_ANIMAL[b_idx],
            "branch_element": BRANCH_ELEMENT[b_idx],
            "hidden_stems": BRANCH_HIDDEN[BRANCHES[b_idx]],
        }

    pillars = {
        "year": pillar(year_stem_idx, year_branch_idx),
        "month": pillar(month_stem_idx, month_branch_idx),
        "day": pillar(day_stem_idx, day_branch_idx),
        "hour": pillar(hour_stem_idx, hour_branch_idx),
        "day_master": STEMS[day_stem_idx],
        "day_master_element": STEM_ELEMENT[day_stem_idx],
        "day_master_polarity": "Yang" if STEM_YANG[day_stem_idx] else "Yin",
        "bazi_year": bazi_year,
        "_idx": {"year_stem": year_stem_idx, "year_branch": year_branch_idx,
                 "month_branch": month_branch_idx, "day_stem": day_stem_idx,
                 "day_branch": day_branch_idx, "hour_branch": hour_branch_idx},
    }
    return pillars


def day_master_analysis(pillars: dict) -> dict:
    dm_el = pillars["day_master_element"]
    dm_yang = pillars["day_master_polarity"] == "Yang"

    # gather all elements present across stems + branches (+ hidden)
    counts = {"Wood": 0, "Fire": 0, "Earth": 0, "Metal": 0, "Water": 0}
    for k in ("year", "month", "day", "hour"):
        p = pillars[k]
        if not p.get("available", True):
            continue
        counts[p["stem_element"]] += 1
        counts[p["branch_element"]] += 1
    dominant = max(counts, key=counts.get)
    missing = [e for e, c in counts.items() if c == 0]

    # seasonal strength (Stage 4.10): does birth season support the Day Master?
    month_branch = pillars["month"]["branch_element"]
    season_support = (month_branch == dm_el or PRODUCES.get(month_branch) == dm_el)

    # supporting = same element + element that produces DM; opposing = controls DM + DM controls
    producer = [e for e, t in PRODUCES.items() if t == dm_el]
    support = counts[dm_el] + sum(counts[e] for e in producer)
    controller = [e for e, t in CONTROLS.items() if t == dm_el]
    drain = CONTROLS.get(dm_el)
    oppose = sum(counts[e] for e in controller) + counts.get(drain, 0)

    score = support + (2 if season_support else -1) - oppose
    strength = "Strong" if score >= 2 else ("Weak" if score <= -1 else "Neutral")

    if strength == "Strong":
        favourable = controller + ([drain] if drain else [])
        unfavourable = [dm_el] + producer
    else:
        favourable = [dm_el] + producer
        unfavourable = controller + ([drain] if drain else [])

    return {
        "day_master_element": dm_el,
        "day_master_polarity": "Yang" if dm_yang else "Yin",
        "strength": strength,
        "seasonal_strength_score": score,
        "season_supports": season_support,
        "favourable_elements": sorted(set(favourable)),
        "unfavourable_elements": sorted(set(unfavourable)),
        "dominant_element": dominant,
        "missing_element": missing[0] if missing else None,
        "element_counts": counts,
    }


# ── Ten Gods (Stage 4.4) ───────────────────────────────────────
def ten_gods(pillars: dict) -> dict:
    dm_el = pillars["day_master_element"]
    dm_yang = pillars["day_master_polarity"] == "Yang"

    def relation(other_el, other_yang):
        same_pol = (other_yang == dm_yang)
        if other_el == dm_el:
            return "Friend (BJ)" if same_pol else "Rob Wealth (JC)"
        if PRODUCES.get(dm_el) == other_el:  # DM produces
            return "Eating God (SH)" if same_pol else "Hurting Officer (SC)"
        if PRODUCES.get(other_el) == dm_el:  # produces DM
            return "Indirect Resource (PY)" if same_pol else "Direct Resource (ZY)"
        if CONTROLS.get(dm_el) == other_el:  # DM controls
            return "Friend wealth: Indirect Wealth (PC)" if same_pol else "Direct Wealth (ZC)"
        if CONTROLS.get(other_el) == dm_el:  # controls DM
            return "Seven Killings (QS)" if same_pol else "Direct Officer (ZG)"
        return "—"

    out = {}
    for k in ("year", "month", "hour"):
        p = pillars[k]
        if not p.get("available", True):
            continue
        idx = STEMS.index(p["stem"])
        out[k + "_stem"] = relation(p["stem_element"], STEM_YANG[idx])
    return out


# ── 10-year luck pillars (Stage 4.5 + 4.11) ────────────────────
def luck_pillars(tc, pillars: dict, gender: str) -> dict:
    idx = pillars["_idx"]
    year_yang = STEM_YANG[idx["year_stem"]]
    male = gender == "M"
    # forward if (Yang year & male) or (Yin year & female); else reverse
    forward = (year_yang and male) or (not year_yang and not male)

    # exact start age: distance from birth to the adjacent Jie boundary / 3 days = 1 year
    start_age = _exact_luck_start_age(tc, forward)

    month_stem = STEMS.index(pillars["month"]["stem"])
    month_branch = idx["month_branch"]

    out = []
    for i in range(1, 10):  # to ~age 90
        step = i if forward else -i
        s = (month_stem + step) % 10
        b = (month_branch + step) % 12
        from_age = round(start_age + (i - 1) * 10, 1)
        out.append({
            "from_age": from_age, "to_age": round(from_age + 10, 1),
            "stem": STEMS[s], "stem_element": STEM_ELEMENT[s],
            "branch": BRANCHES[b], "animal": BRANCH_ANIMAL[b],
            "branch_element": BRANCH_ELEMENT[b],
        })
    return {"direction": "forward" if forward else "reverse",
            "start_age": start_age, "pillars": out}


def _exact_luck_start_age(tc, forward: bool) -> float:
    """Days to nearest Jie boundary / 3 = start age (1 day ~ 4 months)."""
    jd = tc.jd_ut
    step = 0.25  # quarter-day search
    direction = 1 if forward else -1
    start_lon = _sun_longitude(jd)
    # boundaries at multiples of 15° starting from solar-term grid (every 15°,
    # but Jie are every 30° from 315). Use 30° grid aligned to 315.
    for n in range(1, 480):  # up to 120 days
        test = jd + direction * step * n
        lon = _sun_longitude(test)
        # crossing a 30° Jie boundary aligned to 315
        if int(((lon - 315) % 360) // 30) != int(((start_lon - 315) % 360) // 30):
            days = step * n
            return round(days / 3.0, 1)
    return 0.0


# ── Branch interactions (Stage 4.7) ────────────────────────────
_CLASH = {("Zi","Wu"),("Chou","Wei"),("Yin","Shen"),("Mao","You"),("Chen","Xu"),("Si","Hai")}
_COMBO = {("Zi","Chou"):"Earth",("Yin","Hai"):"Wood",("Mao","Xu"):"Fire",
          ("Chen","You"):"Metal",("Si","Shen"):"Water",("Wu","Wei"):"Earth"}
_HARM = {("Zi","Wei"),("Chou","Wu"),("Yin","Si"),("Mao","Chen"),("Shen","Hai"),("You","Xu")}
_DESTRUCTION = {("Zi","You"),("Chou","Chen"),("Yin","Hai"),("Mao","Wu"),("Wei","Xu"),("Si","Shen")}
_SAN_HE = [({"Yin","Wu","Xu"},"Fire"),({"Hai","Mao","Wei"},"Wood"),
           ({"Si","You","Chou"},"Metal"),({"Shen","Zi","Chen"},"Water")]


def branch_interactions(pillars: dict) -> dict:
    branches = []
    for k in ("year", "month", "day", "hour"):
        p = pillars[k]
        if p.get("available", True):
            branches.append((k, p["branch"]))
    bset = [b for _, b in branches]

    def has_pair(pairset, a, b):
        return (a, b) in pairset or (b, a) in pairset

    clashes, combos, harms, destructions = [], [], [], []
    for i in range(len(branches)):
        for j in range(i + 1, len(branches)):
            a, b = branches[i][1], branches[j][1]
            if has_pair(_CLASH, a, b):
                clashes.append(f"{a}-{b}")
            if (a, b) in _COMBO or (b, a) in _COMBO:
                el = _COMBO.get((a, b)) or _COMBO.get((b, a))
                combos.append(f"{a}-{b} → {el}")
            if has_pair(_HARM, a, b):
                harms.append(f"{a}-{b}")
            if has_pair(_DESTRUCTION, a, b):
                destructions.append(f"{a}-{b}")

    san_he = []
    for group, el in _SAN_HE:
        present = group & set(bset)
        if len(present) >= 2:
            san_he.append({"branches": sorted(present), "element": el,
                           "full": len(present) == 3})

    # Dual-nature pair resolution (spec 4.7, line 973). Tiger-Pig (Yin-Hai) and
    # Snake-Monkey (Si-Shen) are BOTH a Liu He combination AND a Liu Po destruction.
    # The birth-MONTH branch's season element decides which prevails; a neutral
    # (earth) month leaves both active so the AI weighs both.
    _SEASON = {"Yin": "wood", "Mao": "wood", "Si": "fire", "Wu": "fire",
               "Shen": "metal", "You": "metal", "Hai": "water", "Zi": "water"}
    month_branch = pillars.get("month", {}).get("branch")
    season = _SEASON.get(month_branch)
    dual_resolution = []
    for pair, combo_el, combo_season, destroy_season in (
            (("Yin", "Hai"), "Wood", "wood", "metal"),
            (("Si", "Shen"), "Water", "water", "fire")):
        if pair[0] in bset and pair[1] in bset:
            if season == combo_season:
                verdict = f"combination prevails — produces {combo_el}"
            elif season == destroy_season:
                verdict = "destruction prevails"
            else:
                verdict = "both active (neutral season) — combination and destruction in tension"
            dual_resolution.append({"pair": f"{pair[0]}-{pair[1]}",
                                    "month_branch": month_branch, "verdict": verdict})

    return {"clashes": clashes, "combinations": combos, "harms": harms,
            "destructions": destructions, "three_harmony": san_he,
            "dual_nature_resolution": dual_resolution}


# ── Shen Sha + Kong Wang (Stage 4.8/4.9) ───────────────────────
_NOBLEMAN = {  # day-stem -> nobleman branches
    "Jia": ["Chou", "Wei"], "Wu": ["Chou", "Wei"], "Yi": ["Zi", "Shen"],
    "Ji": ["Zi", "Shen"], "Bing": ["You", "Hai"], "Ding": ["You", "Hai"],
    "Geng": ["Chou", "Wei"], "Xin": ["Yin", "Wu"], "Ren": ["Mao", "Si"],
    "Gui": ["Mao", "Si"],
}
_PEACH = {"Yin": "Mao", "Wu": "Mao", "Xu": "Mao", "Shen": "You", "Zi": "You",
          "Chen": "You", "Hai": "Zi", "Mao": "Zi", "Wei": "Zi", "Si": "Wu",
          "You": "Wu", "Chou": "Wu"}
_YIMA = {"Shen": "Yin", "Zi": "Yin", "Chen": "Yin", "Yin": "Shen", "Wu": "Shen",
         "Xu": "Shen", "Hai": "Si", "Mao": "Si", "Wei": "Si", "Si": "Hai",
         "You": "Hai", "Chou": "Hai"}


def shen_sha(pillars: dict) -> dict:
    dm = pillars["day_master"]
    branches = [pillars[k]["branch"] for k in ("year", "month", "day", "hour")
                if pillars[k].get("available", True)]
    year_branch = pillars["year"]["branch"]
    active = []
    nobles = _NOBLEMAN.get(dm, [])
    if any(b in nobles for b in branches):
        active.append("Nobleman (Tian Yi Gui Ren)")
    if _PEACH.get(year_branch) in branches:
        active.append("Peach Blossom (Tao Hua)")
    if _YIMA.get(year_branch) in branches:
        active.append("Driving Horse (Yi Ma)")
    return {"active": active}


# Kong Wang (void) — the two branches absent from the day pillar's decade.
_XUN_VOID = {
    0: ["Xu", "Hai"], 10: ["Shen", "You"], 20: ["Wu", "Wei"],
    30: ["Chen", "Si"], 40: ["Yin", "Mao"], 50: ["Zi", "Chou"],
}


def kong_wang(pillars: dict) -> dict:
    idx = pillars["_idx"]
    sixty = (idx["day_stem"] - idx["day_branch"]) % 12  # position within cycle proxy
    # decade start = day pillar number // 10 * 10
    day_num = (idx["day_stem"] + 10 * ((idx["day_branch"] - idx["day_stem"]) % 12 // 2)) % 60
    decade = (day_num // 10) * 10
    return {"void_branches": _XUN_VOID.get(decade, [])}
