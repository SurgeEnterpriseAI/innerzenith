"""
dotit — Ephemeris & Calculation Service.

One call at onboarding (/chart) computes the full four-system profile and
returns it for permanent storage. /context returns a token-efficient slice
for a topic at session time. /prashna casts an Ask Now question chart.

All four systems share Swiss Ephemeris longitudes. Vedic uses Lahiri; KP
uses Krishnamurti ayanamsha; BaZi uses astronomical Jie boundaries; Zi Wei
uses lunar month/day/hour. None of these terms ever reach the user — the
Next.js layer translates everything to plain language via the AI brain.

Auth: a shared secret header (X-Ephemeris-Secret) is required in prod.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from engine.orchestrate import compute_profile
from engine.timeconv import build_time_context
from engine import prashna as prashna_mod
from engine import cache_keys as ck
from engine import kp as kp_mod

SHARED_SECRET = os.getenv("EPHEMERIS_SHARED_SECRET", "change-me")

app = FastAPI(title="dotit Ephemeris", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def auth(secret: Optional[str]):
    if SHARED_SECRET == "change-me":
        return
    if secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="bad secret")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── Schemas ───────────────────────────────────────────────────
class ChartRequest(BaseModel):
    birth_date: str = Field(..., description="YYYY-MM-DD")
    birth_time: Optional[str] = Field(None, description="HH:MM (24h) or null")
    birth_time_to_minute: bool = True
    latitude: float
    longitude: float
    timezone: str = Field(..., description="IANA tz, e.g. Asia/Kolkata")
    gender: str = Field("M", description="M or F")


class ContextRequest(BaseModel):
    profile: dict
    category: str


class PrashnaRequest(BaseModel):
    moment_iso: str = Field(..., description="ISO timestamp captured on device")
    latitude: float
    longitude: float
    timezone: str
    question_type: str = "general"


# ─── Endpoints ─────────────────────────────────────────────────
@app.get("/")
def root():
    return {"service": "dotit-ephemeris", "version": "1.0.0", "ok": True}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chart")
def chart(req: ChartRequest, x_ephemeris_secret: Optional[str] = Header(None)):
    """Onboarding — compute the full four-system profile for permanent storage."""
    auth(x_ephemeris_secret)
    try:
        profile = compute_profile(
            birth_date=req.birth_date,
            birth_time=req.birth_time,
            lat=req.latitude,
            lon=req.longitude,
            tz_name=req.timezone,
            gender=req.gender,
            time_to_minute=req.birth_time_to_minute,
            now=_now(),
        )
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"chart computation failed: {e}")


@app.post("/context")
def context(req: ContextRequest, x_ephemeris_secret: Optional[str] = Header(None)):
    """Session time — token-efficient slice for a topic (Stage 7.5)."""
    auth(x_ephemeris_secret)
    return ck.context_slice(req.profile, req.category)


# The 9 inauspicious Nitya Yogas (the other 18 are benefic/neutral).
_MALEFIC_YOGAS = {1, 6, 9, 10, 13, 15, 17, 19, 27}  # Vishkambha, Atiganda, Shula, Ganda, Vyaghata, Vajra, Vyatipata, Parigha, Vaidhriti


@app.get("/today")
def today(x_ephemeris_secret: Optional[str] = Header(None),
          lat: Optional[float] = None, lon: Optional[float] = None,
          tz: Optional[str] = None):
    """Global 'now' snapshot for the Surprise Me micro layer (no birth data):
    Moon sign + nakshatra, day lord, BaZi annual pillar, Panchanga (Tithi +
    Paksha + Yoga, from Sun+Moon — location-independent), and slow-planet transit
    signs (Saturn/Jupiter/Rahu/Ketu). If lat/lon/tz are given, also the current
    Hora lord at the user's location (sunrise-based, like Ask Now)."""
    auth(x_ephemeris_secret)
    import swisseph as swe
    from engine.vedic import sign_of, nakshatra_of, norm360
    from engine.constants import STEMS, BRANCHES, BRANCH_ANIMAL
    now = datetime.now(timezone.utc)
    jd = swe.julday(now.year, now.month, now.day,
                    now.hour + now.minute / 60.0)
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    mpos, _ = swe.calc_ut(jd, swe.MOON, swe.FLG_SIDEREAL)
    spos, _ = swe.calc_ut(jd, swe.SUN, swe.FLG_SIDEREAL)
    mlon = norm360(mpos[0]); slon = norm360(spos[0])
    naksh, pada, nlord, _, _ = nakshatra_of(mlon)
    # Panchanga (spec 8.12) — Tithi, Paksha, Yoga from Sun & Moon only.
    tithi = int(((mlon - slon) % 360) / 12) + 1            # 1..30
    paksha = "Shukla" if tithi <= 15 else "Krishna"        # waxing / waning
    yoga_num = int(((slon + mlon) % 360) / (360 / 27)) + 1  # 1..27
    yoga_quality = "challenging" if yoga_num in _MALEFIC_YOGAS else "supportive"
    # Slow-planet transit signs (sidereal) for transit triggers (spec 7.5).
    slow = {}
    for nm, code in (("Saturn", swe.SATURN), ("Jupiter", swe.JUPITER)):
        p, _ = swe.calc_ut(jd, code, swe.FLG_SIDEREAL)
        slow[nm] = sign_of(norm360(p[0]))
    rpos, _ = swe.calc_ut(jd, swe.MEAN_NODE, swe.FLG_SIDEREAL)
    rahu = norm360(rpos[0])
    slow["Rahu"] = sign_of(rahu); slow["Ketu"] = sign_of(norm360(rahu + 180))
    day_lords = {0: "Moon", 1: "Mars", 2: "Mercury", 3: "Jupiter",
                 4: "Venus", 5: "Saturn", 6: "Sun"}  # Mon..Sun
    ystem = STEMS[(now.year - 4) % 10]
    ybranch = BRANCHES[(now.year - 4) % 12]
    yanimal = BRANCH_ANIMAL[(now.year - 4) % 12]
    out = {
        "date": now.date().isoformat(),
        "moon_sign": sign_of(mlon),
        "moon_nakshatra": naksh,
        "moon_nakshatra_lord": nlord,
        "day_lord": day_lords[now.weekday()],
        "bazi_year_pillar": {"stem": ystem, "branch": ybranch, "animal": yanimal},
        "tithi": tithi, "paksha": paksha,
        "yoga_number": yoga_num, "yoga_quality": yoga_quality,
        "slow_transits": slow,
    }
    # Location-aware Hora lord at session open (spec 7.5 Surprise Me).
    if lat is not None and lon is not None and tz:
        try:
            import pytz
            local = datetime.now(pytz.timezone(tz))
            tc = build_time_context(local.strftime("%Y-%m-%d"),
                                    local.strftime("%H:%M:%S"), lat, lon, tz)
            from engine.prashna import _kaala_hora
            out["hora_lord"] = _kaala_hora(tc).get("hora_lord")
        except Exception:
            pass
    return out


@app.post("/prashna")
def prashna(req: PrashnaRequest, x_ephemeris_secret: Optional[str] = Header(None)):
    """Ask Now — cast a chart for the exact question moment."""
    auth(x_ephemeris_secret)
    try:
        import pytz
        tz = pytz.timezone(req.timezone)
        dt = datetime.fromisoformat(req.moment_iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            # naive ISO = the moment AS STATED in the question's city/timezone
            local = dt
        else:
            local = dt.astimezone(tz)
        tc = build_time_context(
            local.strftime("%Y-%m-%d"),
            local.strftime("%H:%M:%S"),
            req.latitude, req.longitude, req.timezone,
        )
        chart = prashna_mod.prashna_chart(tc, req.question_type)
        # Five ruling planets at the question moment (spec 3.5 — "especially
        # critical for Ask Now"). Computed live at the Prashna moment.
        try:
            chart["ruling_planets"] = kp_mod.ruling_planets(tc)
        except Exception:
            pass
        return chart
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"prashna computation failed: {e}")
