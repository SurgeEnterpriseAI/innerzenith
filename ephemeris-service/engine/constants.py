"""Shared constants and classical lookup tables for all systems."""

# ─── Zodiac ────────────────────────────────────────────────────
SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

SIGN_LORDS = {
    "Aries": "Mars", "Taurus": "Venus", "Gemini": "Mercury", "Cancer": "Moon",
    "Leo": "Sun", "Virgo": "Mercury", "Libra": "Venus", "Scorpio": "Mars",
    "Sagittarius": "Jupiter", "Capricorn": "Saturn", "Aquarius": "Saturn",
    "Pisces": "Jupiter",
}

# sign modality (Stage 8 Prashna): movable/chara, fixed/sthira, dual/dwiswabhava
MODALITY = {
    "Aries": "movable", "Cancer": "movable", "Libra": "movable", "Capricorn": "movable",
    "Taurus": "fixed", "Leo": "fixed", "Scorpio": "fixed", "Aquarius": "fixed",
    "Gemini": "dual", "Virgo": "dual", "Sagittarius": "dual", "Pisces": "dual",
}

# even/odd signs (conditional dasha trigger, Hora division)
EVEN_SIGNS = {"Taurus", "Cancer", "Virgo", "Scorpio", "Capricorn", "Pisces"}

# element of each sign (used in several systems)
SIGN_ELEMENT = {
    "Aries": "Fire", "Leo": "Fire", "Sagittarius": "Fire",
    "Taurus": "Earth", "Virgo": "Earth", "Capricorn": "Earth",
    "Gemini": "Air", "Libra": "Air", "Aquarius": "Air",
    "Cancer": "Water", "Scorpio": "Water", "Pisces": "Water",
}

# ─── Nakshatras ────────────────────────────────────────────────
NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada",
    "Revati",
]

# Vimshottari dasha lord per nakshatra (cycle of 9, Stage 2.12)
NAKSHATRA_LORD = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
]

VIMSHOTTARI_YEARS = {
    "Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10, "Mars": 7,
    "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17,
}
VIMSHOTTARI_ORDER = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
]
VIMSHOTTARI_TOTAL = 120

NAKSHATRA_SPAN = 360.0 / 27.0  # 13.3333°

# ─── Planets ───────────────────────────────────────────────────
GRAHAS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]

# exaltation sign + exact degree, debilitation sign (Stage 2.5 dignities)
EXALTATION = {
    "Sun": ("Aries", 10), "Moon": ("Taurus", 3), "Mars": ("Capricorn", 28),
    "Mercury": ("Virgo", 15), "Jupiter": ("Cancer", 5), "Venus": ("Pisces", 27),
    "Saturn": ("Libra", 20), "Rahu": ("Taurus", 20), "Ketu": ("Scorpio", 20),
}
DEBILITATION = {  # opposite of exaltation sign
    "Sun": "Libra", "Moon": "Scorpio", "Mars": "Cancer", "Mercury": "Pisces",
    "Jupiter": "Capricorn", "Venus": "Virgo", "Saturn": "Aries",
    "Rahu": "Scorpio", "Ketu": "Taurus",
}
OWN_SIGNS = {
    "Sun": ["Leo"], "Moon": ["Cancer"], "Mars": ["Aries", "Scorpio"],
    "Mercury": ["Gemini", "Virgo"], "Jupiter": ["Sagittarius", "Pisces"],
    "Venus": ["Taurus", "Libra"], "Saturn": ["Capricorn", "Aquarius"],
}
# Moolatrikona sign + degree range
MOOLATRIKONA = {
    "Sun": ("Leo", 0, 20), "Moon": ("Taurus", 4, 30), "Mars": ("Aries", 0, 12),
    "Mercury": ("Virgo", 16, 20), "Jupiter": ("Sagittarius", 0, 10),
    "Venus": ("Libra", 0, 15), "Saturn": ("Aquarius", 0, 20),
}
NATURAL_BENEFICS = {"Jupiter", "Venus", "Mercury", "Moon"}
NATURAL_MALEFICS = {"Sun", "Mars", "Saturn", "Rahu", "Ketu"}

# Special graha aspects (Stage 2.10 graha drishti) — houses aspected FROM position
SPECIAL_ASPECTS = {
    "Mars": [4, 7, 8],
    "Jupiter": [5, 7, 9],
    "Saturn": [3, 7, 10],
    "Rahu": [5, 7, 9],
    "Ketu": [5, 7, 9],
}
DEFAULT_ASPECT = [7]  # all planets aspect 7th

