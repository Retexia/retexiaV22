import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { adminUrl } from "./env";

/**
 * "Add Facebook & Instagram" for a customer, from the admin (the same Meta app
 * as post.retexia.com → Connect). A staff member logs in to Facebook, then
 * picks which of their Pages belong to this customer (their Facebook account
 * may manage many customers' Pages, so nothing is saved without that choice).
 *
 * The code is exchanged here when META_APP_SECRET is set, otherwise by the
 * n8n Post worker (meta_connect with token_only), which keeps the secret.
 * The person's token only lives in a sealed, httpOnly cookie for 15 minutes.
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
function scopes() {
  const custom = process.env.META_SCOPES?.split(",").map((s) => s.trim()).filter(Boolean);
  const list = custom?.length ? custom : DEFAULT_SCOPES;
  return process.env.META_INSTAGRAM_DELETE?.trim() === "true" && !list.includes("instagram_manage_contents") ? [...list, "instagram_manage_contents"] : list;
}

const version = () => process.env.META_GRAPH_VERSION?.trim() || "v25.0";
const appId = () => process.env.META_APP_ID?.trim() || null;
const appSecret = () => process.env.META_APP_SECRET?.trim() || null;
const workerUrl = () => process.env.N8N_POST_URL?.trim() || null;
const graph = (path: string) => `https://graph.facebook.com/${version()}${path}`;

export const META_REDIRECT_PATH = "/meta/callback";
export const metaRedirectUri = () => `${adminUrl()}${META_REDIRECT_PATH}`;

/** What's missing before "Add Facebook & Instagram" can work, or null. */
export function metaSetupProblem(): string | null {
  if (!appId()) return "Set META_APP_ID in the admin app's environment (the same Meta app as post.retexia.com).";
  if (!appSecret() && !workerUrl()) return "Set META_APP_SECRET, or N8N_POST_URL and N8N_POST_KEY (the n8n Post worker), in the admin app's environment.";
  return null;
}

export function metaLoginUrl(state: string) {
  const q = new URLSearchParams({ client_id: appId()!, redirect_uri: metaRedirectUri(), state, scope: scopes().join(","), response_type: "code" });
  return `https://www.facebook.com/${version()}/dialog/oauth?${q}`;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function graphGet<T>(path: string, params: Record<string, string>): Promise<Result<T>> {
  try {
    const res = await fetch(`${graph(path)}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok || json.error) return { ok: false, error: (json.error?.message ?? `Facebook replied ${res.status}`).slice(0, 200) };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "Facebook didn't answer. Try again." };
  }
}

/** code → long-lived user token (60 days), here or through the n8n worker. */
export async function exchangeCode(code: string): Promise<Result<string>> {
  const secret = appSecret();
  if (secret) {
    const short = await graphGet<{ access_token: string }>("/oauth/access_token", { client_id: appId()!, client_secret: secret, redirect_uri: metaRedirectUri(), code });
    if (!short.ok) return short;
    const long = await graphGet<{ access_token: string }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId()!,
      client_secret: secret,
      fb_exchange_token: short.data.access_token,
    });
    return long.ok ? { ok: true, data: long.data.access_token } : long;
  }
  try {
    const res = await fetch(workerUrl()!, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.N8N_POST_KEY ? { "x-retexia-key": process.env.N8N_POST_KEY } : {}) },
      // business_id is required by the worker; with token_only nothing is saved for it.
      body: JSON.stringify({ action: "meta_connect", token_only: true, business_id: "00000000-0000-4000-8000-000000000000", code, redirect_uri: metaRedirectUri(), graph_version: version() }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; user_token?: string; error?: string } | null;
    if (!res.ok || !json) return { ok: false, error: `The Post worker replied ${res.status}. Import the latest n8n/retexia-post.json.` };
    if (!json.ok || !json.user_token) return { ok: false, error: String(json.error ?? "Facebook didn't complete the login. Import the latest n8n/retexia-post.json.").slice(0, 200) };
    return { ok: true, data: json.user_token };
  } catch {
    return { ok: false, error: "The Post worker didn't answer. Try again in a minute." };
  }
}

export type MetaPage = { id: string; name: string; access_token: string; instagram?: { id: string; username: string | null } };

/** The Pages this Facebook login manages, each with its (never-expiring) Page token and linked Instagram. */
export async function listPages(userToken: string): Promise<Result<MetaPage[]>> {
  const r = await graphGet<{ data?: { id: string; name: string; access_token?: string; instagram_business_account?: { id: string; username?: string } }[] }>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    limit: "100",
    access_token: userToken,
  });
  if (!r.ok) return r;
  return {
    ok: true,
    data: (r.data.data ?? [])
      .filter((p) => p.id && p.access_token)
      .map((p) => ({
        id: String(p.id),
        name: String(p.name || "Facebook Page"),
        access_token: p.access_token!,
        instagram: p.instagram_business_account ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username ?? null } : undefined,
      })),
  };
}

/** The Facebook person behind the login (kept on the accounts, used when they remove the app). */
export async function metaUserId(userToken: string) {
  const me = await graphGet<{ id: string }>("/me", { fields: "id", access_token: userToken });
  return me.ok ? me.data.id : null;
}

// ---------------------------------------------------------------------------
// Sealed cookies (AES-256-GCM, key derived from the server-only service key)
// ---------------------------------------------------------------------------

export const STATE_COOKIE = "rx_admin_meta_state";
export const LOGIN_COOKIE = "rx_admin_meta_login";
const MAX_AGE = 900;

function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createHash("sha256").update(`retexia-admin-meta:${secret}`).digest();
}

export function seal(value: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...value, exp: Date.now() + MAX_AGE * 1000 }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const data = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T & { exp?: number };
    return data.exp && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export const cookieOptions = () => ({ httpOnly: true, secure: adminUrl().startsWith("https"), sameSite: "lax" as const, path: "/", maxAge: MAX_AGE });

/** A finished Facebook login for one customer's business, by one staff member. */
export type MetaLogin = { token: string; business: string; staff: string; from: "customer" | "business" };

/** The login waiting for a Page choice, if it is this staff member's and for this business. */
export async function readLogin(staffId: string, businessId: string) {
  const login = unseal<MetaLogin>((await cookies()).get(LOGIN_COOKIE)?.value);
  return login && login.staff === staffId && login.business === businessId ? login : null;
}
