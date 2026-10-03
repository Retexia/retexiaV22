import "server-only";

import { headers } from "next/headers";

/** Canonical site URL from NEXT_PUBLIC_SITE_URL (no trailing slash). */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Origin of the current request (works on Vercel previews and localhost).
 * Only used to build auth redirect links, which Supabase checks against its
 * allow-list, so a spoofed Host header cannot redirect anywhere unexpected.
 */
export async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : siteUrl();
}
