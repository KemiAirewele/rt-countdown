import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { scoreKey } from "@/lib/scrape-rt";

const CONFIRM_THRESHOLD = 3;
const MAX_REPORTS = 20;

export async function POST(req: NextRequest) {
  try {
    const { title, year, score } = await req.json();

    if (!title || !year || typeof score !== "number" || score < 0 || score > 100 || !Number.isInteger(score)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const key = scoreKey(title, year);
    const reportsKey = `reports::${key}`;
    const confirmedKey = `confirmed::${key}`;

    // Check if already confirmed
    const existing = await kv.get<number>(confirmedKey);
    if (existing !== null) {
      return NextResponse.json({ status: "confirmed", score: existing });
    }

    // Append report
    const reports: number[] = (await kv.get<number[]>(reportsKey)) ?? [];
    reports.push(score);
    // Cap at MAX_REPORTS, keeping the most recent
    const trimmed = reports.slice(-MAX_REPORTS);
    await kv.set(reportsKey, trimmed);

    // Check if 3+ reports agree on the same value
    const counts = new Map<number, number>();
    for (const r of trimmed) {
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }

    for (const [value, count] of counts) {
      if (count >= CONFIRM_THRESHOLD) {
        await kv.set(confirmedKey, value);
        return NextResponse.json({ status: "confirmed", score: value });
      }
    }

    return NextResponse.json({ status: "reported" });
  } catch {
    // KV unavailable (local dev, missing env vars) — silently accept
    return NextResponse.json({ status: "reported" });
  }
}
