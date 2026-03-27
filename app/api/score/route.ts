import { NextRequest, NextResponse } from "next/server";
import { scrapeRTScore, scoreKey } from "@/lib/scrape-rt";
import scoresJson from "@/data/scores.json";

const prewarmed: Record<string, number | null> = scoresJson;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");
  const year = parseInt(searchParams.get("year") ?? "0");

  if (!title || !year) {
    return NextResponse.json({ error: "Missing title or year" }, { status: 400 });
  }

  // Try pre-warmed lookup first
  const key = scoreKey(title, year);
  if (key in prewarmed && prewarmed[key] !== null) {
    return NextResponse.json(
      { title, year, score: prewarmed[key] },
      { headers: CACHE_HEADERS }
    );
  }

  // Fall back to live scraping
  const score = await scrapeRTScore(title, year);
  return NextResponse.json(
    { title, year, score },
    { headers: CACHE_HEADERS }
  );
}
