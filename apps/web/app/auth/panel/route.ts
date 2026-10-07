import { createServerClient } from "@retexia/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { RESUME_COOKIE, RESUME_MAX_AGE, STATE, handoffPath, panelTarget, resumeValue } from "@/lib/panel-handoff";

/**
 * Sign-in hand-off to a product panel (lingo.retexia.com, post.retexia.com…).
 *
 * The panel sends the visitor here with ?to=<panel url>&state=<nonce>. Signed
 * out: sign in first (a cookie remembers the hand-off, see lib/panel-handoff),
 * then come back. Signed in: POST the access token to the panel's
 * /auth/handoff (the panel checks the nonce, verifies the token with Supabase
 * and starts its own session).
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const page = (title: string, body: string, status = 200, csp = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'") =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f4f7fc;color:#16264a;padding:16px;text-align:center}@media(prefers-color-scheme:dark){body{background:#0c1322;color:#e7ecf5}}main{max-width:440px}a,button{display:inline-block;font:inherit;padding:12px 24px;border-radius:999px;border:0;background:#2a68d9;color:#fff;cursor:pointer;text-decoration:none}p{line-height:1.6}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0", "referrer-policy": "no-referrer", "content-security-policy": csp } },
  );

export async function GET(request: NextRequest) {
  const to = panelTarget(request.nextUrl.searchParams.get("to"));
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!to || !STATE.test(state)) {
    return page(
      "Can't open the panel",
      `<h1>We couldn't open your panel</h1><p>The link was incomplete. Open the panel again from its address, for example lingo.retexia.com.</p><p><a href="/account">My account</a></p>`,
      400,
    );
  }

  const supabase = await createServerClient();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);
  const token = sessionData.session?.access_token;
  if (!userData.user || !token) {
    // Remember the hand-off: whatever route sign-in takes, /account resumes it.
    const res = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(handoffPath(to, state))}&from=panel`, request.nextUrl.origin));
    res.cookies.set(RESUME_COOKIE, resumeValue(to, state), { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: RESUME_MAX_AGE });
    return res;
  }

  const path = `${to.pathname}${to.search}` || "/";
  const res = page(
    "Opening your panel…",
    `<form id="f" method="post" action="${esc(to.origin)}/auth/handoff"><input type="hidden" name="access_token" value="${esc(token)}"><input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="to" value="${esc(path)}"><p>Opening your panel…</p><button type="submit">Continue</button></form>
<script>document.getElementById("f").submit()</script>`,
    200,
    `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action ${to.origin}; base-uri 'none'; frame-ancestors 'none'`,
  );
  res.cookies.delete(RESUME_COOKIE);
  return res;
}
