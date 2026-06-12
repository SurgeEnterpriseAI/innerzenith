// Location → language. The default UI language is chosen from the visitor's
// location (Vercel edge geo via /api/geo) — e.g. Bengaluru → Kannada, Tamil
// Nadu → Tamil, Tokyo → Japanese. Falls back to the browser language when geo
// is unavailable. The user can always override in Profile.

import { matchDeviceLanguage } from "./languages";

// India: ISO 3166-2 state code → language (the linguistic-states map).
const IN_STATE: Record<string, string> = {
  KA: "kn-IN", // Karnataka → Kannada
  TN: "ta-IN", // Tamil Nadu → Tamil
  MH: "mr-IN", // Maharashtra → Marathi
  AP: "te-IN", // Andhra Pradesh → Telugu
  TG: "te-IN", TS: "te-IN", // Telangana → Telugu
  KL: "ml-IN", // Kerala → Malayalam
  WB: "bn-IN", // West Bengal → Bengali
  GJ: "gu-IN", // Gujarat → Gujarati
  PB: "pa-IN", // Punjab → Punjabi
  OR: "or-IN", OD: "or-IN", // Odisha → Odia
  AS: "as-IN", // Assam → Assamese
  // Hindi belt + default
  UP: "hi-IN", BR: "hi-IN", MP: "hi-IN", RJ: "hi-IN", HR: "hi-IN",
  DL: "hi-IN", UT: "hi-IN", UK: "hi-IN", JH: "hi-IN", CT: "hi-IN", CG: "hi-IN",
  HP: "hi-IN", JK: "hi-IN",
};

// Country (ISO) → default language for the rest of the world.
const COUNTRY: Record<string, string> = {
  IN: "hi-IN",
  US: "en-US", GB: "en-GB", AU: "en-US", CA: "en-US", NZ: "en-US", IE: "en-GB",
  ES: "es-ES", MX: "es-MX", AR: "es-MX", CO: "es-MX", CL: "es-MX", PE: "es-MX", VE: "es-MX",
  FR: "fr-FR", BE: "fr-FR", PT: "pt-PT", BR: "pt-BR",
  DE: "de-DE", AT: "de-DE", CH: "de-DE", IT: "it-IT", NL: "nl-NL",
  RU: "ru-RU", UA: "uk-UA", PL: "pl-PL", RO: "ro-RO", CZ: "cs-CZ", HU: "hu-HU",
  SE: "sv-SE", DK: "da-DK", FI: "fi-FI", NO: "nb-NO", GR: "el-GR",
  JP: "ja-JP", KR: "ko-KR", CN: "zh-CN", TW: "zh-TW", HK: "zh-HK",
  ID: "id-ID", MY: "ms-MY", TH: "th-TH", VN: "vi-VN", PH: "fil-PH", KH: "km-KH",
  MM: "my-MM", LK: "si-LK", NP: "ne-NP", BD: "bn-BD", PK: "ur-PK", AF: "fa-AF",
  SA: "ar-SA", AE: "ar-SA", EG: "ar-EG", IQ: "ar-SA", JO: "ar-SA", MA: "ar-SA",
  DZ: "ar-SA", TN: "ar-SA", LB: "ar-SA", KW: "ar-SA", QA: "ar-SA", OM: "ar-SA",
  IR: "fa-IR", TR: "tr-TR", IL: "he-IL", AZ: "az-AZ", KZ: "kk-KZ", UZ: "uz-UZ",
  ET: "am-ET", KE: "sw-KE", TZ: "sw-KE", NG: "en-US", ZA: "af-ZA",
  AM: "hy-AM", GE: "ka-GE", MN: "mn-MN", LA: "lo-LA",
};

/** Map a country/region to a supported language, or null if unknown. */
export function localeFromGeo(country?: string | null, region?: string | null): string | null {
  const c = (country || "").toUpperCase();
  const r = (region || "").toUpperCase();
  let code: string | undefined;
  if (c === "IN" && r && IN_STATE[r]) code = IN_STATE[r];
  else if (COUNTRY[c]) code = COUNTRY[c];
  if (!code) return null;
  // snap to a supported language (identity if already supported)
  return matchDeviceLanguage(code);
}

const GEO_CACHE_KEY = "dotit.geoLocale";

/** Resolve the default language from the visitor's location. Cached so we only
 *  hit /api/geo once. Returns null if geo is unavailable (caller falls back). */
export async function fetchGeoLocale(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(GEO_CACHE_KEY);
    if (cached) return cached === "_" ? null : cached;
  } catch {}
  try {
    const res = await fetch("/api/geo");
    if (!res.ok) return null;
    const g = await res.json();
    const loc = localeFromGeo(g.country, g.region);
    try {
      localStorage.setItem(GEO_CACHE_KEY, loc || "_");
    } catch {}
    return loc;
  } catch {
    return null;
  }
}
