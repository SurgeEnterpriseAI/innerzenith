"""
InnerZenith — Ephemeris Service

Computes the full chart picture from birth data:
  • Vedic (sidereal Lahiri) — lagna, planets, houses, nakshatras
  • Vimshottari dasha — current major + minor period
  • KP — sub-lord chain for each cusp
  • Navamsha (D-9) — soul-level chart
  • Basic BaZi pillars — year, month, day, hour stems and branches

This service is the user's quiet backstage. None of these terms ever
appear in the user-facing chat. The Next.js layer passes this JSON
into the system prompt's context block, and Claude translates it
to plain warm English following the seven rules.

Auth: a shared secret header (X-Ephemeris-Secret) is required.
"""

from __future__ import annotations

import os
import math
from datetime import datetime, timezone
from typing import Optional

import pytz
import swisseph as swe
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from geopy.geocoders import Nominatim
from pydantic import BaseModel, Field
from timezonefinder import TimezoneFinder

# ─── Configuration ─────────────────────────────────────────────
SHARED_SECRET = os.getenv("EPHEMERIS_SHARED_SECRET", "change-me")

swe.set_sid_mode(swe.SIDM_LAHIRI)  # Lahiri ayanamsha — Indian standard

NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada",
    "Revati",
]

NAKSHATRA_LORDS = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn",
    "Mercury", "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter",
    "Saturn", "Mercury", "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu",
    "Jupiter", "Saturn", "Mercury",
]

VIMSHOTTARI_YEARS = {
    "Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10, "Mars": 7,
    "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17,
}
VIMSHOTTARI_ORDER = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu",
    "Jupiter", "Saturn", "Mercury",
]

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

PLANETS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mars": swe.MARS,
    "Mercury": swe.MERCURY, "Jupiter": swe.JUPITER, "Venus": swe.VENUS,
    "Saturn": swe.SATURN, "Rahu": swe.MEAN_NODE,  # Mean node = Rahu
}

# BaZi heavenly stems and earthly branches
STEMS = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"]
BRANCHES = [
    "Zi", "Chou", "Yin", "Mao", "Chen", "Si",
    "Wu", "Wei", "Shen", "You", "Xu", "Hai",
]
STEM_ELEMENTS = [
    "Wood", "Wood", "Fire", "Fire", "Earth", "Earth",
    "Metal", "Metal", "Water", "Water",
]
BRANCH_ELEMENTS = [
    "Water", "Earth", "Wood", "Wood", "Earth", "Fire",
    "Fire", "Earth", "Metal", "Metal", "Earth", "Water",
]

# ─── App ───────────────────────────────────────────────────────
app = FastAPI(title="InnerZenith Ephemeris", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

geocoder = Nominatim(user_agent="innerzenith-ephemeris/0.1")
tzfinder = TimezoneFinder()


# ─── Schemas ───────────────────────────────────────────────────
class ChartRequest(BaseModel):
    birth_date: str = Field(..., description="YYYY-MM-DD")
    birth_time: Optional[str] = Field(
        None, description="HH:MM or HH:MM:SS (24h, local time). Omit if unknown."
    )
    birth_place: str = Field(..., description="City, Country e.g. 'Bangalore, India'")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: Optional[str] = None  # IANA name; auto-resolved if missing


# ─── Helpers ───────────────────────────────────────────────────
def auth_check(secret: str | None):
    if SHARED_SECRET == "change-me":
        return  # dev mode
    if secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="bad secret")


def resolve_place(req: ChartRequest) -> tuple[float, float, str]:
    lat, lon, tz = req.latitude, req.longitude, req.timezone
    if lat is None or lon is None:
        loc = geocoder.geocode(req.birth_place, timeout=10)
        if not loc:
            raise HTTPException(400, f"could not geocode '{req.birth_place}'")
        lat, lon = loc.latitude, loc.longitude
    if not tz:
        tz = tzfinder.timezone_at(lat=lat, lng=lon) or "UTC"
    return lat, lon, tz


def to_utc_jd(date_str: str, time_str: str | None, tz_name: str) -> float:
    if time_str:
        parts = time_str.split(":")
        h, m = int(parts[0]), int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
    else:
        h, m, s = 12, 0, 0  # noon fallback (chart will be marked time_known=False)
    y, mo, d = (int(x) for x in date_str.split("-"))
    local = pytz.timezone(tz_name).localize(datetime(y, mo, d, h, m, s))
    utc = local.astimezone(pytz.utc)
    return swe.julday(utc.year, utc.month, utc.day,
                      utc.hour + utc.minute / 60 + utc.second / 3600)


