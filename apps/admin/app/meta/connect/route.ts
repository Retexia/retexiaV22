import { createAdminSchemaClient } from "@retexia/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { adminUrl } from "@/lib/env";
import { LOGIN_COOKIE, STATE_COOKIE, cookieOptions, metaLoginUrl, metaSetupProblem, seal } from "@/lib/meta";

/**
 * "Add Facebook & Instagram" for a customer's Post business: sends the staff
 * member to Meta's login with a one-time state, sealed in an httpOnly cookie
 * together with the business and who started it.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const business = z.uuid().safeParse(sp.get("business"));
  const from = sp.get("from") === "customer" ? "customer" : "business";
  const back = (q: string) => NextResponse.redirect(`${adminUrl()}${business.success ? `/products/post/businesses/${business.data}/connect?${q}` : "/products/post"}`);
  if (!business.success) return back("");

  let staffId: string;
  try {
    staffId = (await requireRole("manageCustomers")).user.id;
  } catch {
    return NextResponse.redirect(`${adminUrl()}/no-access`);
  }
  if (metaSetupProblem()) return back("meta=setup");
  const { data: b } = await createAdminSchemaClient("post").from("businesses").select("id").eq("id", business.data).maybeSingle();
  if (!b) return back("meta=gone");

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(metaLoginUrl(state));
  res.cookies.set(STATE_COOKIE, seal({ state, business: business.data, staff: staffId, from }), cookieOptions());
  res.cookies.delete(LOGIN_COOKIE);
  return res;
}
