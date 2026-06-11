import { NextRequest, NextResponse } from "next/server";
import { retrieveClassical, ragConfigured, _debugStoreSize, _debugVoyage } from "@/lib/rag";

// Diagnostic: proves classical-text retrieval works in the deployed runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "yoga for rise in career and recognition";
  const storeSize = _debugStoreSize();
  const voyage = await _debugVoyage(q);
  const hits = await retrieveClassical(q, 5);
  return NextResponse.json({
    configured: ragConfigured(),
    storeSize,
    voyage,
    count: hits.length,
    hits: hits.map((h) => ({
      title: h.title,
      location: h.location,
      similarity: Number(h.similarity.toFixed(3)),
      preview: h.content.slice(0, 120).replace(/\s+/g, " ").trim(),
    })),
  });
}
