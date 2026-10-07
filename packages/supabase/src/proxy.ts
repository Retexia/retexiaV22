import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { JwtPayload, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "./cookies";

/** Raw Set-Cookie headers that remove host-only duplicates (see staleHostOnlyCookies). */
const extraHeaders = new WeakMap<NextResponse, string[]>();

/**
 * Auth cookies sent twice: an old host-only copy (from before the session
 * cookie moved to .retexia.com) next to the shared one. The browser sends the
 * old one first, so one app sees a stale login while another sees the new
 * one. Returns Set-Cookie headers that delete only the host-only copies.
 */
function staleHostOnlyCookies(request: NextRequest, domain: string | undefined): string[] {
  if (!domain) return [];
  const names = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.split("=")[0]!.trim())
    .filter((n) => n.startsWith("sb-"));
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const n of names) (seen.has(n) ? dupes : seen).add(n);
  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  return [...dupes].map((n) => `${n}=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
}
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

export type SessionResult = {
  response: NextResponse;
  claims: JwtPayload | null;
  supabase: SupabaseClient<Database> | null;
};

/**
 * Refreshes the Supabase session for the incoming request (call it from
 * proxy.ts). Returns the response carrying any refreshed cookies, plus the
 * verified JWT claims of the signed-in user (or null).
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  const { url, anonKey, configured } = supabaseEnv();
  if (!configured) return { response, claims: null, supabase: null };
  const options = cookieOptions(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));

  const supabase = createSsrServerClient<Database>(url, anonKey, {
    cookieOptions: options,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes
  // the session and must see the same cookies.
  const { data } = await supabase.auth.getClaims();
  const stale = staleHostOnlyCookies(request, options.domain);
  if (stale.length) {
    for (const h of stale) response.headers.append("set-cookie", h);
    extraHeaders.set(response, stale);
  }
  return { response, claims: data?.claims ?? null, supabase };
}

/** Copy refreshed auth cookies onto a redirect/rewrite response. */
export function withSessionCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  for (const h of extraHeaders.get(from) ?? []) to.headers.append("set-cookie", h);
  return to;
}
