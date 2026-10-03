/**
 * Open-redirect protection for `?next=` parameters.
 *
 * Allowed: relative paths ("/account", "/lingo/get-started?package=pro"),
 * https://retexia.com and https://*.retexia.com (the cookie domain), and the
 * site's own NEXT_PUBLIC_SITE_URL origin. Anything else falls back.
 */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next) return fallback;
  const value = next.trim();

  // Relative path, but not protocol-relative ("//evil.com") or "/\evil.com".
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value;
  }

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    return fallback;
  }
  if (target.username || target.password) return fallback;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      if (target.origin === new URL(siteUrl).origin) return target.toString();
    } catch {
      // ignore a malformed NEXT_PUBLIC_SITE_URL
    }
  }

  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim().replace(/^\./, "");
  const allowedRoot = cookieDomain || "retexia.com";
  const host = target.hostname.toLowerCase();
  if (target.protocol === "https:" && (host === allowedRoot || host.endsWith(`.${allowedRoot}`))) {
    return target.toString();
  }
  return fallback;
}
