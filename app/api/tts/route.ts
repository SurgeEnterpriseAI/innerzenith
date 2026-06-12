import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Azure Neural TTS — returns an MP3 of the advisor reading the text aloud, in
// the user's language. The voice is resolved dynamically from Azure's live
// catalog for the requested locale (so we never ship a stale/invalid voice
// name), preferring a female neural voice. Falls back to en-US-AnaNeural (the
// founder's English preference) when a locale has no Azure voice — the reading
// text is still in the user's language; only the audio language falls back.
//
// Cost guard: hard cap so a runaway message can't drain the Azure tier.

const MAX_CHARS = 3000;
const FALLBACK_VOICE = "en-US-AnaNeural";

type AzureVoice = { ShortName: string; Gender: string; Locale: string };
let voicesCache: { ts: number; list: AzureVoice[] } | null = null;
const VOICES_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function getVoices(region: string, key: string): Promise<AzureVoice[]> {
  if (voicesCache && Date.now() - voicesCache.ts < VOICES_TTL_MS) return voicesCache.list;
  try {
    const res = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      { headers: { "Ocp-Apim-Subscription-Key": key } }
    );
    if (!res.ok) return voicesCache?.list ?? [];
    const list = (await res.json()) as AzureVoice[];
    voicesCache = { ts: Date.now(), list };
    return list;
  } catch {
    return voicesCache?.list ?? [];
  }
}

// Pick the best neural voice for a locale: exact-locale female first, then any
// exact-locale voice, then base-language match, then null (caller falls back).
function pickVoice(voices: AzureVoice[], lang: string): { name: string; locale: string } | null {
  if (!voices.length || !lang) return null;
  const want = lang.toLowerCase();
  const base = want.split("-")[0];
  const exact = voices.filter((v) => v.Locale?.toLowerCase() === want);
  const baseMatch = voices.filter((v) => v.Locale?.toLowerCase().split("-")[0] === base);
  const pool = exact.length ? exact : baseMatch;
  if (!pool.length) return null;
  const female = pool.filter((v) => v.Gender === "Female");
  const chosen = (female.length ? female : pool)[0];
  return { name: chosen.ShortName, locale: chosen.Locale };
}

export async function POST(req: NextRequest) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";

  if (!key) {
    return new Response("AZURE_SPEECH_KEY not configured", { status: 503 });
  }

  const { text, lang } = (await req.json().catch(() => ({}))) as {
    text?: string;
    lang?: string;
  };
  if (!text || typeof text !== "string") {
    return new Response("text required", { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return new Response(`text too long (max ${MAX_CHARS})`, { status: 413 });
  }

  // Resolve the voice for the requested language; fall back to the English voice.
  let voice = process.env.AZURE_SPEECH_VOICE || FALLBACK_VOICE;
  let xmlLang = "en-US";
  if (lang) {
    const picked = pickVoice(await getVoices(region, key), lang);
    if (picked) {
      voice = picked.name;
      xmlLang = picked.locale;
    }
  }

  // SSML — slow, calm prosody to match the wise-advisor voice.
  const ssml = `<speak version="1.0" xml:lang="${xmlLang}" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="${voice}">
    <prosody rate="-8%" pitch="-2%">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

  try {
    const res = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "innerzenith",
        },
        body: ssml,
      }
    );
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      return new Response(`Azure TTS error (${res.status}): ${detail}`, { status: 502 });
    }
    return new Response(res.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return new Response(`TTS request failed: ${e?.message || e}`, { status: 502 });
  }
}
