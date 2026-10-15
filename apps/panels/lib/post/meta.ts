import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta Graph API for Retexia Post: "Continue with Facebook" (Pages and their
 * Instagram Business accounts) and publishing. Tokens are read from Vault on
 * the server only; nothing here reaches the browser.
 */

/** One-time state for "Connect Facebook & Instagram" (state.businessId). */
export const META_STATE_COOKIE = "rx_meta_state";

/**
 * Permissions asked in the Meta dialog (META_SCOPES overrides them, comma-separated).
 * Ask only for permissions added to the Meta app: Meta's dialog fails ("Invalid Scopes")
 * otherwise. Posting needs pages_* , instagram_basic and instagram_content_publish;
 * instagram_manage_contents (deleting Instagram posts from the panel) is added with
 * META_INSTAGRAM_DELETE=true. Customers without a role on the app can only grant
 * permissions Meta approved in App Review.
 */
const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "business_management",
];
export function metaScopes() {
  const custom = process.env.META_SCOPES?.split(",").map((s) => s.trim()).filter(Boolean);
  const scopes = custom?.length ? custom : DEFAULT_SCOPES;
  return process.env.META_INSTAGRAM_DELETE?.trim() === "true" && !scopes.includes("instagram_manage_contents") ? [...scopes, "instagram_manage_contents"] : scopes;
}

/** Graph API version for login and calls (META_GRAPH_VERSION, default v25.0). */
export const metaVersion = () => process.env.META_GRAPH_VERSION?.trim() || "v25.0";

/** Meta app id: enough to send customers to the Meta dialog. */
export const metaAppId = () => process.env.META_APP_ID?.trim() || null;

/** App id + secret: only when this app exchanges codes itself (otherwise the n8n worker does, with the secret kept there). */
export function metaConfig() {
  const appId = metaAppId();
  const secret = process.env.META_APP_SECRET?.trim();
  if (!appId || !secret) return null;
  return { appId, secret, version: metaVersion() };
}

const graph = (path: string) => `https://graph.facebook.com/${metaVersion()}${path}`;

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

export async function graphDelete(path: string, token: string): Promise<GraphResult<{ success?: boolean }>> {
  try {
    const res = await fetch(`${graph(path)}?${new URLSearchParams({ access_token: token })}`, { method: "DELETE", signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: Parameters<typeof classify>[0] };
    if (!res.ok || json.error) return { ok: false, error: classify(json.error, res.status) };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: classify(undefined, 0) };
  }
}

/**
 * Deletes a published Facebook Page post/story or Instagram post/story (the id saved when it was published).
 * Already deleted on Facebook/Instagram (code 100, subcode 33: the object no longer exists) counts as done.
 */
export async function deletePublished(externalId: string, token: string): Promise<GraphResult<{ success?: boolean }>> {
  const r = await graphDelete(`/${externalId}`, token);
  if (!r.ok && r.error.code === 100 && r.error.subcode === 33) return { ok: true, data: { success: true } };
  return r;
}

/** Changes a published Facebook Page post's text (only posts this app made; Instagram captions can't be changed by apps). */
export const updateFacebookText = (postId: string, message: string, token: string) => graphPost<{ success?: boolean }>(`/${postId}`, { message, access_token: token });

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function loginUrl(appId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, scope: metaScopes().join(","), response_type: "code" });
  return `https://www.facebook.com/${metaVersion()}/dialog/oauth?${q}`;
}

/**
 * Step 1 and 2: code → short-lived user token → long-lived user token (60 days).
 * Page tokens read with the long-lived token don't expire. Also returns the
 * person's Meta id (used when they remove the app from Facebook).
 */
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
  if (!long.ok) return long;
  const me = await graphGet<{ id: string }>("/me", { fields: "id", access_token: long.data.access_token });
  return { ok: true, data: { token: long.data.access_token, userId: me.ok ? me.data.id : "" } };
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

/** Step 3: the Pages this person granted, each with its never-expiring Page token and linked Instagram. */
export async function listPages(userToken: string): Promise<GraphResult<MetaPage[]>> {
  const r = await graphGet<{ data: MetaPage[] }>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
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
