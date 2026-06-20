"""Velocity-check regression test for the v6 Prashna spec (Planetary Speed Index).

Spec 8.6 (lines 1700-1702): the gap that decides Ithasala vs Eshrafa is
  • same sign (Ekatva): the absolute longitudinal gap min(|dλ|, 360−|dλ|);
  • cross-sign aspects: the DEGREE-WITHIN-SIGN gap |deg_in_sign(S) − deg_in_sign(P)|,
    projected one day forward. "The only reliable method."
Closing → Ithasala (applying); opening → Eshrafa (separating). A full great-circle
orb is wrong for cross-sign aspects — it invents a ~120° number for a trine that
perfects in days, so cross-sign Ithasala could never form under the old code.
"""
from engine.prashna import _velocity, _layer4_tajika, _approaching_sign_change

GREEN = "\033[92m"; RED = "\033[91m"; OFF = "\033[0m"
fails = 0


def check(label, got, want):
    global fails
    ok = got == want
    fails += 0 if ok else 1
    print(f"  [{(GREEN+'PASS'+OFF) if ok else (RED+'FAIL'+OFF)}] {label}: got {got!r}, want {want!r}")


def planet(lon, speed, retro=False):
    SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio",
             "Sagittarius","Capricorn","Aquarius","Pisces"]
    return {"lon": lon % 360, "sign": SIGNS[int((lon % 360)//30)],
            "deg": (lon % 360) % 30, "speed": speed, "retro": retro}


print("\n— Cross-sign aspect, CLOSING → degree-in-sign gap shrinks (Ithasala) —")
# S 10° Aries (slow), P 5° Leo (fast). Trine (distance 5). Faster P at lower
# degree-in-sign is catching up — gap 5° closing. Neither crosses a boundary.
S = planet(10.0, 0.05); P = planet(125.0, 1.00)   # 5° Leo
v = _velocity(S, P)
print("  velocity:", v)
check("metric is degree-in-sign", v["metric"], "degree-in-sign")
check("gap_now = 5.0 (|10-5|)", v["gap_now"], 5.0)
check("direction CLOSING", v["direction"], "closing")
moon = 200.0
common = {"Moon": planet(moon, 13.1), "Sun": planet(300.0, 0.97),
          "Rahu": planet(330.0, -0.05), "Ketu": planet(150.0, -0.05)}
l4 = _layer4_tajika({"Saturn": S, "Mars": P, **common}, {"S": "Saturn", "P": "Mars"}, moon)
print("  layer4.yoga:", l4.get("yoga"))
check("cross-sign within orb + closing → Ithasala", l4["yoga"], "Ithasala")

print("\n— Cross-sign aspect, OPENING → degree-in-sign gap grows (Eshrafa) —")
S2 = planet(5.0, 0.05); P2 = planet(130.0, 1.00)  # S 5° Aries, P 10° Leo, pulling away
v2 = _velocity(S2, P2)
print("  velocity:", v2)
check("direction OPENING", v2["direction"], "opening")
l4b = _layer4_tajika({"Saturn": S2, "Mars": P2, **common}, {"S": "Saturn", "P": "Mars"}, moon)
check("cross-sign within orb + opening → Eshrafa", l4b["yoga"], "Eshrafa")

print("\n— Same sign (Ekatva): longitudinal gap metric —")
Se = planet(10.0, 0.05); Pe = planet(5.0, 1.00)  # both Aries
ve = _velocity(Se, Pe)
print("  velocity:", ve)
check("metric is longitudinal", ve["metric"], "longitudinal")
check("gap_now = 5.0", ve["gap_now"], 5.0)
check("direction CLOSING", ve["direction"], "closing")

print("\n— Sign-change-approaching (spec 8.6): Mercury 2.26° from Cancer, Jupiter in Cancer —")
sc = _approaching_sign_change(
    {"Mercury": planet(87.74, 1.30), "Jupiter": planet(95.0, 0.08)},
    {"S": "Mercury", "P": "Jupiter"})
print("  sign_change_approaching:", sc)
check("one flag", len(sc), 1)
check("2.26° from Cancer", sc[0]["degrees_to_crossing"], 2.26)
check("resulting_aspect Ekatva", sc[0]["resulting_aspect"].startswith("Ekatva"), True)

print()
if fails:
    print(f"{RED}{fails} check(s) FAILED{OFF}"); raise SystemExit(1)
print(f"{GREEN}All velocity checks passed.{OFF}")
