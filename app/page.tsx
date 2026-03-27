"use client";

import { useState, useEffect, useCallback } from "react";
import { BUCKET_SIZE, TARGET } from "@/lib/movies";

interface Movie {
  title: string;
  year: number;
  rt?: number | null;
}

type GamePhase = "loading" | "picking" | "revealing" | "between" | "manual" | "gameover" | "error";
type EndType = "win" | "bust" | "fold";

interface HistoryEntry {
  movie: Movie;
  scoreAfter: number;
}

interface ScoredMovie {
  title: string;
  year: number;
  score: number;
}

// DP solver: find ALL pick combos (one per bucket) whose scores sum to exactly `target`
function findAllWinningPaths(
  scoredBuckets: ScoredMovie[][],
  target: number
): ScoredMovie[][] {
  const n = scoredBuckets.length;
  if (n === 0) return [];

  // reachable[b] maps sum -> set of movie indices that can produce that sum at bucket b
  const reachable: Map<number, Set<number>>[] = [];

  // Bucket 0
  const first = new Map<number, Set<number>>();
  for (let m = 0; m < scoredBuckets[0].length; m++) {
    const s = scoredBuckets[0][m].score;
    if (s <= target) {
      if (!first.has(s)) first.set(s, new Set());
      first.get(s)!.add(m);
    }
  }
  reachable.push(first);

  // Buckets 1..n-1
  for (let b = 1; b < n; b++) {
    const curr = new Map<number, Set<number>>();
    for (const [prevSum] of reachable[b - 1]) {
      for (let m = 0; m < scoredBuckets[b].length; m++) {
        const newSum = prevSum + scoredBuckets[b][m].score;
        if (newSum <= target) {
          if (!curr.has(newSum)) curr.set(newSum, new Set());
          curr.get(newSum)!.add(m);
        }
      }
    }
    reachable.push(curr);
  }

  if (!reachable[n - 1].has(target)) return [];

  // Backtrack to enumerate all paths
  const paths: ScoredMovie[][] = [];
  const MAX_PATHS = 200;

  function backtrack(b: number, sum: number, path: ScoredMovie[]) {
    if (paths.length >= MAX_PATHS) return;
    if (b < 0) {
      if (sum === 0) paths.push([...path]);
      return;
    }
    const indices = reachable[b].get(sum);
    if (!indices) return;
    for (const m of indices) {
      path[b] = scoredBuckets[b][m];
      backtrack(b - 1, sum - scoredBuckets[b][m].score, path);
    }
  }

  backtrack(n - 1, target, new Array(n));
  return paths;
}

function rtSearchUrl(title: string): string {
  const q = encodeURIComponent(title);
  return `https://www.rottentomatoes.com/search?search=${q}`;
}

