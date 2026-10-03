import "server-only";

import { webUrl } from "./env";

/**
 * Tell retexia.com to refresh its cached content right away. Returns true
 * when the website confirmed ("Live on website").
 */
export async function revalidateWebsite(table?: string): Promise<boolean> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;
  try {
    const res = await fetch(`${webUrl()}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ table: table ?? "admin" }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
