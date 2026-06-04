import { NextRequest, NextResponse } from "next/server";
import { computeProfile, EphemerisInput } from "@/lib/ephemeris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called once at the end of onboarding ("Connecting your dots").
// Computes the full four-system profile via the Render engine and returns it
// for permanent storage. If the engine isn't configured/reachable, returns
// { profile: null } and the app proceeds with profile-facts only.

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { birth?: EphemerisInput }
    | null;
  if (!body?.birth?.birth_date) {
    return NextResponse.json({ profile: null, error: "birth_date required" }, { status: 400 });
  }
  try {
    const profile = await computeProfile(body.birth);
    return NextResponse.json({ profile: profile ?? null });
  } catch (e: any) {
    console.error("[compute-profile] failed:", e?.message || e);
    return NextResponse.json({ profile: null });
  }
}
