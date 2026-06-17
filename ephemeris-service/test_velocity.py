"""Velocity-check regression test for Pankhuri's Prashna feedback (June 2026).

Her finding: the app said S and P were "moving apart" when the gap was 4.28° and
CLOSING at 1.4°/day. The signs were Asambandhah (adjacent, no Tajika aspect), so
the old code took the Durapha branch and computed NO direction at all — the AI
then invented "separation". The fix: _velocity uses projected positions tomorrow
(lon + speed) and runs for every relationship, including Asambandhah.

Rule under test (verbatim from her): "Run a test case where S and P are in
adjacent signs but closing — confirm the engine reports the absolute gap
direction correctly even when the sign relationship is Asambandhah."
"""
from engine.prashna import _velocity, _layer4_tajika, _approaching_sign_change

GREEN = "\033[92m"; RED = "\033[91m"; OFF = "\033[0m"
fails = 0


def check(label, got, want):
    global fails
    ok = got == want
    fails += 0 if ok else 1
    tag = f"{GREEN}PASS{OFF}" if ok else f"{RED}FAIL{OFF}"
    print(f"  [{tag}] {label}: got {got!r}, want {want!r}")


def planet(lon, speed, retro=False):
    sign = int(lon // 30)
    return {"lon": lon % 360, "sign": ["Aries","Taurus","Gemini","Cancer","Leo","Virgo",
            "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"][sign],
            "deg": lon % 30, "speed": speed, "retro": retro}


print("\n— Pankhuri's case: adjacent signs (Asambandhah), gap 4.28°, closing 1.4°/day —")
# Slower significator ahead at 3.28° Taurus; faster promittor behind at 29° Aries,
# catching up. Adjacent signs => Asambandhah. Gap closes as the faster one gains.
S = planet(33.28, 0.05)   # 3.28° Taurus, slow (Saturn-like)
P = planet(29.00, 1.45)   # 29.00° Aries, fast (Mars-like), catching up
v = _velocity(S, P)
print("  velocity:", v)
check("gap_now ≈ 4.28", v["gap_now"], 4.28)
check("direction is CLOSING (not opening)", v["direction"], "closing")
check("rate ≈ 1.4°/day", round(v["deg_per_day"], 1), 1.4)

# Full Tajika layer must surface that velocity and still classify Durapha.
moon = 200.0
planets = {"Saturn": S, "Mars": P, "Moon": planet(moon, 13.1),
           "Sun": planet(80.0, 0.97), "Rahu": planet(330.0, -0.05), "Ketu": planet(150.0, -0.05)}
l4 = _layer4_tajika(planets, {"S": "Saturn", "P": "Mars"}, moon)
print("  layer4.yoga:", l4.get("yoga"), "| velocity:", l4.get("velocity", {}).get("direction"))
check("Asambandhah still classified Durapha", l4["yoga"], "Durapha")
check("velocity present on Durapha & says closing", l4["velocity"]["direction"], "closing")

print("\n— Control: genuinely separating (faster planet ahead, pulling away) —")
S2 = planet(29.00, 0.05)  # slow, behind
P2 = planet(33.28, 1.45)  # fast, ahead, pulling away
v2 = _velocity(S2, P2)
print("  velocity:", v2)
check("direction is OPENING", v2["direction"], "opening")

print("\n— Sign-change-approaching (spec 8.6): Mercury 2.26° from Cancer, Jupiter in Cancer —")
# Mercury at 27.74° Gemini (lon 87.74), direct; Jupiter at 5° Cancer (lon 95).
# Crossing into Cancer makes Mercury share Jupiter's sign -> Ekatva forms.
sc = _approaching_sign_change(
    {"Mercury": planet(87.74, 1.30), "Jupiter": planet(95.0, 0.08)},
    {"S": "Mercury", "P": "Jupiter"})
print("  sign_change_approaching:", sc)
check("one flag raised", len(sc), 1)
check("Mercury 2.26° from Cancer", sc[0]["degrees_to_crossing"], 2.26)
check("entering Cancer", sc[0]["into_sign"], "Cancer")
check("resulting_aspect is Ekatva", sc[0]["resulting_aspect"].startswith("Ekatva"), True)

print("\n— Sign-change suppressed when crossing forms NO contact (spec: only if a contact forms) —")
# Mercury 2.26° from Cancer, but Jupiter in Capricorn (opposite) — entering Cancer
# is 7th from Capricorn = a contact actually... use Aquarius (8th, Asambandhah).
sc2 = _approaching_sign_change(
    {"Mercury": planet(87.74, 1.30), "Jupiter": planet(305.0, 0.08)},  # Jupiter 5° Aquarius
    {"S": "Mercury", "P": "Jupiter"})
print("  sign_change_approaching:", sc2)
check("no flag when crossing forms no aspect", len(sc2), 0)

print()
if fails:
    print(f"{RED}{fails} check(s) FAILED{OFF}")
    raise SystemExit(1)
print(f"{GREEN}All velocity checks passed.{OFF}")
