"""Stage 1.4 — Time Conversion Chain. Never skip steps.

local clock -> UTC (historical IANA DST) -> JDN -> LMT -> LST.
All timing calculations depend on this being exact.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import pytz
import swisseph as swe


class TimeContext:
    def __init__(self, jd_ut: float, jd_lmt: float, lst_hours: float,
                 utc_dt: datetime, local_dt: datetime, tz_name: str,
                 lat: float, lon: float, time_known: bool):
        self.jd_ut = jd_ut          # Julian Day (UT) — feeds all swe calls
        self.jd_lmt = jd_lmt        # Julian Day at Local Mean Time
        self.lst_hours = lst_hours  # Local Sidereal Time (hours)
        self.utc_dt = utc_dt
        self.local_dt = local_dt
        self.tz_name = tz_name
        self.lat = lat
        self.lon = lon
        self.time_known = time_known

    def as_dict(self) -> dict:
        return {
            "local": self.local_dt.isoformat(),
            "utc": self.utc_dt.isoformat(),
            "jdn_ut": round(self.jd_ut, 8),
            "jd_lmt": round(self.jd_lmt, 8),
            "lst_hours": round(self.lst_hours, 6),
            "timezone": self.tz_name,
            "time_known": self.time_known,
        }


def build_time_context(
    date_str: str,           # YYYY-MM-DD (local birth date)
    time_str: Optional[str], # HH:MM or HH:MM:SS local, or None
    lat: float,
    lon: float,
    tz_name: str,
) -> TimeContext:
    time_known = bool(time_str)
    if time_str:
        parts = time_str.split(":")
        h, m = int(parts[0]), int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
    else:
        h, m, s = 12, 0, 0  # noon fallback when time unknown

    y, mo, d = (int(x) for x in date_str.split("-"))

    # Step 1 — local clock -> UTC using historical IANA DST for the BIRTH date.
    tz = pytz.timezone(tz_name)
    local_naive = datetime(y, mo, d, h, m, s)
    local_dt = tz.localize(local_naive)   # applies the rules in force on that date
    utc_dt = local_dt.astimezone(pytz.utc)

    # Step 2 — UTC -> Julian Day Number with decimal day fraction.
    # Day-rollover is handled because we use the UTC calendar date, not local.
    jd_ut = swe.julday(
        utc_dt.year, utc_dt.month, utc_dt.day,
        utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600,
        swe.GREG_CAL,
    )

    # Step 3 — Local Mean Time. LMT = UTC + (longitude * 4 min/deg).
    # East longitudes positive, West negative (subtracts).
    lmt_offset_hours = lon * 4.0 / 60.0
    jd_lmt = jd_ut + lmt_offset_hours / 24.0

    # Step 4 — Local Sidereal Time at the birth moment (for Lagna).
    # swe.sidtime returns GMST in hours; add longitude/15 for local.
    gmst = swe.sidtime(jd_ut)              # Greenwich mean sidereal time (hours)
    lst_hours = (gmst + lon / 15.0) % 24.0

    return TimeContext(jd_ut, jd_lmt, lst_hours, utc_dt, local_dt,
                       tz_name, lat, lon, time_known)


def sidereal_setup():
    """Call once before sidereal calculations — Lahiri/Chitrapaksha."""
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)


def ayanamsha(jd_ut: float) -> float:
    swe.set_sid_mode(swe.SIDM_LAHIRI, 0, 0)
    return swe.get_ayanamsa_ut(jd_ut)


def sunrise_jd(jd_ut: float, lat: float, lon: float) -> Optional[float]:
    """Classical (Surya Siddhanta) sunrise for special lagnas (Stage 2.3).

    CRITICAL: classical Jyotish measures sunrise from the CENTRE of the Sun's
    disc and EXCLUDES atmospheric refraction. The Swiss Ephemeris default
    (upper limb + refraction) is the civil definition and runs 1-3 min early,
    which corrupts Hora/Ghati Lagna. Pass DISC_CENTER | NO_REFRACTION.
    """
    return _rise_set(jd_ut, lat, lon, swe.CALC_RISE)


def sunset_jd(jd_ut: float, lat: float, lon: float) -> Optional[float]:
    """Classical sunset (disc center, no refraction)."""
    return _rise_set(jd_ut, lat, lon, swe.CALC_SET)


def _rise_set(jd_ut: float, lat: float, lon: float, which: int) -> Optional[float]:
    try:
        start = jd_ut - 1.0  # search from ~prior midnight
        rsmi = which | swe.BIT_DISC_CENTER | swe.BIT_NO_REFRACTION
        res = swe.rise_trans(start, swe.SUN, rsmi, (lon, lat, 0.0), 0.0, 0.0,
                             swe.FLG_SWIEPH)
        if isinstance(res, tuple) and len(res) >= 2 and res[1]:
            return res[1][0]
    except Exception as e:
        print("[rise_set] failed:", e)
    return None
