export function extractScore(html: string): number | null {
  // Primary: criticsScore JSON blob — most reliable pattern on current RT pages
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

export function buildSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[-:]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export async function scrapeRTScore(title: string, year: number): Promise<number | null> {
  const slug = buildSlug(title);

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

export function scoreKey(title: string, year: number): string {
  return `${title}::${year}`;
}
