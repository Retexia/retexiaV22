import { isStaffRole } from "@retexia/supabase";
import { updateSession, withSessionCookies } from "@retexia/supabase/proxy";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Every admin request:
 * 1. refresh the Supabase session,
 * 2. signed out → /login?next=…,
 * 3. signed in but not staff → the "team only" page (no data),
 * 4. staff without MFA → /mfa/setup; staff with MFA but an aal1 session → /mfa/verify.
 * Server actions and the database check roles again.
 */
const PUBLIC = /^\/(login|forgot-password|auth|api\/n8n\/callback|robots\.txt)(\/|$)/;
const SIGNED_IN_ONLY = /^\/(no-access|reset-password)(\/|$)/;
const MFA = /^\/mfa(\/|$)/;

export async function proxy(request: NextRequest) {
  const { response, claims, supabase } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (PUBLIC.test(pathname)) return response;

  const redirectTo = (path: string, keepNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = keepNext && pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return withSessionCookies(response, NextResponse.redirect(url));
  };

  if (!claims?.sub || !supabase) return redirectTo("/login", true);
  if (SIGNED_IN_ONLY.test(pathname)) return response;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  if (!isStaffRole(profile?.role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/no-access";
    url.search = "";
    return withSessionCookies(response, NextResponse.rewrite(url, { status: 403 }));
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const current = aal?.currentLevel ?? "aal1";
  const next = aal?.nextLevel ?? "aal1";
  if (current !== "aal2") {
    if (MFA.test(pathname)) return response;
    return redirectTo(next === "aal2" ? "/mfa/verify" : "/mfa/setup", true);
  }
  if (MFA.test(pathname)) return redirectTo("/");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)"],
};
