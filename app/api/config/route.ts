import { NextResponse } from "next/server";

// Tiny endpoint the client polls once on load to learn which features
// are turned on. Never leaks keys — just booleans.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    voice: Boolean(process.env.AZURE_SPEECH_KEY),
    persistence: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    chartMath: Boolean(process.env.EPHEMERIS_URL),
    // classical-text grounding: Voyage key gates it; the embeddings store is
    // bundled into the chat function. (Light check — don't load the 15MB store here.)
    rag: Boolean(process.env.VOYAGE_API_KEY),
  });
}
