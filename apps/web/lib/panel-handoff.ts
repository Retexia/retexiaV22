/**
 * Sign-in hand-off to a product panel (lingo.retexia.com, post.retexia.com…).
 * While a visitor signs in on the way to a panel, this cookie remembers where
 * they were going, so any detour (Google, email confirmation, a stale link that
 * lands on /account) resumes the hand-off instead of stranding them.
 */
export const RESUME_COOKIE = "rx_panel_resume";
export const RESUME_MAX_AGE = 30 * 60;
export const STATE = /^[0-9a-f-]{36}$/;

/** Root domain of every panel: retexia.com (never www.retexia.com). */
function rootDomain() {
  const configured = (process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? "").trim().toLowerCase().replace(/^\./, "").replace(/^www\./, "");
  return configured || "retexia.com";
}

/** Only https://<panel>.retexia.com (not www); any localhost in development. */
export function panelTarget(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1")) return url;
  const root = rootDomain();
  if (url.protocol !== "https:" || !host.endsWith(`.${root}`) || host === `www.${root}`) return null;
  return url;
}

export function resumeValue(to: URL, state: string) {
  return JSON.stringify({ to: to.toString(), state });
}

/** The pending hand-off, if the cookie holds a valid one. */
export function readResume(raw: string | undefined): { to: URL; state: string } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { to?: string; state?: string };
    const to = panelTarget(v.to);
    return to && v.state && STATE.test(v.state) ? { to, state: v.state } : null;
  } catch {
    return null;
  }
}

export const handoffPath = (to: URL, state: string) => `/auth/panel?to=${encodeURIComponent(to.toString())}&state=${state}`;