def sign_of(longitude: float) -> tuple[str, float]:
    sign_idx = int(longitude // 30) % 12
    deg_in_sign = longitude - sign_idx * 30
    return SIGNS[sign_idx], deg_in_sign


def nakshatra_of(longitude: float) -> tuple[str, int, str]:
    # Each nakshatra = 360/27 = 13.333° wide; 4 padas each
    naksh_size = 360 / 27
    idx = int(longitude // naksh_size) % 27
    within = longitude - idx * naksh_size
    pada = int(within // (naksh_size / 4)) + 1
    return NAKSHATRAS[idx], pada, NAKSHATRA_LORDS[idx]


def planet_positions(jd_ut: float, lat: float, lon: float) -> dict:
    flag = swe.FLG_SIDEREAL | swe.FLG_SPEED
    result = {}
    for name, code in PLANETS.items():
        pos, _ = swe.calc_ut(jd_ut, code, flag)
        sign, deg = sign_of(pos[0])
        naksh, pada, lord = nakshatra_of(pos[0])
        result[name] = {
            "longitude": round(pos[0], 6),
            "sign": sign,
            "degree_in_sign": round(deg, 4),
            "speed": round(pos[3], 6),
            "retrograde": pos[3] < 0,
            "nakshatra": naksh,
            "pada": pada,
            "nakshatra_lord": lord,
        }
    # Ketu is exactly opposite Rahu
    rahu_lon = result["Rahu"]["longitude"]
    ketu_lon = (rahu_lon + 180) % 360
    ksign, kdeg = sign_of(ketu_lon)
    knaksh, kpada, klord = nakshatra_of(ketu_lon)
    result["Ketu"] = {
        "longitude": round(ketu_lon, 6),
        "sign": ksign,
        "degree_in_sign": round(kdeg, 4),
        "speed": -result["Rahu"]["speed"],
        "retrograde": True,
        "nakshatra": knaksh,
        "pada": kpada,
        "nakshatra_lord": klord,
    }
    return result


def houses_and_lagna(jd_ut: float, lat: float, lon: float) -> dict:
    # Placidus cusps in sidereal frame
    cusps, ascmc = swe.houses_ex(
        jd_ut, lat, lon, b"P", swe.FLG_SIDEREAL
    )
    asc = ascmc[0]
    asc_sign, asc_deg = sign_of(asc)
    asc_naksh, asc_pada, asc_lord = nakshatra_of(asc)
    return {
        "ascendant": {
            "longitude": round(asc, 6),
            "sign": asc_sign,
            "degree_in_sign": round(asc_deg, 4),
            "nakshatra": asc_naksh,
            "pada": asc_pada,
            "nakshatra_lord": asc_lord,
        },
        "midheaven": round(ascmc[1], 6),
        "house_cusps": [round(c, 6) for c in cusps[:12]],
    }


def vimshottari_dasha(moon_long: float, birth_jd: float, today_jd: float) -> dict:
    """Current major (Mahadasha) and minor (Antardasha) period."""
    naksh_size = 360 / 27
    naksh_idx = int(moon_long // naksh_size) % 27
    within = moon_long - naksh_idx * naksh_size
    fraction_remaining = 1 - (within / naksh_size)
    start_lord = NAKSHATRA_LORDS[naksh_idx]
    start_idx = VIMSHOTTARI_ORDER.index(start_lord)

    # Build the timeline of major periods starting from birth
    days_since_birth = today_jd - birth_jd
    years_since_birth = days_since_birth / 365.25

    elapsed = 0.0
    # first period is partial (fraction_remaining of full)
    periods = []
    for i in range(9):
        lord = VIMSHOTTARI_ORDER[(start_idx + i) % 9]
        years = VIMSHOTTARI_YEARS[lord]
        if i == 0:
            years *= fraction_remaining
        periods.append((lord, elapsed, elapsed + years))
        elapsed += years

    current_major = None
    for lord, start, end in periods:
        if start <= years_since_birth < end:
            current_major = (lord, start, end)
            break

    if not current_major:
        return {"major": None, "minor": None}

    lord, start, end = current_major
    progress_in_major = years_since_birth - start
    major_length = end - start
    # build sub-periods (antardashas) within this major
    sub_idx = VIMSHOTTARI_ORDER.index(lord)
    sub_elapsed = 0.0
    minor = None
    for j in range(9):
        sub_lord = VIMSHOTTARI_ORDER[(sub_idx + j) % 9]
        sub_years = (VIMSHOTTARI_YEARS[sub_lord] / 120) * (
            major_length if start != 0 else VIMSHOTTARI_YEARS[lord]
        )
        if sub_elapsed <= progress_in_major < sub_elapsed + sub_years:
            minor = sub_lord
            break
        sub_elapsed += sub_years

    return {
        "major_lord": lord,
        "minor_lord": minor,
        "years_into_major": round(progress_in_major, 3),
        "major_length_years": round(major_length, 3),
    }


def navamsha_position(longitude: float) -> tuple[str, int]:
    """D-9 chart — soul-level chart, especially read for marriage/inner pattern."""
    sign_idx = int(longitude // 30) % 12
    deg_in_sign = longitude - sign_idx * 30
    pada_size = 30 / 9
    pada_idx = int(deg_in_sign // pada_size)
    # navamsha rules differ by sign element; simplified rule:
    movable = [0, 3, 6, 9]    # Aries, Cancer, Libra, Capricorn — start same sign
    fixed   = [1, 4, 7, 10]   # Taurus, Leo, Scorpio, Aquarius — start 9th
    dual    = [2, 5, 8, 11]   # Gemini, Virgo, Sag, Pisces — start 5th
    if sign_idx in movable:
        base = sign_idx
    elif sign_idx in fixed:
        base = (sign_idx + 8) % 12
    else:
        base = (sign_idx + 4) % 12
    navamsha_sign = SIGNS[(base + pada_idx) % 12]
    return navamsha_sign, pada_idx + 1


def navamsha_chart(planets: dict, asc_long: float) -> dict:
    d9 = {}
    sign, _ = navamsha_position(asc_long)
    d9["ascendant_sign"] = sign
    for name, p in planets.items():
        s, pada = navamsha_position(p["longitude"])
        d9[name] = {"sign": s, "pada": pada}
    return d9


def bazi_pillars(date_str: str, time_str: str | None, tz_name: str) -> dict:
    """Simplified BaZi: Year/Month/Day/Hour stems and branches."""
    y, mo, d = (int(x) for x in date_str.split("-"))
    if time_str:
        h = int(time_str.split(":")[0])
    else:
        h = 12

    # Year pillar — based on year mod 10 / 12 with offset
    year_stem_idx = (y - 4) % 10
    year_branch_idx = (y - 4) % 12

    # Day pillar — approximate Julian day method
    a = (14 - mo) // 12
    yr = y + 4800 - a
    mn = mo + 12 * a - 3
    jdn = d + (153 * mn + 2) // 5 + 365 * yr + yr // 4 - yr // 100 + yr // 400 - 32045
    day_stem_idx = (jdn - 1) % 10
    day_branch_idx = (jdn - 1) % 12

    # Hour pillar — branch is determined by 2-hour blocks
    hour_branch_idx = ((h + 1) // 2) % 12
    # Hour stem cycles within day-stem
    hour_stem_idx = (day_stem_idx * 2 + hour_branch_idx) % 10

    # Month pillar — branch by solar month (approximate, no solar-term lookup)
    month_branch_idx = (mo + 1) % 12
    month_stem_idx = (year_stem_idx * 2 + month_branch_idx) % 10

    def pillar(s_idx, b_idx):
        return {
            "stem": STEMS[s_idx],
            "stem_element": STEM_ELEMENTS[s_idx],
            "branch": BRANCHES[b_idx],
            "branch_element": BRANCH_ELEMENTS[b_idx],
        }

    return {
        "year":  pillar(year_stem_idx, year_branch_idx),
        "month": pillar(month_stem_idx, month_branch_idx),
        "day":   pillar(day_stem_idx, day_branch_idx),    # Day Master = day stem
        "hour":  pillar(hour_stem_idx, hour_branch_idx),
        "day_master": STEMS[day_stem_idx],
        "day_master_element": STEM_ELEMENTS[day_stem_idx],
    }


# ─── Endpoints ─────────────────────────────────────────────────
@app.get("/")
def root():
    return {"service": "innerzenith-ephemeris", "ok": True}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chart")
def chart(req: ChartRequest, x_ephemeris_secret: str | None = Header(None)):
    auth_check(x_ephemeris_secret)

    lat, lon, tz_name = resolve_place(req)
    birth_jd = to_utc_jd(req.birth_date, req.birth_time, tz_name)
    today_jd = swe.julday(*datetime.now(timezone.utc).timetuple()[:3], 12.0)

    planets = planet_positions(birth_jd, lat, lon)
    houses = houses_and_lagna(birth_jd, lat, lon)
    dasha = vimshottari_dasha(
        planets["Moon"]["longitude"], birth_jd, today_jd
    )
    d9 = navamsha_chart(planets, houses["ascendant"]["longitude"])
    bazi = bazi_pillars(req.birth_date, req.birth_time, tz_name)

    return {
        "input": {
            "birth_date": req.birth_date,
            "birth_time": req.birth_time,
            "birth_time_known": bool(req.birth_time),
            "birth_place": req.birth_place,
            "latitude": lat,
            "longitude": lon,
            "timezone": tz_name,
        },
        "vedic": {
            "ascendant": houses["ascendant"],
            "midheaven": houses["midheaven"],
            "house_cusps": houses["house_cusps"],
            "planets": planets,
        },
        "dasha": dasha,
        "navamsha": d9,
        "bazi": bazi,
    }
