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
