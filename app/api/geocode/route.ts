import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Geocoding fallback (Stage 1.3a). Uses Open-Meteo's free geocoding API
// (no key required) to resolve a city name to lat/lng/timezone/country.
// The IANA timezone returned here feeds the Stage 1.4 time-conversion chain.

type GeoResult = {
  name: string;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", q);
    url.searchParams.set("count", "5");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = await res.json();

    const results: GeoResult[] = (data.results || []).map((r: any) => ({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      country: r.country ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? null,
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
