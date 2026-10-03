import { safeNext } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import type { EmailOtpType } from "@retexia/supabase";
import { NextResponse, type NextRequest } from "next/server";

/** OAuth (Google) and PKCE email links land here with ?code=… */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"), "/");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const login = new URL("/login", origin);
  login.searchParams.set("error", "link");
  if (next !== "/account") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