# Naisargika Bala — natural permanent strength in Virupas (Stage 2.5 Shadbala)
NAISARGIKA_BALA = {
    "Sun": 60.0, "Moon": 51.43, "Venus": 42.85, "Jupiter": 34.28,
    "Mercury": 25.70, "Mars": 17.14, "Saturn": 8.57,
}

# Rasi Gunakar — sign multipliers for Shodhya Pinda (Stage 2.11)
RASI_GUNAKAR = {
    "Aries": 7, "Taurus": 10, "Gemini": 8, "Cancer": 4, "Leo": 10, "Virgo": 5,
    "Libra": 7, "Scorpio": 8, "Sagittarius": 9, "Capricorn": 5, "Aquarius": 11,
    "Pisces": 12,
}
# Graha Gunakar — planet multipliers for Shodhya Pinda (7 planets; no Rahu/Ketu)
GRAHA_GUNAKAR = {
    "Sun": 5, "Moon": 5, "Mars": 8, "Mercury": 5, "Jupiter": 10, "Venus": 7,
    "Saturn": 5,
}

# 60 Shashtiamsha (D60) deities in order (BPHS). Applied 0→59 across a sign
# for odd signs, reversed for even signs (Stage 2.6).
D60_DEITIES = [
    "Ghora", "Rakshasa", "Deva", "Kubera", "Yaksha", "Kinnara", "Bhrashta",
    "Kulaghna", "Garala", "Vahni", "Maya", "Purishaka", "Apampati", "Marutwan",
    "Kaala", "Sarpa", "Amrita", "Indu", "Mridu", "Komala", "Heramba", "Brahma",
    "Vishnu", "Maheshwara", "Deva", "Ardra", "Kalinasa", "Kshitisa",
    "Kamalakara", "Gulika", "Mrityu", "Kaala", "Davagni", "Ghora", "Yama",
    "Kantaka", "Sudha", "Amrita", "Purnachandra", "Vishadagdha", "Kulanasa",
    "Vamshakshaya", "Utpata", "Kaala", "Saumya", "Komala", "Sheetala",
    "Karaladamshtra", "Chandramukha", "Praveena", "Kaalapavaka", "Dandayudha",
    "Nirmala", "Saumya", "Krura", "Atisheetala", "Amrita", "Payodhi",
    "Bhramana", "Indurekha",
]

# Gandanta junctions (Stage 2.2). Rashi Gandanta = last 3°20' of a water sign
# / first 3°20' of the following fire sign.
WATER_FIRE_JUNCTIONS = [("Cancer", "Leo"), ("Scorpio", "Sagittarius"),
                        ("Pisces", "Aries")]
# Nakshatra Gandanta junction pairs (more intense karmic subset).
NAKSHATRA_GANDANTA_PAIRS = [("Revati", "Ashwini"), ("Ashlesha", "Magha"),
                           ("Jyeshtha", "Mula")]

# ─── BaZi sexagenary ───────────────────────────────────────────
STEMS = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"]
STEM_ELEMENT = ["Wood", "Wood", "Fire", "Fire", "Earth", "Earth",
                "Metal", "Metal", "Water", "Water"]
STEM_YANG = [True, False, True, False, True, False, True, False, True, False]

BRANCHES = ["Zi", "Chou", "Yin", "Mao", "Chen", "Si",
            "Wu", "Wei", "Shen", "You", "Xu", "Hai"]
BRANCH_ANIMAL = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake",
                 "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"]
BRANCH_ELEMENT = ["Water", "Earth", "Wood", "Wood", "Earth", "Fire",
                  "Fire", "Earth", "Metal", "Metal", "Earth", "Water"]
# principal hidden stems per branch (simplified — main qi)
BRANCH_HIDDEN = {
    "Zi": ["Gui"], "Chou": ["Ji", "Gui", "Xin"], "Yin": ["Jia", "Bing", "Wu"],
    "Mao": ["Yi"], "Chen": ["Wu", "Yi", "Gui"], "Si": ["Bing", "Wu", "Geng"],
    "Wu": ["Ding", "Ji"], "Wei": ["Ji", "Ding", "Yi"], "Shen": ["Geng", "Ren", "Wu"],
    "You": ["Xin"], "Xu": ["Wu", "Xin", "Ding"], "Hai": ["Ren", "Jia"],
}

# Wu Xing production / control cycles
PRODUCES = {"Wood": "Fire", "Fire": "Earth", "Earth": "Metal", "Metal": "Water", "Water": "Wood"}
CONTROLS = {"Wood": "Earth", "Earth": "Water", "Water": "Fire", "Fire": "Metal", "Metal": "Wood"}

