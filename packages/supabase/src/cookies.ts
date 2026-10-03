import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Shared auth cookie settings for every Retexia app.
 *
 * With NEXT_PUBLIC_COOKIE_DOMAIN=.retexia.com the session cookie is sent to
 * retexia.com and every *.retexia.com subdomain, so one login works on the
 * main site and on product panels like lingo.retexia.com. Leave it empty on
 * localhost and Vercel preview URLs (cookies then stay on the current host).
 */
export function cookieOptions(): CookieOptionsWithName {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim() || undefined;
  return {
    name: "sb-retexia-auth",
    domain,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}
