import "server-only";

import { headers } from "next/headers";

const hits = new Map<string, number[]>();

/**
 * Simple in-memory sliding-window limit per IP. Good enough to slow down
 * spam on a single instance; RLS and the honeypot do the rest.
 */
export async function rateLimit(scope: string, limit = 5, windowMs = 10 * 60 * 1000) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}
