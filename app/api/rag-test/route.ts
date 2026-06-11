import { NextRequest, NextResponse } from "next/server";
import { retrieveClassical, ragConfigured, _debugStoreSize, _debugEmbedOk } from "@/lib/rag";

// Diagnostic: confirms classical-text retrieval works in the deployed runtime.
// GET /api/rag-test?q=...  → store size, whether query-embed succeeded, top hits.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "yoga for rise in career and recognition";
  const storeSize = _debugStoreSize();
  const queryEmbedOk = await _debugEmbedOk(q);
  const hits = await retrieveClassical(q, 5);
  return NextResponse.json({
    configured: ragConfigured(),
    storeSize,
    queryEmbedOk, // false ⇒ VOYAGE_API_KEY in the env is invalid/malformed
    count: hits.length,
    hits: hits.map((h) => ({
      title: h.title,
      location: h.location,
      similarity: Number(h.similarity.toFixed(3)),
      preview: h.content.slice(0, 120).replace(/\s+/g, " ").trim(),
    })),
  });
}
