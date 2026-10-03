import { safeNext, type EmailOtpType } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Email links for the team: invite (→ choose a password), magic link,
 * password recovery. Templates link here with token_hash + type.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  let next = safeNext(searchParams.get("next"), "/");
  if (type === "recovery") next = "/reset-password";
  if (type === "invite") next = "/reset-password?invited=1";

  const supabase = await createServerClient();
  let ok = false;
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", origin));
}
