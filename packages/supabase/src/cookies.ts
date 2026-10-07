import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookie domain for a host: the session must be readable on retexia.com and
 * on every product panel (lingo.retexia.com, post.retexia.com, admin…).
 * localhost, IP addresses and *.vercel.app previews keep host-only cookies.
 */
export function cookieDomainFor(host: string | null | undefined): string | undefined {
  const h = (host ?? "").split(":")[0]!.trim().toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || /^[\d.]+$/.test(h) || h.includes("[") || h.endsWith(".vercel.app")) return undefined;
  const parts = h.split(".");
  return parts.length >= 2 ? `.${parts.slice(-2).join(".")}` : undefined;
}

/**
 * Shared auth cookie settings for every Retexia app.
 *
 * The session cookie is set for the whole domain (.retexia.com), so one login
 * works on the main site and on every subdomain. NEXT_PUBLIC_COOKIE_DOMAIN
 * overrides the automatic choice (for example on a custom preview domain).
 */
export function cookieOptions(host?: string | null): CookieOptionsWithName {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim() || cookieDomainFor(host);
  return {
    name: "sb-retexia-auth",
    domain,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}
