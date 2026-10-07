import "server-only";

/** Sign-in hand-off from retexia.com (see apps/web/app/auth/panel/route.ts). */
export const STATE_COOKIE = "rx_panel_state";
export const TRIES_COOKIE = "rx_panel_tries";
export const MAX_TRIES = 3;

/** Only same-site paths ("/orders?x=1"), never "//host" or full URLs. */
export function safePath(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && !v.startsWith("/auth/") ? v : "/";
}

/** Supabase project ref from a project URL or a token issuer (https://<ref>.supabase.co/auth/v1). */
export function projectRef(url: string | null | undefined): string | null {
  try {
    return url ? new URL(url).hostname.split(".")[0]! : null;
  } catch {
    return null;
  }
}

/** Issuer of a Supabase access token, read without verifying (only for the error message). */
export function tokenIssuer(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { iss?: string };
    return payload.iss ?? null;
  } catch {
    return null;
  }
}
