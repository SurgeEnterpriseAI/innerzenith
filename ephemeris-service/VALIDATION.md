# Stage 12 — Validation & Testing

The calculation engine must be cross-checked against professional software
before launch. This file tracks the verification status of each system.

## Reference targets (Stage 12.1)

| System | Reference software | Must match |
|--------|-------------------|-----------|
| Vedic / KP | Jagannatha Hora or Kala | Planetary longitudes to 2 decimals |
| BaZi | Joey Yap BaZi Ming Pan | All four pillars + Ten Gods exactly |
| Zi Wei | Trusted practitioner chart | Palace placements + major stars |
| Prashna | Documented historical questions | House assignments + Moon aspects |

## Vedic spec v2.0 (audited) — incorporated 2026-06-04

Corrections applied: Chara Karakas now strict 8-planet Parashari (AK/AmK/BK/
MK/PiK/PK/GK/DK), Ketu excluded, SK & GK2 purged, Rahu uses TRUE node;
conditional-dasha triggers fixed (Dwisaptati = Lagna-lord-in-7th / 7th-lord-
in-Lagna; Shatrimsha = hora-birth); sunrise now DISC_CENTER | NO_REFRACTION.
Added: Mean+True nodes, Gandanta flags (rashi + nakshatra), Shadbala (6
components), D60 Shashtiamsha deity, Rasi Drishti matrix, Ashtakavarga
Trikona+Ekadhipatya reductions + Shodhya Pinda (Rasi/Graha Gunakar — NOT
dasha years), Narayana D1+D9 with Dasha-Lagna = stronger of Lagna/7th +
modality sub-period rule, special lagnas (HL/GL/BL), Varshaphala (Varsha
Lagna/Muntha/Varsheshwara), global slow-transit log.

Still needs reference cross-check: Shadbala absolute Virupas (Kaala/Drig
components simplified — relative ranking sound), Varsheshwara full
Panchavargiya Bala scoring, Zi Wei star seating, vargas D5–D45 sign rules,
D60 deity list (one of several published orderings).

## Current status (engine v1.0)

| Area | Status | Notes |
|------|--------|-------|
| Time conversion chain | ✅ verified | Historical IANA DST via pytz; LMT/LST via swe |
| Vedic planetary longitudes | ⏳ needs JH cross-check | Sidereal Lahiri via Swiss Ephemeris (authoritative source) |
| Vedic Ashtakavarga | ✅ self-consistent | Samudaya total = 337 (classically correct) |
| Vimshottari dasha | ✅ structurally correct | Balance + MD/AD timeline + current period resolve |
| Divisional charts | ⏳ needs JH cross-check | D1–D60; general varga rule for D4/D5/D6/D8/etc |
| Arudha / Chara Karakas | ✅ rule-verified | Two Arudha exception rules implemented; Rahu inversion |
| Yogas | ✅ logic-verified | Raja/Gaja Kesari/Mahapurusha/Amala/Kuja/KaalSarp/NeechaBhanga/Parivartana |
| KP sub-lords | ⏳ needs KP cross-check | 243 divisions, separate KP ayanamsha |
| BaZi year + month pillar | ✅ verified | 1985 = Yi-Chou (Wood Ox); July = Goat month |
| BaZi day pillar | ✅ calibrated | Single sexagenary index `(JDN_noon+49)%60`; anchor verified 2000-01-01 = Wu-Wu (Earth Horse); valid stem/branch parity guaranteed |
| BaZi hour pillar | ✅ rule-verified | Five Rats rule `((day_stem%5)*2 + hour_branch)%10` checked across all 10 day stems |
| Divisional charts D1/D2/D3/D4/D9/D12/D30 | ✅ rule-verified | Hora, Drekkana, Chaturthamsha (kendra pattern), Navamsha (element-start ≡ continuous), Dwadashamsha rules confirmed correct |
| Divisional charts D5/D6/D7/D8/D10/D16/D20/D24/D27/D40/D45/D60 | ⏳ needs cross-check | Starting-sign rules vary by source; verify vs Jagannatha Hora |
| Zi Wei palaces | ⏳ needs cross-check | Life/Body palace + star groups; lunar-day Zi Wei seating simplified |
| Prashna | ✅ structurally correct | Tajika/Deethi, validity flags, house assignments |

## Calibration TODO before production

1. **BaZi day pillar** — anchor the JDN→sexagenary offset to a verified date
   (e.g. compare 3–5 known birthdays against Joey Yap's calculator), adjust
   the `(jdn+9)%10` / `(jdn+1)%12` constants in `engine/bazi.py`.
2. **Zi Wei Zi-Wei-star seating** — replace the simplified `_ziwei_position`
   with the full Wu-Ju (五局) table keyed by the Five Element class.
3. **Divisional charts** — verify D-chart sign rules for D4/D5/D6/D8/D16/D20/
   D24/D27/D40/D45 against Jagannatha Hora; the classical varga rules vary by
   source.

## How to run the test client

```
cd ephemeris-service
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt httpx
.venv/Scripts/python -c "from fastapi.testclient import TestClient; import app; ..."
```
