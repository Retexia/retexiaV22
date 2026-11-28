import "server-only";

/**
 * The n8n workflow "Retexia — Feeder Autopublish" (n8n/feeder-autopublish.json)
 * is the only place that holds the Meta System User token, the TikTok token and
 * the Evolution (WhatsApp) key. The panel sends it one small call at a time:
 *
 *   meta        Graph API call (allowed paths only): { method, path, params }
 *   meta_page   the same with the Page's token: Instant Forms ({page_id}/leadgen_forms)
 *   meta_image  n8n downloads image_url and uploads it to act_{id}/adimages
 *   tiktok      TikTok Business API v1.3 call (allowed paths only)
 *   whatsapp    one WhatsApp text through Evolution
 *   ai          one OpenAI call with a strict JSON answer (Auto comment); the key stays in n8n
 *
 * Env: FEEDER_ADS_N8N_URL (the webhook) and FEEDER_ADS_N8N_KEY (header X-Retexia-Key,
 * the value of the n8n Header Auth credential on that webhook).
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
export const gatewayReady = () => Boolean(url() && process.env.FEEDER_ADS_N8N_KEY?.trim());

export async function gateway(call: GatewayCall, timeoutMs = 90_000): Promise<GatewayReply> {
  if (!gatewayReady()) return { ok: false, status: 0, network: true, body: { error: { message: "gateway not connected: FEEDER_ADS_N8N_URL / FEEDER_ADS_N8N_KEY are not set" } } };
  try {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-retexia-key": process.env.FEEDER_ADS_N8N_KEY!.trim() },
      body: JSON.stringify(call),
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
