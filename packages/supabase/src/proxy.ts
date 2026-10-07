import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { JwtPayload, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "./cookies";
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

  const supabase = createSsrServerClient<Database>(url, anonKey, {
    cookieOptions: cookieOptions(request.headers.get("x-forwarded-host") ?? request.headers.get("host")),
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
  return { response, claims: data?.claims ?? null, supabase };
}

/** Copy refreshed auth cookies onto a redirect/rewrite response. */
export function withSessionCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}
