# RT Countdown

Pick movies. Their Rotten Tomatoes score subtracts from 401. Hit exactly zero to win.

Scores are hidden until after you pick — the skill is knowing how well-received a movie actually was.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- `/api/movies` — returns a randomized set of 24 movies (6 rounds × 4 choices)
- `/api/score` — scrapes RT directly for a given movie's Tomatometer score, cached for 24h by Next.js

No API keys needed.

## Game rules

- You start at **401**
- Each round you're shown 4 movies — pick one
- After confirming, its RT Tomatometer score is revealed and subtracted
- 6 rounds total
- **Goal: land exactly on 0**
- Go negative and you bust
- Survive all rounds without hitting 0 and you see how far off you landed
