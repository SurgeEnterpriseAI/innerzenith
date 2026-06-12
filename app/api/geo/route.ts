import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the visitor's approximate location from Vercel's edge geo headers
// (injected on every request — free, no third-party IP service). The client
// maps this to a default language (lib/geo.ts), so e.g. a visitor in Bengaluru
// opens in Kannada. Empty in local dev (headers absent) → client falls back to
// the browser language.
export async function GET(req: NextRequest) {
  return NextResponse.json({
    country: req.headers.get("x-vercel-ip-country") || "",
    region: req.headers.get("x-vercel-ip-country-region") || "",
    city: req.headers.get("x-vercel-ip-city") || "",
  });
}
