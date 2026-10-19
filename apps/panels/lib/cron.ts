import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Scheduler calls (Supabase pg_cron, Vercel Cron or n8n): X-Retexia-Key or Bearer = POST_CRON_KEY. */
export function cronAuthorized(request: NextRequest): boolean {
  const key = process.env.POST_CRON_KEY ?? "";
  if (key.length < 16) return false;
  const given = request.headers.get("x-retexia-key") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return given.length === key.length && timingSafeEqual(Buffer.from(given), Buffer.from(key));
}

/**
 * Calls from the n8n Post worker: X-Retexia-Key = N8N_POST_KEY (its Config retexiaKey).
 * Spaces around either value are ignored (HTTP drops them from headers anyway).
 */
export function workerAuth(request: NextRequest): { ok: true } | { ok: false; reason: string } {
  const key = (process.env.N8N_POST_KEY ?? "").trim();
  if (!key) return { ok: false, reason: "N8N_POST_KEY is not set on post.retexia.com." };
  const given = (request.headers.get("x-retexia-key") ?? "").trim();
  if (!given) return { ok: false, reason: "No X-Retexia-Key header: check the Prepare product / Paste product nodes." };
  if (given.length !== key.length || !timingSafeEqual(Buffer.from(given), Buffer.from(key))) {
    return { ok: false, reason: "X-Retexia-Key doesn't match N8N_POST_KEY: retexiaKey in n8n Config must be the same value." };
  }
  return { ok: true };
}
