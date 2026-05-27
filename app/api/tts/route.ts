import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Azure TTS — returns an MP3 stream of the wise advisor reading the text.
// Voice locked to en-US-AnaNeural (the founder's standing preference).
//
// Cost guard: hard cap at 3000 chars per request so a runaway message can't
// nuke the free F0 tier on Azure Speech.

const MAX_CHARS = 3000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function POST(req: NextRequest) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  const voice = process.env.AZURE_SPEECH_VOICE || "en-US-AnaNeural";

  if (!key) {
    return new Response("AZURE_SPEECH_KEY not configured", { status: 503 });
  }

  const { text } = (await req.json().catch(() => ({ text: "" }))) as {
    text?: string;
  };
  if (!text || typeof text !== "string") {
    return new Response("text required", { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return new Response(`text too long (max ${MAX_CHARS})`, { status: 413 });
  }

  // SSML — slow, calm prosody to match the wise-advisor voice.
  const ssml = `<speak version="1.0" xml:lang="en-US" xmlns:mstts="https://www.w3.org/2001/mstts">
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
      return new Response(`Azure TTS error (${res.status}): ${detail}`, {
        status: 502,
      });
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(`TTS request failed: ${e?.message || e}`, {
      status: 502,
    });
  }
}
