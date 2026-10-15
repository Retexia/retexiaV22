import { NextResponse, type NextRequest } from "next/server";
import { selfOrigin } from "@/lib/customer";
import { META_STATE_COOKIE } from "@/lib/post/meta";
import { canConnectMeta, connectWithCode } from "@/lib/post/meta-connect";
import { requireBusiness } from "@/lib/post/session";

/**
 * Meta sends the owner back here with ?code. The state must match the one-time
 * cookie and the business must be the signed-in owner's (so nobody can attach
 * Pages to someone else's business). Then the code is exchanged (here, or by the
 * n8n worker), every granted Page is saved with post.admin_connect_page(), and
 * the owner lands on the Accounts page with ?connected=true.
 */
export async function GET(request: NextRequest) {
  const origin = await selfOrigin();
  const back = (q: string) => {
    const res = NextResponse.redirect(`${origin}/accounts?${q}`);
    res.cookies.delete(META_STATE_COOKIE);
    return res;
  };
  if (!canConnectMeta()) return back("meta=unavailable");
  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back("meta=cancelled");
  const [state, businessId] = (request.cookies.get(META_STATE_COOKIE)?.value ?? "").split(".");
  const code = sp.get("code");
  if (!code || !state || state !== sp.get("state")) return back("meta=expired");

  let ctx;
  try {
    ctx = await requireBusiness();
  } catch {
    return NextResponse.redirect(`${origin}/`);
  }
  if (ctx.business.id !== businessId) return back("meta=expired");

  const r = await connectWithCode(ctx.db, ctx.business.id, code, `${origin}/connect/meta/callback`);
  if (!r.ok) return back(`meta=error&reason=${encodeURIComponent(r.error.slice(0, 120))}`);
  if (!r.pages.length) return back("meta=nopages");
  await ctx.db.from("events").insert({
    business_id: ctx.business.id,
    type: "accounts_connected",
    payload: { pages: r.pages.map((p) => ({ page: p.fb_page_name, instagram: p.ig_username })), turned_off: r.turnedOff },
  });
  return back(`connected=true&pages=${r.pages.length}${r.turnedOff ? `&off=${r.turnedOff}` : ""}`);
}
