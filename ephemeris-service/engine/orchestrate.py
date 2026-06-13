"""Builds the complete stored profile from all four systems.

Stage 06 storage model: one call at onboarding computes everything; the
result is stored permanently. profile_fidelity governs how much is real.
"""

from __future__ import annotations

from datetime import datetime

import swisseph as swe

from .timeconv import build_time_context
from . import vedic as v
from . import kp as kp_mod
from . import bazi as bz
from . import ziwei as zw
from . import cache_keys as ck


def compute_profile(
    birth_date: str,
    birth_time: str | None,
    lat: float,
    lon: float,
    tz_name: str,
    gender: str,
    time_to_minute: bool = True,
    now: datetime | None = None,
) -> dict:
    now = now or datetime(2026, 1, 1)
    time_known = bool(birth_time)
    tc = build_time_context(birth_date, birth_time, lat, lon, tz_name)

    # profile_fidelity (Stage 6.1)
    if time_known and time_to_minute:
        fidelity = "FULL_METRIC"
    elif time_known:
        fidelity = "HIGH_PARTIAL"
    else:
        fidelity = "MACRO_ONLY"

    # ── Vedic ──
    planets = v.planet_positions(tc)
    houses = v.lagna_and_houses(tc)
    asc_idx = houses["asc_sign_index"]
    asc_lon = houses["ascendant"]["total_degrees"]
    v.assign_houses(planets, asc_idx)
    navamsha = v.navamsha_simple(planets, asc_lon)

    birth_dt_naive = tc.local_dt.replace(tzinfo=None)
    daytime = v.is_daytime_birth(tc) if time_known else True

    vedic_block = {
        "ascendant": houses["ascendant"] if time_known else {"note": "requires birth time"},
        "midheaven": houses["midheaven"],
        "planets": planets,
        "functional_nature": v.functional_nature(asc_idx) if time_known else {},
        "dignities": v.dignities(planets, asc_idx, navamsha),
        "divisional_charts": v.divisional_charts(planets, asc_lon, time_known, time_to_minute),
        "navamsha": navamsha,
        "graha_drishti": v.graha_drishti(planets, asc_idx),
        "rasi_drishti": v.rasi_drishti(),
    }
    if time_known:
        vedic_block["special_lagnas"] = v.special_lagnas(tc, asc_lon)
        vedic_block["shadbala"] = v.shadbala(planets, asc_idx, tc)
        vedic_block["arudha_padas"] = v.arudha_padas(planets, asc_idx)
        vedic_block["chara_karakas"] = v.chara_karakas(planets)
        vedic_block["ashtakavarga"] = v.ashtakavarga(planets, asc_idx)
        yogas = v.detect_yogas(planets, asc_idx, vedic_block["functional_nature"], navamsha)
        vedic_block["yogas"] = yogas
        vedic_block["conditional_dashas"] = v.conditional_dashas(asc_idx, planets, daytime)
        vedic_block["narayana_dasha"] = v.narayana_dasha(asc_idx, planets, birth_dt_naive, navamsha)
        vedic_block["varshaphala"] = {
            str(y): v.varshaphala(tc, planets, asc_idx, y) for y in range(now.year, now.year + 2)
        }
    else:
        yogas = []
        vedic_block["ashtakavarga"] = {"available": False, "reason": "needs birth time"}
        vedic_block["narayana_dasha"] = v.narayana_dasha(asc_idx, planets, birth_dt_naive, None)
        # moon_sign_uncertain (6.4): with no birth time the Moon may cross a sign
        # boundary during the birth date. If so, store both candidate signs and
        # flag — the AI asks one clarifying question in the first relevant session.
        try:
            m0 = v.planet_positions(build_time_context(birth_date, "00:01", lat, lon, tz_name))["Moon"]["total_degrees"]
            m1 = v.planet_positions(build_time_context(birth_date, "23:59", lat, lon, tz_name))["Moon"]["total_degrees"]
            s0, s1 = v.SIGNS[v.sign_index(m0)], v.SIGNS[v.sign_index(m1)]
            if s0 != s1:
                vedic_block["moon_sign_uncertain"] = True
                vedic_block["possible_moon_signs"] = [s0, s1]
            else:
                vedic_block["moon_sign_uncertain"] = False
        except Exception:
            vedic_block["moon_sign_uncertain"] = False

    # Vimshottari works from Moon (available even without exact time, less precise)
    dasha = v.vimshottari_dasha(planets["Moon"]["total_degrees"], tc.local_dt.replace(tzinfo=None))
    dasha_current = v.current_periods(dasha, now)
    vedic_block["vimshottari"] = dasha
    vedic_block["current_periods"] = dasha_current

    # ── KP (needs birth time for cusps) ──
    if time_known:
        kp_block = kp_mod.kp_chart(tc)
    else:
        kp_block = {"available": False, "reason": "KP sub-lords need birth time"}

    # ── BaZi ──
    pillars = bz.four_pillars(tc)
    dma = bz.day_master_analysis(pillars)
    bazi_block = {
        "pillars": pillars,
        "day_master_analysis": dma,
        "ten_gods": bz.ten_gods(pillars),
        "luck_pillars": bz.luck_pillars(tc, pillars, gender),
        "branch_interactions": bz.branch_interactions(pillars),
        "shen_sha": bz.shen_sha(pillars),
        "kong_wang": bz.kong_wang(pillars),
        "hour_known": time_known,
    }

    # ── Zi Wei ──
    ziwei_block = zw.ziwei_chart(tc, gender)

    # ── Sade-Sati + cache keys ──
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    sat_pos, _ = swe.calc_ut(swe.julday(now.year, now.month, now.day, 12.0),
                             swe.SATURN, swe.FLG_SIDEREAL)
    sade = ck.sade_sati_status(v.sign_index(planets["Moon"]["total_degrees"]),
                               v.sign_index(sat_pos[0]))
    cache = ck.build_cache_keys(vedic_block, dma, pillars, ziwei_block,
                                dasha_current, yogas,
                                vedic_block.get("ashtakavarga", {}), sade)

    return {
        "meta": {
            "engine_version": "5.1",
            "computed_at": now.isoformat(),
            "profile_fidelity": fidelity,
            "time_context": tc.as_dict(),
        },
        "profile_fidelity": fidelity,
        "vedic": vedic_block,
        "kp": kp_block,
        "bazi": bazi_block,
        "ziwei": ziwei_block,
        "cache_keys": cache,
    }
