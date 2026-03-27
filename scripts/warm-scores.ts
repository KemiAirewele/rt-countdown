import { MOVIE_POOL } from "../lib/movies";
import { scrapeRTScore, scoreKey } from "../lib/scrape-rt";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";

const OUT = resolve(__dirname, "../data/scores.json");
const CONCURRENCY = 5;

async function main() {
  // Load existing scores to avoid re-scraping successes
  let existing: Record<string, number | null> = {};
  if (existsSync(OUT)) {
    existing = JSON.parse(readFileSync(OUT, "utf-8"));
  }

  const results: Record<string, number | null> = { ...existing };
  const toFetch = MOVIE_POOL.filter((m) => {
    const key = scoreKey(m.title, m.year);
    return !(key in existing) || existing[key] === null;
  });

  console.log(
    `Pool: ${MOVIE_POOL.length} movies | Cached: ${Object.keys(existing).length} | To fetch: ${toFetch.length}`
  );

  let done = 0;
  let failures = 0;

  // Process in batches
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const scores = await Promise.all(
      batch.map(async (movie) => {
        const score = await scrapeRTScore(movie.title, movie.year);
        return { movie, score };
      })
    );

    for (const { movie, score } of scores) {
      const key = scoreKey(movie.title, movie.year);
      results[key] = score;
      done++;
      if (score === null) {
        failures++;
        console.log(`  [MISS] ${movie.title} (${movie.year})`);
      } else {
        console.log(`  [${done}/${toFetch.length}] ${movie.title} (${movie.year}) → ${score}%`);
      }
    }

    // Write after each batch so progress is saved if interrupted
    writeFileSync(OUT, JSON.stringify(results, null, 2));
  }

  const total = Object.keys(results).length;
  const nulls = Object.values(results).filter((v) => v === null).length;
  console.log(`\nDone. ${total} movies scored, ${nulls} unavailable.`);
  console.log(`Written to ${OUT}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
