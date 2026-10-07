import { createServerClient } from "@retexia/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, TRIES_COOKIE, projectRef, safePath, tokenIssuer } from "@/lib/handoff";

/**
 * Receives the sign-in from retexia.com/auth/panel (form POST): checks the
 * nonce, verifies the access token with Supabase, then starts this panel's own
 * session (a one-time sign-in link made and used on the server; no email is sent).
 */
export async function POST(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const self = `${proto}://${host}`;
  const problem = (reason: string, extra = "") => NextResponse.redirect(`${self}/auth/problem?reason=${reason}${extra}`, 303);

  const form = await request.formData().catch(() => null);
  const token = String(form?.get("access_token") ?? "");
  const state = String(form?.get("state") ?? "");
  const to = safePath(String(form?.get("to") ?? "/"));
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!token || !state || !expected || state !== expected) return problem("state");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // The website and this panel must use the same Supabase project.
  const site = projectRef(tokenIssuer(token));
  const panel = projectRef(url);
  if (site && panel && site !== panel) return problem("project", `&site=${encodeURIComponent(site)}&panel=${encodeURIComponent(panel)}`);
  if (!url || !anon || !service) return problem("config");

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: who, error: userError } = await admin.auth.getUser(token);
  if (userError || !who.user?.email) return problem("token");
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: who.user.email });
  const hash = link?.properties?.hashed_token;
  if (linkError || !hash) return problem(linkError?.message?.toLowerCase().includes("api key") ? "config" : "token");

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  if (error) return problem("token");

  const res = NextResponse.redirect(`${self}${to}`, 303);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(TRIES_COOKIE);
  return res;
}
