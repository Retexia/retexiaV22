import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta Graph API for Retexia Post: "Continue with Facebook" (Pages and their
 * Instagram Business accounts) and publishing. Tokens are read from Vault on
 * the server only; nothing here reaches the browser.
 */

/** One-time state for "Continue with Facebook" (state.businessId). */
export const META_STATE_COOKIE = "rx_meta_state";

export const META_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "instagram_basic", "instagram_content_publish", "business_management"];

export function metaConfig() {
  const appId = process.env.META_APP_ID?.trim();
  const secret = process.env.META_APP_SECRET?.trim();
  if (!appId || !secret) return null;
  return { appId, secret, version: process.env.META_GRAPH_VERSION?.trim() || "v26.0" };
}

const graph = (path: string) => `https://graph.facebook.com/${metaConfig()?.version ?? "v26.0"}${path}`;

export type GraphError = { message: string; code?: number; subcode?: number; kind: "temporary" | "needs_user" | "content" };

/** How a Graph error should be handled (product spec: retry, ask the owner, or fix the content). */
export function classify(e: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean } | undefined, status = 0): GraphError {
  const code = e?.code;
  const subcode = e?.error_subcode;
  const message = (e?.message ?? `Meta replied ${status || "nothing"}`).slice(0, 500);
  // Expired or revoked token, missing permission, account changed.
  if (code === 190 || code === 102 || code === 10 || (code !== undefined && code >= 200 && code < 300) || subcode === 463 || subcode === 467 || subcode === 2207050) {
    return { message, code, subcode, kind: "needs_user" };
  }
  // Throttling, temporary errors, server errors, timeouts, media still processing.
  if (e?.is_transient || code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 341 || code === 368 || code === 613 || status === 0 || status >= 500 || subcode === 2207027) {
    return { message, code, subcode, kind: "temporary" };
  }
  return { message, code, subcode, kind: "content" };
}

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError };

export async function graphGet<T>(path: string, params: Record<string, string>): Promise<GraphResult<T>> {
  const url = `${graph(path)}?${new URLSearchParams(params)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as T & { error?: Parameters<typeof classify>[0] };
    if (!res.ok || json.error) return { ok: false, error: classify(json.error, res.status) };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: classify(undefined, 0) };
  }
}

export async function graphPost<T>(path: string, params: Record<string, string>): Promise<GraphResult<T>> {
  try {
    const res = await fetch(graph(path), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: Parameters<typeof classify>[0] };
    if (!res.ok || json.error) return { ok: false, error: classify(json.error, res.status) };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: classify(undefined, 0) };
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function loginUrl(redirectUri: string, state: string) {
  const cfg = metaConfig()!;
  const q = new URLSearchParams({ client_id: cfg.appId, redirect_uri: redirectUri, state, scope: META_SCOPES.join(","), response_type: "code" });
  return `https://www.facebook.com/${cfg.version}/dialog/oauth?${q}`;
}

/** Code → long-lived user token (about 60 days; Page tokens made from it don't expire). */
export async function exchangeCode(code: string, redirectUri: string): Promise<GraphResult<{ token: string; userId: string }>> {
  const cfg = metaConfig()!;
  const short = await graphGet<{ access_token: string }>("/oauth/access_token", { client_id: cfg.appId, client_secret: cfg.secret, redirect_uri: redirectUri, code });
  if (!short.ok) return short;
  const long = await graphGet<{ access_token: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: cfg.appId,
    client_secret: cfg.secret,
    fb_exchange_token: short.data.access_token,
  });
  const token = long.ok ? long.data.access_token : short.data.access_token;
  const me = await graphGet<{ id: string }>("/me", { fields: "id", access_token: token });
  if (!me.ok) return me;
  return { ok: true, data: { token, userId: me.data.id } };
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

/** The Pages this person manages, with their Instagram Business accounts. */
export async function listPages(userToken: string): Promise<GraphResult<MetaPage[]>> {
  const r = await graphGet<{ data: MetaPage[] }>("/me/accounts", {
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
    limit: "100",
    access_token: userToken,
  });
  return r.ok ? { ok: true, data: r.data.data ?? [] } : r;
}

// ---------------------------------------------------------------------------
// Meta callbacks (deauthorize, data deletion): signed_request
// ---------------------------------------------------------------------------

/** Verifies Meta's signed_request (HMAC-SHA256 with the app secret) and returns its payload. */
export function parseSignedRequest(signed: string | null | undefined): { user_id?: string; algorithm?: string } | null {
  const cfg = metaConfig();
  if (!cfg || !signed || !signed.includes(".")) return null;
  const [sig, payload] = signed.split(".", 2) as [string, string];
  const expected = createHmac("sha256", cfg.secret).update(payload).digest();
  const given = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string; algorithm?: string };
    return data.algorithm?.toUpperCase() === "HMAC-SHA256" ? data : null;
  } catch {
    return null;
  }
}
