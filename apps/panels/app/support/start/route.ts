import { cookieOptions } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { selfOrigin } from "@/lib/customer";
import { safePath } from "@/lib/handoff";
import { publicDb } from "@/lib/plan/db";
import { SECRET, SUPPORT_COOKIE, SUPPORT_ROLES, hashSecret, newSecret, supportAudit } from "@/lib/support";

export const dynamic = "force-dynamic";

/** How long after it was made a support link can be opened. */
const LINK_MINUTES = 10;

/**
 * Opens support mode in this browser: /support/start?token=…&next=/
 * The one-time link from admin.retexia.com works only for the team member who
 * made it (signed in here as themselves), once, within 10 minutes. It is
 * swapped for a fresh secret in an httpOnly cookie for every Retexia panel.
 */
export async function GET(request: NextRequest) {
  const origin = await selfOrigin();
  const fail = (why: string) => NextResponse.redirect(`${origin}/support/end?problem=${encodeURIComponent(why)}`);
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const next = safePath(request.nextUrl.searchParams.get("next"));
  if (!SECRET.test(token)) return fail("invalid");

  const { data: auth } = await (await createServerClient()).auth.getUser();
  if (!auth.user) return fail("signin");

  const db = publicDb();
  const { data: s } = await db.from("support_sessions").select("id, staff_id, customer_id, created_at, expires_at, claimed_at, ended_at").eq("link_hash", hashSecret(token)).maybeSingle();
  if (!s) return fail("invalid");
  if (s.staff_id !== auth.user.id) return fail("other");
  if (s.claimed_at) return fail("used");
  if (s.ended_at || new Date(s.expires_at).getTime() <= Date.now() || Date.now() - new Date(s.created_at).getTime() > LINK_MINUTES * 60_000) return fail("expired");
  const { data: staff } = await db.from("profiles").select("role, email").eq("id", auth.user.id).maybeSingle();
  if (!staff || !SUPPORT_ROLES.includes(staff.role)) return fail("role");

  // Claim once (a second click on the same link finds it claimed).
  const secret = newSecret();
  const { data: claimed } = await db.from("support_sessions").update({ claimed_at: new Date().toISOString(), cookie_hash: hashSecret(secret) }).eq("id", s.id).is("claimed_at", null).select("id");
  if (!claimed?.length) return fail("used");
  await supportAudit({ staffId: s.staff_id, customerId: s.customer_id }, "support.open", `Support mode opened on ${new URL(origin).host}`, staff.email);

  const res = NextResponse.redirect(`${origin}${next}`);
  res.cookies.set(SUPPORT_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: cookieOptions(request.headers.get("x-forwarded-host") ?? request.headers.get("host")).domain,
    expires: new Date(s.expires_at),
  });
  return res;
}
