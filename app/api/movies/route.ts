import { NextResponse } from "next/server";
import { MOVIE_POOL, TIER_MIX, type PoolEntry, type Movie } from "@/lib/movies";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stripTier(entry: PoolEntry): Movie {
  return { title: entry.title, year: entry.year };
}

export async function GET() {
  // Separate pool by tier and shuffle each
  const byTier = {
    high: shuffle(MOVIE_POOL.filter((m) => m.tier === "high")),
    mid: shuffle(MOVIE_POOL.filter((m) => m.tier === "mid")),
    low: shuffle(MOVIE_POOL.filter((m) => m.tier === "low")),
  };

  // Generate as many balanced buckets as the smallest tier allows
  const maxBuckets = Math.min(
    ...TIER_MIX.map(({ tier, count }) => Math.floor(byTier[tier].length / count))
  );

  const buckets: Movie[][] = [];
  for (let i = 0; i < maxBuckets; i++) {
    const bucket: Movie[] = [];
    for (const { tier, count } of TIER_MIX) {
      bucket.push(...byTier[tier].splice(0, count).map(stripTier));
    }
    buckets.push(shuffle(bucket)); // shuffle within bucket so tiers aren't grouped
  }

  return NextResponse.json({ buckets });
}
