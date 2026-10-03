import { safeNext } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import type { EmailOtpType } from "@retexia/supabase";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Email links (sign-up confirmation, magic link, password recovery, email
 * change). Email templates point here with token_hash + type, e.g.
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 * PKCE links with ?code= are accepted too.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  let next = safeNext(searchParams.get("next"));
  if (type === "recovery") next = "/reset-password";

  const supabase = await createServerClient();
  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    const target = new URL(next, origin);
    if (type === "email_change") target.searchParams.set("email_changed", "1");
    return NextResponse.redirect(target);
  }
  const login = new URL("/login", origin);
  login.searchParams.set("error", "link");
  return NextResponse.redirect(login);
}
