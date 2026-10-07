import { NextResponse, type NextRequest } from "next/server";
import { webUrl } from "@/lib/env";
import { MAX_TRIES, STATE_COOKIE, TRIES_COOKIE, safePath } from "@/lib/handoff";

/** Start the sign-in hand-off: remember a nonce, then ask retexia.com who is signed in. */
export async function GET(request: NextRequest) {
  const next = safePath(request.nextUrl.searchParams.get("next"));
  const tries = Number(request.cookies.get(TRIES_COOKIE)?.value ?? 0) || 0;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const self = `${proto}://${host}`;

  // Came back here several times in a row: stop and explain instead of looping.
  if (tries >= MAX_TRIES) {
    const res = NextResponse.redirect(`${self}/auth/problem?reason=loop`);
    res.cookies.delete(TRIES_COOKIE);
    return res;
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(`${webUrl()}/auth/panel?to=${encodeURIComponent(`${self}${next}`)}&state=${state}`);
  const secure = proto === "https";
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
  // Old host-only session cookies (from before the .retexia.com cookie) would hide the shared one.
  for (const c of request.cookies.getAll()) {
    if (secure && c.name.startsWith("sb-")) res.headers.append("set-cookie", `${c.name}=; Path=/; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`);
  }
  res.cookies.set(TRIES_COOKIE, String(tries + 1), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 120 });
  return res;
}
