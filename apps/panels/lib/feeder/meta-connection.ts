import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { getFeeder } from "./access";
import type { GatewayCall, GatewayReply } from "./autopublish/gateway";
import { metaAllowed } from "./meta-allow";
import { feederDb } from "./db";

/**
 * A seller's own Meta Business portfolio (migration 0048).
 *
 * When a seller connected their portfolio (ID + System User token, kept in Vault),
 * every Facebook call made for them goes straight to the Graph API with THEIR token,
 * from this server only, and only the calls the n8n gateway would allow. Sellers who
 * share with Retexia's business instead (the older way) still go through n8n.
 *
 * Whose call it is: the seller set with asSeller() (the clocks: Autopublish, Auto
 * comment), else the signed-in seller (server actions).
 */
export const GRAPH =
  // Local tests only (a fake Graph API); production always talks to Facebook.
  process.env.NODE_ENV !== "production" && process.env.META_GRAPH_TEST_URL ? process.env.META_GRAPH_TEST_URL : "https://graph.facebook.com/v26.0";

const als = new AsyncLocalStorage<{ userId: string }>();
/** Runs fn as this seller: their Facebook calls use their own token (when they connected one). */
export const asSeller = <T,>(userId: string, fn: () => Promise<T>) => als.run({ userId }, fn);

async function currentSeller(): Promise<string | null> {
  const s = als.getStore();
  if (s) return s.userId;
  try {
    return (await getFeeder())?.user.id ?? null;
  } catch {
    return null; // no request (a clock without asSeller)
  }
}

// --- the token (Vault), cached briefly per server instance --------------------------
type Conn = { business_id: string; token: string };
const cache = new Map<string, { at: number; conn: Conn | null }>();
export async function sellerToken(userId: string): Promise<Conn | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.conn;
  const { data, error } = await feederDb().rpc("meta_token", { p_user: userId });
  const row = !error && Array.isArray(data) ? (data[0] as Conn | undefined) : undefined;
  const conn = row?.token ? { business_id: row.business_id, token: row.token } : null;
  cache.set(userId, { at: Date.now(), conn });
  return conn;
}
export const forgetToken = (userId: string) => cache.delete(userId);

/** True when this seller's Facebook calls can go out (own token, or Retexia's gateway). */
export async function metaReachable(userId: string, gatewayReady: boolean) {
  return gatewayReady || Boolean(await sellerToken(userId));
}

// --- one Graph call ------------------------------------------------------------------
const enc = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v));
const flat = (p?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, enc(v)]));

export async function graph(token: string, method: "GET" | "POST", path: string, params?: Record<string, unknown>, timeoutMs = 60_000, keepToken = false): Promise<GatewayReply> {
  const url = new URL(`${GRAPH}/${path.replace(/^\/+/, "")}`);
  const fields = { ...flat(params), access_token: token };
  const init: RequestInit = { method, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) };
  if (method === "GET") for (const [k, v] of Object.entries(fields)) url.searchParams.set(k, v);
  else {
    init.headers = { "content-type": "application/x-www-form-urlencoded" };
    init.body = new URLSearchParams(fields).toString();
  }
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    // Tokens never travel further (only the Page-token lookup below keeps it, server-side).
    if (body && typeof body === "object" && !keepToken) delete (body as Record<string, unknown>).access_token;
    const usage: Record<string, string> = {};
    for (const k of ["x-business-use-case-usage", "x-ad-account-usage", "x-app-usage"]) {
      const v = res.headers.get(k);
      if (v) usage[k] = v;
    }
    const ok = res.ok && !(body && typeof body === "object" && "error" in body);
    return { ok, status: res.status, body, usage };
  } catch (e) {
    return { ok: false, status: 0, network: true, body: { error: { message: e instanceof Error && e.name === "TimeoutError" ? "Facebook timeout" : "Facebook network error" } } };
  }
}

const pageTokens = new Map<string, { at: number; token: string }>();

/**
 * The seller's own-token path for a Meta call, or null when the call should go through
 * Retexia's n8n gateway (no seller connection, or not a Meta call).
 */
export async function metaDirect(call: GatewayCall): Promise<GatewayReply | null> {
  if (call.action !== "meta" && call.action !== "meta_page" && call.action !== "meta_image") return null;
  const userId = await currentSeller();
  if (!userId) return null;
  const conn = await sellerToken(userId);
  if (!conn) return null;
  const refused = metaAllowed(call);
  if (refused) return { ok: false, status: 400, body: { error: { message: `Retexia refused: ${refused}` } } };

  if (call.action === "meta") return graph(conn.token, call.method, call.path, call.params, 120_000);

  if (call.action === "meta_image") {
    try {
      const file = await fetch(call.image_url, { signal: AbortSignal.timeout(60_000) });
      if (!file.ok) throw new Error("download");
      const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
      return graph(conn.token, "POST", `${call.account}/adimages`, { bytes }, 120_000);
    } catch {
      return { ok: false, status: 400, body: { error: { message: "Could not download the image from Retexia storage (link expired?). Retry." } } };
    }
  }

  // A Page call: with the Page's own token (from the seller's System User), cached for 30 minutes.
  const key = `${userId}:${call.page_id}`;
  let pt = pageTokens.get(key);
  if (!pt || Date.now() - pt.at > 30 * 60_000) {
    const r = await graph(conn.token, "GET", call.page_id!, { fields: "access_token" }, 30_000, true);
    const token = r.ok ? String((r.body as { access_token?: string } | null)?.access_token ?? "") : "";
    if (!token) {
      if (r.network) return r;
      const err = (r.body as { error?: { code?: number; message?: string } } | null)?.error;
      return { ok: false, status: r.status || 403, body: { error: { code: err?.code ?? 10, message: err?.message ?? "Your token can't open this Page. Give your System User access to the Page (with the needed tasks) and generate the token again." } } };
    }
    pt = { at: Date.now(), token };
    pageTokens.set(key, pt);
  }
  return graph(pt.token, call.method, call.path, call.params, 120_000);
}
