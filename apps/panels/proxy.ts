import { updateSession, withSessionCookies } from "@retexia/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { webUrl } from "@/lib/env";
import { panelForHost } from "@/lib/panel";

const WEB_PATHS = /^\/(account|login|signup|forgot-password|reset-password|logout|pricing|contact)(\/|$)/;

/**
 * One app, one subdomain per product: post.retexia.com is served from
 * app/post, lingo.retexia.com from app/lingo (internal rewrite, the URL stays
 * clean). Also refreshes the shared Retexia session and sends signed-out
 * visitors to retexia.com/login. Pages and actions check the subscription again.
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  if (pathname === "/robots.txt") return response;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const panel = panelForHost(host);

  // Account pages live on retexia.com (/account, /login, ...): send them there.
  if (WEB_PATHS.test(pathname)) return withSessionCookies(response, NextResponse.redirect(`${webUrl()}${pathname}${search}`));

  if (!claims?.sub) {
    const web = webUrl();
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const self = `${proto}://${host ?? request.nextUrl.host}`;
    return withSessionCookies(response, NextResponse.redirect(`${web}/login?next=${encodeURIComponent(`${self}${pathname}${search}`)}&from=panel`));
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${panel}${pathname === "/" ? "" : pathname}`;
  const rewritten = NextResponse.rewrite(url, { request: { headers: request.headers } });
  return withSessionCookies(response, rewritten);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)"],
};
