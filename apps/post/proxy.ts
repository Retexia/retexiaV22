import { updateSession, withSessionCookies } from "@retexia/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Retexia session (shared cookie on .retexia.com) and send
 * signed-out visitors to retexia.com/login, back here afterwards. Pages and
 * server actions check the Post subscription and business ownership again.
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  if (request.nextUrl.pathname === "/robots.txt") return response;
  if (!claims?.sub) {
    const web = (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
    const self = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/+$/, "");
    const next = `${self}${request.nextUrl.pathname}${request.nextUrl.search}`;
    return withSessionCookies(response, NextResponse.redirect(`${web}/login?next=${encodeURIComponent(next)}`));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)"],
};
