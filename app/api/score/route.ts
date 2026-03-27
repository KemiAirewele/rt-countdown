import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { scrapeRTScore, scoreKey } from "@/lib/scrape-rt";
import scoresJson from "@/data/scores.json";

const prewarmed: Record<string, number | null> = scoresJson;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
};

function respond(title: string, year: number, score: number | null) {
  return NextResponse.json({ title, year, score }, { headers: CACHE_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");
  const year = parseInt(searchParams.get("year") ?? "0");

  if (!title || !year) {
    return NextResponse.json({ error: "Missing title or year" }, { status: 400 });
  }

  const key = scoreKey(title, year);

  // 1. Pre-warmed JSON
  if (key in prewarmed && prewarmed[key] !== null) {
    return respond(title, year, prewarmed[key]);
  }

  // 2. Vercel KV confirmed (crowdsourced)
  try {
    const confirmed = await kv.get<number>(`confirmed::${key}`);
    if (confirmed !== null) {
      return respond(title, year, confirmed);
    }
  } catch {
    // KV unavailable — continue to scraping
  }

  // 3. Live scraping
  const score = await scrapeRTScore(title, year);
  return respond(title, year, score);
}
