import { NextRequest, NextResponse } from "next/server";

function extractScore(html: string): number | null {
  // Primary: criticsScore JSON blob — most reliable pattern on current RT pages
  // e.g. "criticsScore":{"averageRating":"9.40","certified":true,...,"score":"99",...}
  const criticsMatch = html.match(/"criticsScore"\s*:\s*\{[^}]*"score"\s*:\s*"(\d+)"/);
  if (criticsMatch) return parseInt(criticsMatch[1]);

  // Fallback: score-board web component tomatometerscore attribute
  const boardMatch = html.match(/tomatometerscore["\s:]+(\d+)/i);
  if (boardMatch) return parseInt(boardMatch[1]);

  // Fallback: Twitter meta tag (specifically for critic score)
  const metaMatch = html.match(/name="twitter:data1"\s+content="(\d+)%"/i);
  if (metaMatch) return parseInt(metaMatch[1]);

  return null;
}

// Scrapes RT directly — no API key needed
async function scrapeRTScore(title: string, year: number): Promise<number | null> {
  const slug = title
    .toLowerCase()
    .replace(/[-:]/g, " ")       // hyphens/colons become spaces (then underscores)
    .replace(/[^a-z0-9\s]/g, "") // drop everything else
    .trim()
    .replace(/\s+/g, "_");

  // Try both URL patterns — slug_year is more specific but sometimes has empty data
  const urls = [
    `https://www.rottentomatoes.com/m/${slug}_${year}`,
    `https://www.rottentomatoes.com/m/${slug}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        next: { revalidate: 86400 }, // cache 24h
      });

      if (!res.ok) continue;
      const html = await res.text();
      const score = extractScore(html);
      if (score !== null) return score;
    } catch {
      continue;
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");
  const year = parseInt(searchParams.get("year") ?? "0");

  if (!title || !year) {
    return NextResponse.json({ error: "Missing title or year" }, { status: 400 });
  }

  const score = await scrapeRTScore(title, year);
  return NextResponse.json({ title, year, score });
}