export default function Game() {
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [score, setScore] = useState(TARGET);
  const [round, setRound] = useState(0);
  const [buckets, setBuckets] = useState<Movie[][]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [endType, setEndType] = useState<EndType>("fold");
  const [fetchingScore, setFetchingScore] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [manualInput, setManualInput] = useState("");

  // Winning paths state
  const [winningPaths, setWinningPaths] = useState<ScoredMovie[][]>([]);
  const [pathStatus, setPathStatus] = useState<"idle" | "loading" | "done">("idle");

  const currentBucket = buckets[round] ?? [];

  const loadGame = useCallback(async () => {
    setPhase("loading");
    setScore(TARGET);
    setRound(0);
    setSelected(null);
    setHistory([]);
    setErrorMsg("");
    setWinningPaths([]);
    setPathStatus("idle");

    try {
      const res = await fetch("/api/movies");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      if (!data.buckets?.length) throw new Error("No movie data received");
      setBuckets(data.buckets);
      setPhase("picking");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load movies");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  async function fetchMovieScore(movie: Movie): Promise<number | null> {
    const res = await fetch(
      `/api/score?title=${encodeURIComponent(movie.title)}&year=${movie.year}`
    );
    const data = await res.json();
    return typeof data.score === "number" ? data.score : null;
  }

  // Compute winning path after game ends
  const computeWinningPath = useCallback(
    async (playedBuckets: Movie[][], playedRounds: number) => {
      setPathStatus("loading");

      // Fetch scores for all movies in all played buckets (in parallel)
      const scoredBuckets: ScoredMovie[][] = [];

      for (let b = 0; b <= playedRounds; b++) {
        const bucket = playedBuckets[b];
        if (!bucket) continue;

        const scored = await Promise.all(
          bucket.map(async (movie) => {
            // Use already-fetched score if available
            if (movie.rt !== null && movie.rt !== undefined) {
              return { title: movie.title, year: movie.year, score: movie.rt };
            }
            const rt = await fetchMovieScore(movie);
            return { title: movie.title, year: movie.year, score: rt ?? -1 };
          })
        );

        // Filter out movies whose score couldn't be fetched
        scoredBuckets.push(scored.filter((m) => m.score >= 0));
      }

      const paths = findAllWinningPaths(scoredBuckets, TARGET);
      setWinningPaths(paths);
      setPathStatus("done");
    },
    []
  );

  async function confirmPick() {
    if (selected === null) return;
    setFetchingScore(true);
    setPhase("revealing");

    const movie = currentBucket[selected];
    const rt = await fetchMovieScore(movie);

    // Patch score into bucket for display
    const updatedBuckets = [...buckets];
    updatedBuckets[round] = [...currentBucket];
    updatedBuckets[round][selected] = { ...movie, rt };
    setBuckets(updatedBuckets);
    setFetchingScore(false);

    if (rt === null) {
      // Score unavailable — let the user look it up manually
      setManualInput("");
      setPhase("manual");
      return;
    }

    applyScore(rt, updatedBuckets);
  }

  function submitManualScore() {
    const val = parseInt(manualInput);
    if (isNaN(val) || val < 0 || val > 100) return;

    // Patch the manual score into the bucket
    const updatedBuckets = [...buckets];
    updatedBuckets[round] = [...currentBucket];
    updatedBuckets[round][selected!] = { ...currentBucket[selected!], rt: val };
    setBuckets(updatedBuckets);

    applyScore(val, updatedBuckets);
  }

  function applyScore(rt: number, updatedBuckets: Movie[][]) {
    const newScore = score - rt;
    setScore(newScore);

    const movie = updatedBuckets[round][selected!];
    const entry: HistoryEntry = {
      movie: { ...movie, rt },
      scoreAfter: newScore,
    };
    setHistory((h) => [...h, entry]);

    if (newScore === 0) {
      setEndType("win");
      setPhase("gameover");
    } else if (newScore < 0) {
      setEndType("bust");
      setPhase("gameover");
      computeWinningPath(updatedBuckets, round);
    } else {
      setPhase("between");
    }
  }

  function nextRound() {
    setRound((r) => r + 1);
    setSelected(null);
    setPhase("picking");
  }

  function fold() {
    setEndType("fold");
    setPhase("gameover");
    computeWinningPath(buckets, round);
  }

  const pct = Math.max(0, (score / TARGET) * 100);
  const trackColor =
    pct > 60 ? "#22c55e" : pct > 30 ? "#f59e0b" : "#ef4444";

  // Check if we've run out of buckets
  const outOfBuckets = round >= buckets.length && phase !== "gameover" && phase !== "loading" && phase !== "error";

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-mono text-xs tracking-widest text-neutral-500 uppercase mb-6">
            RT Countdown
          </h1>

          {/* Score */}
          <div className="flex items-baseline gap-3 mb-2">
            <span
              className="font-mono font-medium transition-colors duration-300"
              style={{
                fontSize: "72px",
                lineHeight: 1,
                color: score <= 0 ? "#ef4444" : score <= 50 ? "#f59e0b" : "white",
              }}
            >
              {score}
            </span>
            <span className="text-neutral-500 text-sm">remaining</span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden mb-1">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: trackColor }}
            />
          </div>

          {phase !== "loading" && phase !== "gameover" && phase !== "error" && (
            <p className="font-mono text-xs text-neutral-600 mt-2">
              round {round + 1} · {history.length} pick{history.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Loading */}
        {phase === "loading" && (
          <p className="text-neutral-500 text-sm font-mono animate-pulse">
            loading lineup...
          </p>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="rounded-2xl p-6 mb-8 border bg-red-950 border-red-800">
            <p className="font-mono font-medium text-sm text-red-400 mb-2">
              Failed to load game
            </p>
            <p className="text-neutral-400 text-xs mb-4">{errorMsg}</p>
            <button
              onClick={loadGame}
              className="font-mono text-sm px-5 py-2.5 rounded-xl border border-red-700 text-red-300 hover:bg-red-900 transition-all"
            >
              retry
            </button>
          </div>
        )}

        {/* Game over */}
        {phase === "gameover" && (
          <div
            className={`rounded-2xl p-6 mb-8 border ${
              endType === "win"
                ? "bg-green-950 border-green-800"
                : endType === "bust"
                ? "bg-red-950 border-red-800"
                : "bg-amber-950 border-amber-800"
            }`}
          >
            <p
              className={`font-mono font-medium text-lg mb-1 ${
                endType === "win"
                  ? "text-green-400"
                  : endType === "bust"
                  ? "text-red-400"
                  : "text-amber-400"
              }`}
            >
              {endType === "win"
                ? "Perfect score."
                : endType === "bust"
                ? `Went negative by ${Math.abs(score)}.`
                : `Folded at ${score}.`}
            </p>
            <p className="text-neutral-400 text-sm">
              {endType === "win"
                ? `You hit exactly 0 in ${history.length} pick${history.length !== 1 ? "s" : ""}. Certified fresh.`
                : endType === "bust"
                ? "That last pick took you under."
                : score <= 15
                ? "So close. Should have pushed your luck."
                : `Walked away ${score} short after ${history.length} pick${history.length !== 1 ? "s" : ""}.`}
            </p>
          </div>
        )}

        {/* Out of movies fallback */}
        {outOfBuckets && (
          <div className="rounded-2xl p-6 mb-8 border bg-amber-950 border-amber-800">
            <p className="font-mono font-medium text-sm text-amber-400 mb-2">
              Out of movies
            </p>
            <p className="text-neutral-400 text-xs mb-4">
              You went through all {buckets.length} rounds. Final score: {score}.
            </p>
            <button
              onClick={loadGame}
              className="font-mono text-sm px-5 py-2.5 rounded-xl border border-amber-700 text-amber-300 hover:bg-amber-900 transition-all"
            >
              play again
            </button>
          </div>
        )}

        {/* Movie bucket */}
        {(phase === "picking" || phase === "revealing" || phase === "between" || phase === "manual") && !outOfBuckets && (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {currentBucket.map((movie, i) => {
              const isSelected = selected === i;
              const isRevealed =
                (phase === "revealing" || phase === "between" || phase === "manual") && isSelected;
              const isDisabled =
                phase === "revealing" || phase === "between" || phase === "manual";

              return (
                <div
                  key={`${movie.title}-${i}`}
                  onClick={() => !isDisabled && setSelected(i)}
                  role={isDisabled ? undefined : "button"}
                  tabIndex={isDisabled ? undefined : 0}
                  onKeyDown={(e) => !isDisabled && e.key === "Enter" && setSelected(i)}
                  className={`
                    text-left rounded-2xl border p-4 transition-all duration-150
                    ${isSelected
                      ? "border-white bg-white/5"
                      : "border-neutral-800 bg-neutral-900 hover:border-neutral-600 hover:bg-neutral-800/60"
                    }
                    ${isDisabled && !isSelected ? "opacity-30 cursor-default" : "cursor-pointer"}
                    ${isDisabled && isSelected ? "cursor-default" : ""}
                  `}
                >
                  <p className="font-sans font-medium text-sm text-white leading-snug mb-1">
                    {movie.title}
                  </p>
                  <p className="font-mono text-xs text-neutral-500">{movie.year}</p>

                  {/* Score reveal */}
                  {isRevealed && (
                    <div className="mt-3">
                      {fetchingScore ? (
                        <span className="font-mono text-xs text-neutral-500 animate-pulse">
                          fetching...
                        </span>
                      ) : movie.rt !== null && movie.rt !== undefined ? (
                        <span
                          className={`inline-block font-mono text-xs font-medium px-2 py-0.5 rounded-full ${
                            movie.rt >= 60
                              ? "bg-green-900 text-green-300"
                              : "bg-red-900 text-red-300"
                          }`}
                        >
                          {movie.rt}%
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-neutral-600">
                          score unavailable
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Manual score entry — shown below the grid when scrape failed */}
          {phase === "manual" && selected !== null && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 mb-6">
              <p className="font-sans font-medium text-sm text-white mb-3">
                Score unavailable for {currentBucket[selected]?.title}.{" "}
                <a
                  href={rtSearchUrl(currentBucket[selected]?.title ?? "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300 inline-flex items-center gap-1"
                >
                  look up on RT <span>→</span>
                </a>
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0–100"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitManualScore()}
                  autoFocus
                  className="w-[5.5rem] bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 font-mono text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
                />
                <button
                  onClick={submitManualScore}
                  className="font-mono text-sm px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-500 transition-all"
                >
                  submit
                </button>
              </div>
            </div>
          )}
        </>)}

        {/* Actions */}
        <div className="flex gap-3 mb-10">
          {phase === "picking" && (
            <>
              <button
                onClick={confirmPick}
                disabled={selected === null}
                className={`font-mono text-sm px-5 py-2.5 rounded-xl border transition-all ${
                  selected !== null
                    ? "border-white text-white hover:bg-white hover:text-black"
                    : "border-neutral-800 text-neutral-700 cursor-default"
                }`}
              >
                confirm pick
              </button>
              {history.length > 0 && (
                <button
                  onClick={fold}
                  className="font-mono text-sm px-5 py-2.5 rounded-xl border border-neutral-700 text-neutral-400 hover:border-amber-700 hover:text-amber-400 transition-all"
                >
                  fold
                </button>
              )}
            </>
          )}

          {phase === "between" && (
            <>
              <button
                onClick={nextRound}
                className="font-mono text-sm px-5 py-2.5 rounded-xl border border-white text-white hover:bg-white hover:text-black transition-all"
              >
                next round →
              </button>
              <button
                onClick={fold}
                className="font-mono text-sm px-5 py-2.5 rounded-xl border border-neutral-700 text-neutral-400 hover:border-amber-700 hover:text-amber-400 transition-all"
              >
                fold
              </button>
            </>
          )}

          {phase === "gameover" && (
            <button
              onClick={loadGame}
              className="font-mono text-sm px-5 py-2.5 rounded-xl border border-white text-white hover:bg-white hover:text-black transition-all"
            >
              play again
            </button>
          )}
        </div>

        {/* Status hint */}
        {phase === "picking" && selected === null && (
          <p className="text-neutral-600 text-xs font-mono mb-8">
            scores are hidden — pick based on what you know
          </p>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="border-t border-neutral-800 pt-6">
            <p className="font-mono text-xs text-neutral-600 mb-4 uppercase tracking-widest">
              picks
            </p>
            <div className="space-y-2">
              {history.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-neutral-300 flex-1 truncate pr-4">
                    {entry.movie.title}{" "}
                    <span className="text-neutral-600 font-mono text-xs">
                      {entry.movie.year}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-xs px-2 py-0.5 rounded-full mr-3 ${
                      entry.movie.rt == null
                        ? "text-neutral-600"
                        : entry.movie.rt >= 60
                        ? "bg-green-900 text-green-300"
                        : "bg-red-900 text-red-300"
                    }`}
                  >
                    {entry.movie.rt != null ? `${entry.movie.rt}%` : "??"}
                  </span>
                  <span className="font-mono text-xs text-neutral-500 min-w-[32px] text-right">
                    {entry.scoreAfter}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Winning paths */}
        {phase === "gameover" && endType !== "win" && (
          <div className="border-t border-neutral-800 pt-6 mt-6">
            <p className="font-mono text-xs text-neutral-600 mb-4 uppercase tracking-widest">
              paths to zero
            </p>

            {pathStatus === "loading" && (
              <p className="text-neutral-500 text-xs font-mono animate-pulse">
                fetching all scores and calculating...
              </p>
            )}

            {pathStatus === "done" && winningPaths.length === 0 && (
              <p className="text-neutral-600 text-xs font-mono">
                no winning path existed with these buckets
              </p>
            )}

            {pathStatus === "done" && winningPaths.length > 0 && (
              <div>
                <p className="text-neutral-500 text-xs font-mono mb-4">
                  {winningPaths.length} path{winningPaths.length !== 1 ? "s" : ""} found{winningPaths.length >= 200 ? "+" : ""}
                </p>
                <div className="space-y-6">
                  {winningPaths.map((path, pi) => (
                    <div key={pi}>
                      <p className="font-mono text-xs text-neutral-600 mb-2">
                        #{pi + 1}
                      </p>
                      <div className="space-y-1.5">
                        {path.map((movie, i) => {
                          const runningTotal = TARGET - path.slice(0, i + 1).reduce((s, m) => s + m.score, 0);
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-neutral-400 flex-1 truncate pr-4">
                                {movie.title}{" "}
                                <span className="text-neutral-600 font-mono text-xs">
                                  {movie.year}
                                </span>
                              </span>
                              <span
                                className={`font-mono text-xs px-2 py-0.5 rounded-full mr-3 ${
                                  movie.score >= 60
                                    ? "bg-green-900/50 text-green-400/70"
                                    : "bg-red-900/50 text-red-400/70"
                                }`}
                              >
                                {movie.score}%
                              </span>
                              <span className="font-mono text-xs text-neutral-500 min-w-[32px] text-right">
                                {runningTotal}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
