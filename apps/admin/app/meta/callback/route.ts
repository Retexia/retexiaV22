import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { adminUrl } from "@/lib/env";
import { LOGIN_COOKIE, STATE_COOKIE, cookieOptions, exchangeCode, seal, unseal, type MetaLogin } from "@/lib/meta";

/**
 * Meta sends the staff member back here with ?code. The state must match the
 * sealed cookie, made by the same signed-in staff member. The code becomes a
 * login (sealed cookie, 15 minutes); nothing is saved until they pick the
 * customer's Page(s) on the business's Connect page.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const started = unseal<{ state: string; business: string; staff: string; from: MetaLogin["from"] }>(request.cookies.get(STATE_COOKIE)?.value);
  const to = (q: string) => {
    const res = NextResponse.redirect(`${adminUrl()}${started ? `/products/post/businesses/${started.business}/connect?${q}` : "/products/post"}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  if (!started) return to("");
  if (sp.get("error")) return to("meta=cancelled");
  const code = sp.get("code");
  if (!code || sp.get("state") !== started.state) return to("meta=expired");

  let staffId: string;
  try {
    staffId = (await requireRole("manageCustomers")).user.id;
  } catch {
    return NextResponse.redirect(`${adminUrl()}/no-access`);
  }
  if (staffId !== started.staff) return to("meta=expired");

  const token = await exchangeCode(code);
  if (!token.ok) return to(`meta=error&reason=${encodeURIComponent(token.error.slice(0, 120))}`);
  const res = to("meta=pick");
  res.cookies.set(LOGIN_COOKIE, seal({ token: token.data, business: started.business, staff: staffId, from: started.from } satisfies MetaLogin), cookieOptions());
  return res;
}
