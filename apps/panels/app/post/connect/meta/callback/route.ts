import { NextResponse, type NextRequest } from "next/server";
import { selfOrigin } from "@/lib/customer";
import { META_STATE_COOKIE, exchangeCode, metaConfig } from "@/lib/post/meta";
import { requireBusiness } from "@/lib/post/session";

/**
 * Meta sends the owner back here. The long-lived user token goes straight
 * into Vault; the owner then picks which Pages and Instagram accounts to use
 * (accounts page), and only those Pages' tokens are kept.
 */
export async function GET(request: NextRequest) {
  const origin = await selfOrigin();
  const back = (q: string) => {
    const res = NextResponse.redirect(`${origin}/accounts?${q}`);
    res.cookies.delete(META_STATE_COOKIE);
    return res;
  };
  if (!metaConfig()) return back("meta=unavailable");
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

  const r = await exchangeCode(code, `${origin}/connect/meta/callback`);
  if (!r.ok) return back(`meta=error&reason=${encodeURIComponent(r.error.message.slice(0, 120))}`);
  const { db, business } = ctx;
  const { data: secret, error } = await db.rpc("save_secret", { p_secret: null, p_value: r.data.token });
  if (error || !secret) return back("meta=error&reason=storage");
  const { data: row } = await db.from("meta_connections").insert({ business_id: business.id, meta_user_id: r.data.userId, token_secret_id: secret }).select("id").single();
  if (!row) return back("meta=error&reason=storage");
  return back(`connect=${row.id}`);
}