# Solar-term ecliptic longitudes that start each BaZi month (Jie), Stage 4.1
# longitude -> month branch index (Tiger=2 ... )
JIE_LONGITUDE_TO_BRANCH = {
    315: 2,   # Li Chun — Tiger
    345: 3,   # Jing Zhe — Rabbit
    15: 4,    # Qing Ming — Dragon
    45: 5,    # Li Xia — Snake
    75: 6,    # Mang Zhong — Horse
    105: 7,   # Xiao Shu — Goat
    135: 8,   # Li Qiu — Monkey
    165: 9,   # Bai Lu — Rooster
    195: 10,  # Han Lu — Dog
    225: 11,  # Li Dong — Pig
    255: 0,   # Da Xue — Rat
    285: 1,   # Xiao Han — Ox
}

# ─── Zi Wei Dou Shu ────────────────────────────────────────────
PALACES = [
    "Ming Gong", "Xiong Di", "Fu Qi", "Zi Nu", "Cai Bo", "Ji E",
    "Qian Yi", "Jiao You", "Guan Lu", "Tian Zhai", "Fu De", "Fu Mu",
]
PALACE_EN = {
    "Ming Gong": "Life", "Xiong Di": "Siblings", "Fu Qi": "Spouse",
    "Zi Nu": "Children", "Cai Bo": "Wealth", "Ji E": "Health",
    "Qian Yi": "Travel", "Jiao You": "Friends", "Guan Lu": "Career",
    "Tian Zhai": "Property", "Fu De": "Karma", "Fu Mu": "Parents",
}
ZIWEI_MAJOR_STARS = [
    "Zi Wei", "Tian Ji", "Tai Yang", "Wu Qu", "Tian Tong", "Lian Zhen",
    "Tian Fu", "Tai Yin", "Tan Lang", "Ju Men", "Tian Xiang", "Tian Liang",
    "Qi Sha", "Po Jun",
]

# 4 Hua transformation table by birth-year stem (Stage 5.9)
HUA_BY_STEM = {
    "Jia": {"Lu": "Lian Zhen", "Quan": "Po Jun", "Ke": "Wu Qu", "Ji": "Tai Yang"},
    "Yi": {"Lu": "Tian Ji", "Quan": "Tian Liang", "Ke": "Zi Wei", "Ji": "Tai Yin"},
    "Bing": {"Lu": "Tian Tong", "Quan": "Tian Ji", "Ke": "Wen Chang", "Ji": "Lian Zhen"},
    "Ding": {"Lu": "Tai Yin", "Quan": "Tian Tong", "Ke": "Tian Ji", "Ji": "Ju Men"},
    "Wu": {"Lu": "Tan Lang", "Quan": "Tai Yin", "Ke": "You Bi", "Ji": "Tian Ji"},
    "Ji": {"Lu": "Wu Qu", "Quan": "Tan Lang", "Ke": "Tian Liang", "Ji": "Wen Qu"},
    "Geng": {"Lu": "Tai Yang", "Quan": "Wu Qu", "Ke": "Tai Yin", "Ji": "Tian Tong"},
    "Xin": {"Lu": "Ju Men", "Quan": "Tai Yang", "Ke": "Wen Qu", "Ji": "Wen Chang"},
    "Ren": {"Lu": "Tian Liang", "Quan": "Zi Wei", "Ke": "Zuo Fu", "Ji": "Wu Qu"},
    "Gui": {"Lu": "Po Jun", "Quan": "Ju Men", "Ke": "Tai Yin", "Ji": "Tan Lang"},
}

# ─── Prashna Tajika Deethi orbs (Stage 8.5) ────────────────────
DEETHI = {
    "Sun": 15, "Moon": 12, "Mars": 8, "Mercury": 7,
    "Jupiter": 9, "Venus": 7, "Saturn": 9,
}

# House assignments by Prashna question type (Stage 8.5)
PRASHNA_HOUSES = {
    "lawsuit": {"litigant": 1, "opponent": 7, "judge": 10, "judgment": 4},
    "illness": {"physician": 1, "disease": 7, "patient": 10, "medicine": 4},
    "lost_object": {"querent": 1, "possession": 2, "location": 4},
    "travel": {"querent": 1, "journey": 9, "destination": 7},
    "job": {"querent": 1, "position": 10, "employment": 6},
    "marriage": {"querent": 1, "partner": 7, "union": 11},
}

# KP cuspal interlinks by topic (Stage 3.6)
KP_INTERLINKS = {
    "marriage": [2, 7, 11],
    "employment": [2, 6, 10, 11],
    "foreign": [3, 9, 12],
    "property": [4, 11, 12],
    "children": [2, 5, 11],
    "health_recovery": [1, 5, 11],
    "business": [2, 7, 10, 11],
}
