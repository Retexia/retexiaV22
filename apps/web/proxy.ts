import { isStaffRole, safeNext, supabaseEnv } from "@retexia/supabase";
import { updateSession, withSessionCookies } from "@retexia/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { RESUME_COOKIE, handoffPath, readResume } from "@/lib/panel-handoff";

/**
 * Runs before every page request:
 * 1. refreshes the Supabase session cookie,
 * 2. sends signed-out visitors from /account/** and /<product>/get-started
 *    to /login?next=<url>,
 * 3. shows the maintenance page to everyone except the Retexia team when
 *    site_settings.maintenance_mode is on (flag cached for 60 seconds).
 */

const MAINTENANCE_TTL_MS = 60_000;
let maintenanceCache: { value: boolean; at: number } | null = null;

async function maintenanceMode(): Promise<boolean> {
  if (maintenanceCache && Date.now() - maintenanceCache.at < MAINTENANCE_TTL_MS) return maintenanceCache.value;
  const { url, anonKey, configured } = supabaseEnv();
  if (!configured) return false;
  try {
    const res = await fetch(`${url}/rest/v1/site_settings?select=maintenance_mode&id=eq.1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(2000),
    });
    const rows = (await res.json()) as { maintenance_mode?: boolean }[];
    const value = Boolean(rows?.[0]?.maintenance_mode);
    maintenanceCache = { value, at: Date.now() };
    return value;
  } catch {
    return maintenanceCache?.value ?? false;
  }
}

function isProtected(pathname: string) {
  return pathname === "/account" || pathname.startsWith("/account/") || /^\/[^/]+\/get-started\/?$/.test(pathname);
}

const MAINTENANCE_EXEMPT = /^\/(maintenance|login|auth|api|forgot-password|reset-password)(\/|$)/;

export async function proxy(request: NextRequest) {
  const { response, claims, supabase } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // Already signed in: skip the sign-in pages and go where the visitor was heading.
  // (Not when a product panel just sent them here: that panel couldn't see the
  // session, so bouncing back would loop.)
  if (claims && /^\/(login|signup)\/?$/.test(pathname) && request.nextUrl.searchParams.get("from") !== "panel") {
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    const target = next.startsWith("/") ? new URL(next, request.nextUrl.origin) : new URL(next);
    return withSessionCookies(response, NextResponse.redirect(target));
  }

  // Supabase sends sign-ins to the Site URL when a redirect address isn't on its
  // allow list: finish them at /auth/callback instead of dropping the code.
  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const cb = request.nextUrl.clone();
    cb.pathname = "/auth/callback";
    return withSessionCookies(response, NextResponse.redirect(cb));
  }

  // Signed in on the way to a product panel: whatever route sign-in took
  // (Google, an email link, the default /account), continue to the panel.
  if (claims && (pathname === "/account" || pathname === "/")) {
    const pending = readResume(request.cookies.get(RESUME_COOKIE)?.value);
    if (pending) {
      const res = NextResponse.redirect(new URL(handoffPath(pending.to, pending.state), request.nextUrl.origin));
      res.cookies.delete(RESUME_COOKIE);
      // Last: withSessionCookies adds raw Set-Cookie headers that later cookie edits would drop.
      return withSessionCookies(response, res);
    }
  }

  if (!claims && isProtected(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return withSessionCookies(response, NextResponse.redirect(login));
  }

  if (!MAINTENANCE_EXEMPT.test(pathname) && (await maintenanceMode())) {
    let staff = false;
    if (claims?.sub && supabase) {
      const { data } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
      staff = isStaffRole(data?.role);
    }
    if (!staff) {
      const target = request.nextUrl.clone();
      target.pathname = "/maintenance";
      target.search = "";
      return withSessionCookies(response, NextResponse.rewrite(target, { status: 503 }));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js internals, static files and metadata routes.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff2?)$).*)",
  ],
};
