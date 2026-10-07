import { updateSession, withSessionCookies } from "@retexia/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";
import { panelForHost } from "@/lib/panel";

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

  if (!claims?.sub) {
    const web = (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const self = `${proto}://${host ?? request.nextUrl.host}`;
    return withSessionCookies(response, NextResponse.redirect(`${web}/login?next=${encodeURIComponent(`${self}${pathname}${search}`)}`));
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${panel}${pathname === "/" ? "" : pathname}`;
  const rewritten = NextResponse.rewrite(url, { request: { headers: request.headers } });
  return withSessionCookies(response, rewritten);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)"],
};
