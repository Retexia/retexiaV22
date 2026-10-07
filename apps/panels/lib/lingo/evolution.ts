import "server-only";

/**
 * Evolution API (the WhatsApp gateway the Lingo n8n bot uses).
 *
 * Retexia's own Evolution server creates one instance per business. Every
 * instance sends incoming messages (MESSAGES_UPSERT) to the n8n Lingo
 * workflow's production webhook, which finds the business by instance name.
 * Works with Evolution API v2 and falls back to v1 request shapes.
 */

export type EvolutionConfig = { url: string; key: string; webhook: string | null };
export type WaState = "open" | "connecting" | "close" | "unknown";

/** Retexia's Evolution server; null when the panel can't create instances itself. */
export function evolutionConfig(): EvolutionConfig | null {
  const url = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.EVOLUTION_API_KEY?.trim();
  if (!url || !key) return null;
  return { url, key, webhook: lingoWebhookUrl() };
}

/** n8n "Lingo · WhatsApp AI Bot" production webhook (…/webhook/Lingo). */
export function lingoWebhookUrl(): string | null {
  return process.env.LINGO_N8N_WEBHOOK_URL?.trim() || null;
}

type Json = Record<string, unknown>;

async function call(base: string, apikey: string, path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
      method: init.method ?? "GET",
      headers: { apikey, ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: {} as Json };
  }
}

const message = (json: Json) => {
  const r = json.response as { message?: unknown } | undefined;
  const m = r?.message ?? json.message ?? json.error;
  return Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : null;
};

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT"];

/** Create an instance with the n8n webhook already set. Returns its own API key. */
export async function createInstance(cfg: EvolutionConfig, instanceName: string): Promise<{ ok: true; apikey: string } | { ok: false; error: string }> {
  const body: Json = { instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" };
  if (cfg.webhook) body.webhook = { url: cfg.webhook, byEvents: false, base64: false, events: WEBHOOK_EVENTS };
  const r = await call(cfg.url, cfg.key, "/instance/create", { method: "POST", body });
  if (!r.ok) return { ok: false, error: message(r.json) ?? `WhatsApp server replied ${r.status || "nothing"}` };
  const hash = r.json.hash as string | { apikey?: string } | undefined;
  const apikey = (typeof hash === "string" ? hash : hash?.apikey) || cfg.key;
  if (cfg.webhook) await setWebhook(cfg.url, instanceName, apikey, cfg.webhook);
  return { ok: true, apikey };
}

/** Point an instance's incoming messages at the n8n workflow (v2 shape first, then v1). */
export async function setWebhook(base: string, instance: string, apikey: string, url: string): Promise<{ ok: boolean; error?: string }> {
  const path = `/webhook/set/${encodeURIComponent(instance)}`;
  const v2 = await call(base, apikey, path, { method: "POST", body: { webhook: { enabled: true, url, webhookByEvents: false, webhookBase64: false, events: WEBHOOK_EVENTS } } });
  if (v2.ok) return { ok: true };
  const v1 = await call(base, apikey, path, { method: "POST", body: { enabled: true, url, webhook_by_events: false, webhook_base64: false, events: WEBHOOK_EVENTS } });
  return v1.ok ? { ok: true } : { ok: false, error: message(v1.json) ?? message(v2.json) ?? `WhatsApp server replied ${v1.status}` };
}

/** The webhook URL an instance sends messages to, if any. */
export async function getWebhook(base: string, instance: string, apikey: string): Promise<string | null> {
  const r = await call(base, apikey, `/webhook/find/${encodeURIComponent(instance)}`);
  const w = (r.json.webhook as Json | undefined) ?? r.json;
  return r.ok && typeof w.url === "string" && w.enabled !== false ? w.url : null;
}

export async function connectionState(base: string, instance: string, apikey: string, timeoutMs = 20_000): Promise<WaState> {
  const r = await call(base, apikey, `/instance/connectionState/${encodeURIComponent(instance)}`, { timeoutMs });
  const s = ((r.json.instance as Json | undefined)?.state ?? r.json.state) as string | undefined;
  return s === "open" || s === "connecting" || s === "close" ? s : "unknown";
}

/** QR code (data URL) and/or 8-character pairing code for linking the phone. */
export async function connectCode(
  base: string,
  instance: string,
  apikey: string,
  phone?: string,
): Promise<{ ok: true; qr: string | null; pairingCode: string | null; state: WaState } | { ok: false; error: string }> {
  const q = phone ? `?number=${encodeURIComponent(phone)}` : "";
  const r = await call(base, apikey, `/instance/connect/${encodeURIComponent(instance)}${q}`);
  if (!r.ok) return { ok: false, error: message(r.json) ?? `WhatsApp server replied ${r.status || "nothing"}` };
  const s = ((r.json.instance as Json | undefined)?.state ?? null) as string | null;
  if (s === "open") return { ok: true, qr: null, pairingCode: null, state: "open" };
  const raw = (r.json.base64 ?? (r.json.qrcode as Json | undefined)?.base64) as string | undefined;
  const qr = raw ? (raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`) : null;
  const pairingCode = (r.json.pairingCode as string | undefined) ?? null;
  return { ok: true, qr, pairingCode, state: "connecting" };
}

/** Unlink the phone (the instance stays, ready to scan again). */
export async function logout(base: string, instance: string, apikey: string): Promise<boolean> {
  const r = await call(base, apikey, `/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" });
  return r.ok;
}

/** Instance names: lowercase, unique, recognisable in the Evolution manager. */
export function instanceNameFor(businessName: string) {
  const slug = businessName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `lingo-${slug || "shop"}-${crypto.randomUUID().slice(0, 6)}`;
}
