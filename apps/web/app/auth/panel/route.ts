import { createServerClient } from "@retexia/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Sign-in hand-off to a product panel (lingo.retexia.com, post.retexia.com…).
 *
 * The panel sends the visitor here with ?to=<panel url>&state=<nonce>. Signed
 * out: sign in first, then come back. Signed in: POST the access token to the
 * panel's /auth/handoff (the panel checks the nonce, verifies the token with
 * Supabase and starts its own session). This works even when the shared
 * .retexia.com cookie can't be read on the panel.
 */
const STATE = /^[0-9a-f-]{36}$/;

function panelTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const dev = process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1");
  if (dev) return url;
  const root = (process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim().replace(/^\./, "") || "retexia.com").toLowerCase();
  if (url.protocol !== "https:" || !host.endsWith(`.${root}`) || host === `www.${root}`) return null;
  return url;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(request: NextRequest) {
  const to = panelTarget(request.nextUrl.searchParams.get("to"));
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!to || !STATE.test(state)) return NextResponse.redirect(new URL("/account", request.nextUrl.origin));

  const supabase = await createServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    const back = `/auth/panel?to=${encodeURIComponent(to.toString())}&state=${state}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, request.nextUrl.origin));
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/auth/panel?to=${encodeURIComponent(to.toString())}&state=${state}`)}`, request.nextUrl.origin));

  const path = `${to.pathname}${to.search}` || "/";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Opening your panel…</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f4f7fc;color:#16264a}@media(prefers-color-scheme:dark){body{background:#0c1322;color:#e7ecf5}}button{font:inherit;padding:12px 24px;border-radius:999px;border:0;background:#2a68d9;color:#fff;cursor:pointer}</style></head>
<body><form id="f" method="post" action="${esc(to.origin)}/auth/handoff"><input type="hidden" name="access_token" value="${esc(token)}"><input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="to" value="${esc(path)}"><p>Opening your panel…</p><noscript><button type="submit">Continue</button></noscript></form>
<script>document.getElementById("f").submit()</script></body></html>`;
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "referrer-policy": "no-referrer",
      "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action ${to.origin}; base-uri 'none'; frame-ancestors 'none'`,
    },
  });
}
