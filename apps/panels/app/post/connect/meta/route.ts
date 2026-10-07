import { NextResponse, type NextRequest } from "next/server";
import { selfOrigin } from "@/lib/customer";
import { META_STATE_COOKIE, loginUrl, metaConfig } from "@/lib/post/meta";
import { requireBusiness } from "@/lib/post/session";

/** "Continue with Facebook": send the owner to Meta's login with a one-time state. */
export async function GET(request: NextRequest) {
  const origin = await selfOrigin();
  if (!metaConfig()) return NextResponse.redirect(`${origin}/accounts?meta=unavailable`);
  let businessId: string;
  try {
    businessId = (await requireBusiness()).business.id;
  } catch {
    return NextResponse.redirect(`${origin}/`);
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(loginUrl(`${origin}/connect/meta/callback`, state));
  res.cookies.set(META_STATE_COOKIE, `${state}.${businessId}`, { httpOnly: true, secure: request.nextUrl.protocol === "https:" || origin.startsWith("https"), sameSite: "lax", path: "/", maxAge: 900 });
  return res;
}
