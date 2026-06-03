"""dotit calculation engine — four systems + Prashna.

Modules:
  constants  — shared names, tables, enums
  timeconv   — Stage 1.4 time conversion chain (local→UTC→JDN→LMT→LST)
  vedic      — Stage 02 Vedic Jyotish
  kp         — Stage 03 Krishnamurti Paddhati
  bazi       — Stage 04 Four Pillars of Destiny
  ziwei      — Stage 05 Zi Wei Dou Shu
  prashna    — Stage 08 Ask Now (Prashna / Hora Shastra)
  cache_keys — Stage 6.2 cached AI semantic fields
  orchestrate— builds the full stored profile
"""
