// Top ~100 languages dotit users speak. Each entry is a BCP-47 locale that
// Azure Neural TTS supports; the actual voice is resolved dynamically from
// Azure's live catalog (see app/api/tts/route.ts) so we never ship a stale
// voice name. `name` is English, `native` is the endonym, `rtl` flags
// right-to-left scripts for display direction.

export type Language = { code: string; name: string; native: string; rtl?: boolean };

export const LANGUAGES: Language[] = [
  { code: "en-US", name: "English", native: "English" },
  { code: "zh-CN", name: "Chinese (Mandarin)", native: "中文（普通话）" },
  { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
  { code: "es-ES", name: "Spanish", native: "Español" },
  { code: "fr-FR", name: "French", native: "Français" },
  { code: "ar-SA", name: "Arabic", native: "العربية", rtl: true },
  { code: "bn-IN", name: "Bengali", native: "বাংলা" },
  { code: "pt-BR", name: "Portuguese", native: "Português" },
  { code: "ru-RU", name: "Russian", native: "Русский" },
  { code: "ur-PK", name: "Urdu", native: "اردو", rtl: true },
  { code: "id-ID", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "de-DE", name: "German", native: "Deutsch" },
  { code: "ja-JP", name: "Japanese", native: "日本語" },
  { code: "te-IN", name: "Telugu", native: "తెలుగు" },
  { code: "mr-IN", name: "Marathi", native: "मराठी" },
  { code: "tr-TR", name: "Turkish", native: "Türkçe" },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
  { code: "vi-VN", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "ko-KR", name: "Korean", native: "한국어" },
  { code: "fa-IR", name: "Persian (Farsi)", native: "فارسی", rtl: true },
  { code: "it-IT", name: "Italian", native: "Italiano" },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
  { code: "pl-PL", name: "Polish", native: "Polski" },
  { code: "uk-UA", name: "Ukrainian", native: "Українська" },
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
  { code: "or-IN", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ro-RO", name: "Romanian", native: "Română" },
  { code: "nl-NL", name: "Dutch", native: "Nederlands" },
  { code: "th-TH", name: "Thai", native: "ไทย" },
  { code: "fil-PH", name: "Filipino", native: "Filipino" },
  { code: "ms-MY", name: "Malay", native: "Bahasa Melayu" },
  { code: "sw-KE", name: "Swahili", native: "Kiswahili" },
  { code: "he-IL", name: "Hebrew", native: "עברית", rtl: true },
  { code: "el-GR", name: "Greek", native: "Ελληνικά" },
  { code: "cs-CZ", name: "Czech", native: "Čeština" },
  { code: "hu-HU", name: "Hungarian", native: "Magyar" },
  { code: "sv-SE", name: "Swedish", native: "Svenska" },
  { code: "am-ET", name: "Amharic", native: "አማርኛ" },
  { code: "my-MM", name: "Burmese", native: "မြန်မာ" },
  { code: "az-AZ", name: "Azerbaijani", native: "Azərbaycanca" },
  { code: "uz-UZ", name: "Uzbek", native: "Oʻzbekcha" },
  { code: "si-LK", name: "Sinhala", native: "සිංහල" },
  { code: "km-KH", name: "Khmer", native: "ខ្មែរ" },
  { code: "ne-NP", name: "Nepali", native: "नेपाली" },
  { code: "da-DK", name: "Danish", native: "Dansk" },
  { code: "fi-FI", name: "Finnish", native: "Suomi" },
  { code: "nb-NO", name: "Norwegian", native: "Norsk" },
  { code: "sk-SK", name: "Slovak", native: "Slovenčina" },
  { code: "bg-BG", name: "Bulgarian", native: "Български" },
  { code: "hr-HR", name: "Croatian", native: "Hrvatski" },
  { code: "sr-RS", name: "Serbian", native: "Српски" },
  { code: "lt-LT", name: "Lithuanian", native: "Lietuvių" },
  { code: "lv-LV", name: "Latvian", native: "Latviešu" },
  { code: "et-EE", name: "Estonian", native: "Eesti" },
  { code: "sl-SI", name: "Slovenian", native: "Slovenščina" },
  { code: "ca-ES", name: "Catalan", native: "Català" },
  { code: "gl-ES", name: "Galician", native: "Galego" },
  { code: "eu-ES", name: "Basque", native: "Euskara" },
  { code: "af-ZA", name: "Afrikaans", native: "Afrikaans" },
  { code: "zu-ZA", name: "Zulu", native: "isiZulu" },
  { code: "xh-ZA", name: "Xhosa", native: "isiXhosa" },
  { code: "so-SO", name: "Somali", native: "Soomaali" },
  { code: "ha-NG", name: "Hausa", native: "Hausa" },
  { code: "yo-NG", name: "Yoruba", native: "Yorùbá" },
  { code: "ig-NG", name: "Igbo", native: "Igbo" },
  { code: "is-IS", name: "Icelandic", native: "Íslenska" },
  { code: "ga-IE", name: "Irish", native: "Gaeilge" },
  { code: "cy-GB", name: "Welsh", native: "Cymraeg" },
  { code: "sq-AL", name: "Albanian", native: "Shqip" },
  { code: "mk-MK", name: "Macedonian", native: "Македонски" },
  { code: "hy-AM", name: "Armenian", native: "Հայերեն" },
  { code: "ka-GE", name: "Georgian", native: "ქართული" },
  { code: "kk-KZ", name: "Kazakh", native: "Қазақ" },
  { code: "mn-MN", name: "Mongolian", native: "Монгол" },
  { code: "lo-LA", name: "Lao", native: "ລາວ" },
  { code: "jv-ID", name: "Javanese", native: "Basa Jawa" },
  { code: "su-ID", name: "Sundanese", native: "Basa Sunda" },
  { code: "as-IN", name: "Assamese", native: "অসমীয়া" },
  { code: "bn-BD", name: "Bengali (Bangladesh)", native: "বাংলা (বাংলাদেশ)" },
  { code: "ps-AF", name: "Pashto", native: "پښتو", rtl: true },
  { code: "ar-EG", name: "Arabic (Egypt)", native: "العربية (مصر)", rtl: true },
  { code: "es-MX", name: "Spanish (Mexico)", native: "Español (México)" },
  { code: "fr-CA", name: "French (Canada)", native: "Français (Canada)" },
  { code: "pt-PT", name: "Portuguese (Portugal)", native: "Português (Portugal)" },
  { code: "en-GB", name: "English (UK)", native: "English (UK)" },
  { code: "en-IN", name: "English (India)", native: "English (India)" },
  { code: "zh-TW", name: "Chinese (Taiwan)", native: "中文（台灣）" },
  { code: "zh-HK", name: "Chinese (Cantonese)", native: "粵語" },
  { code: "wuu-CN", name: "Chinese (Wu)", native: "吴语" },
  { code: "yue-CN", name: "Chinese (Cantonese, China)", native: "粵語（中國）" },
  { code: "be-BY", name: "Belarusian", native: "Беларуская" },
  { code: "tg-TJ", name: "Tajik", native: "Тоҷикӣ" },
  { code: "tt-RU", name: "Tatar", native: "Татарча" },
  { code: "mai-IN", name: "Maithili", native: "मैथिली" },
  { code: "mt-MT", name: "Maltese", native: "Malti" },
  { code: "bs-BA", name: "Bosnian", native: "Bosanski" },
  { code: "fa-AF", name: "Dari", native: "دری", rtl: true },
  { code: "ckb-IQ", name: "Kurdish (Sorani)", native: "کوردیی ناوەندی", rtl: true },
  { code: "ta-LK", name: "Tamil (Sri Lanka)", native: "தமிழ் (இலங்கை)" },
];

export const DEFAULT_LANGUAGE = "en-US";

/** Best supported language for a device locale string (navigator.language).
 * Tries exact (en-US), then base-language (en → en-US), then default. */
export function matchDeviceLanguage(locale: string | null | undefined): string {
  if (!locale) return DEFAULT_LANGUAGE;
  const want = locale.trim().toLowerCase();
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === want);
  if (exact) return exact.code;
  const base = want.split("-")[0];
  const baseMatch = LANGUAGES.find((l) => l.code.toLowerCase().split("-")[0] === base);
  return baseMatch ? baseMatch.code : DEFAULT_LANGUAGE;
}

export function languageByCode(code: string | null | undefined): Language | undefined {
  if (!code) return undefined;
  return LANGUAGES.find((l) => l.code === code);
}

export function languageLabel(code: string | null | undefined): string {
  const l = languageByCode(code);
  return l ? (l.native === l.name ? l.name : `${l.native} (${l.name})`) : "English";
}
