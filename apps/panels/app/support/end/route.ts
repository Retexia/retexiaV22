import { cookieOptions } from "@retexia/supabase";
import { NextResponse, type NextRequest } from "next/server";
import { adminUrl } from "@/lib/env";
import { publicDb } from "@/lib/plan/db";
import { SECRET, SUPPORT_COOKIE, hashSecret, supportAudit } from "@/lib/support";

export const dynamic = "force-dynamic";

/** Why support mode couldn't start (admin shows the matching text). */
const PROBLEMS = new Set(["invalid", "signin", "other", "used", "expired", "role"]);

/**
 * Ends support mode in this browser (or shows why it couldn't start) and goes
 * back to the customer in admin.retexia.com.
 */
export async function GET(request: NextRequest) {
  const secret = request.cookies.get(SUPPORT_COOKIE)?.value;
  let customerId: string | null = null;
  if (secret && SECRET.test(secret)) {
    const db = publicDb();
    const { data: s } = await db.from("support_sessions").select("id, staff_id, customer_id, ended_at").eq("cookie_hash", hashSecret(secret)).maybeSingle();
    if (s) {
      customerId = s.customer_id;
      if (!s.ended_at) {
        await db.from("support_sessions").update({ ended_at: new Date().toISOString() }).eq("id", s.id);
        await supportAudit({ staffId: s.staff_id, customerId: s.customer_id }, "support.end", "Support mode ended");
      }
    }
  }
  const code = request.nextUrl.searchParams.get("problem") ?? "";
  const problem = PROBLEMS.has(code) ? code : null;
  const back = new URL(customerId ? `${adminUrl()}/customers/${customerId}` : `${adminUrl()}/customers`);
  if (problem) back.searchParams.set("support_problem", problem);
  const res = NextResponse.redirect(back);
  res.cookies.set(SUPPORT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: cookieOptions(request.headers.get("x-forwarded-host") ?? request.headers.get("host")).domain,
    maxAge: 0,
  });
  return res;
}
