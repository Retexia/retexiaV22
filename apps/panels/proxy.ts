import { updateSession, withSessionCookies } from "@retexia/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { webUrl } from "@/lib/env";
import { panelForHost } from "@/lib/panel";

const OWN_PATHS = /^\/(auth|api\/health)(\/|$)/;
const WEB_PATHS = /^\/(account|login|signup|forgot-password|reset-password|logout|pricing|contact)(\/|$)/;

/**
 * One app, one subdomain per product: post.retexia.com is served from
 * app/post, lingo.retexia.com from app/lingo (internal rewrite, the URL stays
 * clean). Also refreshes the Retexia session; visitors without one here go
 * through /auth/start (sign-in hand-off from retexia.com). Pages and actions
 * check the subscription again.
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  if (pathname === "/robots.txt") return response;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const panel = panelForHost(host);

  // An old or mistyped panel link (https://lingo.retexia.com/account): the panel's home is "/".
  if (/^\/account\/?$/.test(pathname)) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return withSessionCookies(response, NextResponse.redirect(home));
  }

  // Other retexia.com pages (/login, /signup, /account/...): send them there.
  if (WEB_PATHS.test(pathname)) return withSessionCookies(response, NextResponse.redirect(`${webUrl()}${pathname}${search}`));

  // Sign-in hand-off pages and the setup check work without a session and are not per-panel.
  if (OWN_PATHS.test(pathname)) return response;

  // Not signed in here: ask retexia.com (it hands the sign-in over, see app/auth).
  if (!claims?.sub) {
    const start = request.nextUrl.clone();
    start.pathname = "/auth/start";
    start.search = `?next=${encodeURIComponent(pathname + search)}`;
    return withSessionCookies(response, NextResponse.redirect(start));
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${panel}${pathname === "/" ? "" : pathname}`;
  const rewritten = NextResponse.rewrite(url, { request: { headers: request.headers } });
  return withSessionCookies(response, rewritten);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)"],
};
