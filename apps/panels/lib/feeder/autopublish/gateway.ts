import "server-only";

import { feederDb } from "../db";
import { metaDirect } from "../meta-connection";

/**
 * The n8n workflow "Retexia — Feeder Autopublish" (n8n/feeder-autopublish.json)
 * makes the outside calls. It holds no credentials: the keys live in Vault
 * (admin → Settings → Integrations) and each call carries the one it needs.
 * The panel sends it one small call at a time:
 *
 *   meta        Graph API call (allowed paths only): { method, path, params }
 *   meta_page   the same with the Page's token: Instant Forms ({page_id}/leadgen_forms)
 *   meta_image  n8n downloads image_url and uploads it to act_{id}/adimages
 *   tiktok      TikTok Business API v1.3 call (allowed paths only)
 *   whatsapp    one WhatsApp text through Evolution
 *   ai          one OpenAI call with a strict JSON answer (Auto comment); the key stays in n8n
 *
 * Env: FEEDER_ADS_N8N_URL (the webhook); FEEDER_ADS_N8N_KEY optional (header X-Retexia-Key).
 * The workflow has no credentials: each call carries the one key it needs (admin → Integrations).
 * The reply always has the platform's status and body; it never throws.
 */
export type GatewayCall =
  | { action: "meta"; method: "GET" | "POST"; path: string; params?: Record<string, unknown> }
  | { action: "meta_page"; method: "GET" | "POST"; page_id: string; path: string; params?: Record<string, unknown> }
  | { action: "meta_image"; account: string; image_url: string }
  | { action: "tiktok"; method: "GET" | "POST"; path: string; params?: Record<string, unknown> }
  | { action: "whatsapp"; to: string; text: string }
  | { action: "ai"; model: "gpt-5.4-mini" | "gpt-5.4-nano"; name: string; messages: { role: "system" | "user"; content: string }[]; schema: Record<string, unknown>; max_tokens?: number };

export type GatewayReply = {
  ok: boolean;
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  /** Meta rate-limit headers (x-business-use-case-usage, x-ad-account-usage), when sent. */
  usage?: Record<string, string>;
  /** The call never reached the platform (n8n down, timeout, not set up). */
  network?: boolean;
};

const url = () => process.env.FEEDER_ADS_N8N_URL?.trim() || "";
/** Only the webhook URL is needed; FEEDER_ADS_N8N_KEY is optional (sent as X-Retexia-Key when the webhook uses Header Auth). */
export const gatewayReady = () => Boolean(url());

// The keys the workflow needs (admin → Settings → Integrations, Vault), cached briefly.
type Keys = Partial<Record<"openai" | "meta" | "tiktok" | "evolution_url" | "evolution_instance" | "evolution_key", string>>;
let keyCache: { at: number; keys: Keys } | null = null;
async function gatewayKeys(): Promise<Keys> {
  if (keyCache && Date.now() - keyCache.at < 60_000) return keyCache.keys;
  const { data } = await feederDb().rpc("gateway_keys");
  keyCache = { at: Date.now(), keys: (data ?? {}) as Keys };
  return keyCache.keys;
}

/** Only the key this call needs travels with it; n8n stores none. */
async function authFor(call: GatewayCall): Promise<Record<string, string> | null> {
  const k = await gatewayKeys();
  switch (call.action) {
    case "meta":
    case "meta_page":
    case "meta_image":
      return k.meta ? { meta: k.meta } : null;
    case "tiktok":
      return k.tiktok ? { tiktok: k.tiktok } : null;
    case "ai":
      return k.openai ? { openai: k.openai } : null;
    case "whatsapp":
      return k.evolution_url && k.evolution_key ? { evolution_url: k.evolution_url, evolution_instance: k.evolution_instance ?? "", evolution_key: k.evolution_key } : null;
  }
}

const MISSING: Record<string, string> = {
  meta: "Retexia's Meta token isn't set (admin → Settings → Integrations)",
  meta_page: "Retexia's Meta token isn't set (admin → Settings → Integrations)",
  meta_image: "Retexia's Meta token isn't set (admin → Settings → Integrations)",
  tiktok: "The TikTok token isn't set (admin → Settings → Integrations)",
  ai: "The OpenAI key isn't set (admin → Settings → Integrations)",
  whatsapp: "Evolution (WhatsApp) isn't set (admin → Settings → Integrations)",
};

export async function gateway(call: GatewayCall, timeoutMs = 90_000): Promise<GatewayReply> {
  // A seller who connected their own Business portfolio: Facebook calls go straight out with their token.
  const direct = await metaDirect(call);
  if (direct) return direct;
  if (!gatewayReady()) return { ok: false, status: 0, network: true, body: { error: { message: "gateway not connected: FEEDER_ADS_N8N_URL is not set" } } };
  const auth = await authFor(call).catch(() => null);
  if (!auth) return { ok: false, status: 400, body: { error: { message: MISSING[call.action] ?? "A key is missing" } } };
  try {
    const key = process.env.FEEDER_ADS_N8N_KEY?.trim();
    const res = await fetch(url(), {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "x-retexia-key": key } : {}) },
      body: JSON.stringify({ ...call, auth }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const text = await res.text();
    let json: GatewayReply | null = null;
    try {
      json = text ? (JSON.parse(text) as GatewayReply) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json || typeof json !== "object" || !("status" in json)) {
      const refused = res.status === 400 && json && typeof json === "object" && "refused" in json;
      return {
        ok: false,
        status: res.status,
        network: !refused,
        body: { error: { message: refused ? `gateway refused: ${String((json as { refused?: unknown }).refused)}` : `gateway replied ${res.status}${res.status === 403 ? " (check FEEDER_ADS_N8N_KEY)" : ""}` } },
      };
    }
    return { ok: Boolean(json.ok), status: Number(json.status) || 0, body: json.body ?? null, usage: json.usage };
  } catch (e) {
    return { ok: false, status: 0, network: true, body: { error: { message: e instanceof Error && e.name === "TimeoutError" ? "gateway timeout" : "gateway network error" } } };
  }
}

/** TikTok replies carry the data under "data" (code 0 = ok). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ttData = (r: GatewayReply): any => (r.body && typeof r.body === "object" ? (r.body.data ?? null) : null);
