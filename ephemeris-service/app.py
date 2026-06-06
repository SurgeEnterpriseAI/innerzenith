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
        return prashna_mod.prashna_chart(tc, req.question_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"prashna computation failed: {e}")
