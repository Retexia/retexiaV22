import { NextResponse, type NextRequest } from "next/server";
import { selfOrigin } from "@/lib/customer";
import { META_STATE_COOKIE, loginUrl, metaAppId } from "@/lib/post/meta";
import { canConnectMeta } from "@/lib/post/meta-connect";
import { requireBusiness } from "@/lib/post/session";

/**
 * "Connect Facebook & Instagram": sends the signed-in owner to Meta's dialog with a
 * one-time state, remembered in an httpOnly cookie together with their business.
 */
export async function GET(request: NextRequest) {
  const origin = await selfOrigin();
  if (!canConnectMeta()) return NextResponse.redirect(`${origin}/accounts?meta=unavailable`);
  let businessId: string;
  try {
    businessId = (await requireBusiness()).business.id;
  } catch {
    return NextResponse.redirect(`${origin}/`);
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(loginUrl(metaAppId()!, `${origin}/connect/meta/callback`, state));
  res.cookies.set(META_STATE_COOKIE, `${state}.${businessId}`, { httpOnly: true, secure: request.nextUrl.protocol === "https:" || origin.startsWith("https"), sameSite: "lax", path: "/", maxAge: 900 });
  return res;
}
