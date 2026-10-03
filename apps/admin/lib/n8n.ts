import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed webhooks between Retexia and n8n.
 * Headers: X-Retexia-Timestamp (unix seconds) and
 * X-Retexia-Signature = hex HMAC-SHA256 of `${timestamp}.${body}`.
 */
export function signBody(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature(secret: string, timestamp: string | null, signature: string | null, body: string, maxAgeSeconds = 300) {
  if (!secret || !timestamp || !signature) return { ok: false as const, reason: "Missing signature" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > maxAgeSeconds) return { ok: false as const, reason: "Timestamp too old" };
  const expected = Buffer.from(signBody(secret, timestamp, body));
  const given = Buffer.from(signature.replace(/^sha256=/, ""));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false as const, reason: "Bad signature" };
  return { ok: true as const };
}

export type N8nReply = { status?: "succeeded" | "failed" | "running"; service_data?: Record<string, unknown>; order_status?: string; note?: string; customer_note?: string; error?: string };

/** POST a signed payload with a 15 second timeout. */
export async function postSigned(url: string, secret: string | null, payload: unknown) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "content-type": "application/json", "x-retexia-timestamp": timestamp };
  if (secret) headers["x-retexia-signature"] = signBody(secret, timestamp, body);
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 2000) };
    }
    return { ok: res.ok, httpStatus: res.status, json, ms: Date.now() - started, error: res.ok ? null : `n8n replied ${res.status}` };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      json: null,
      ms: Date.now() - started,
      error: error instanceof Error && error.name === "TimeoutError" ? "n8n did not answer within 15 seconds" : `Could not reach n8n: ${error instanceof Error ? error.message : "network error"}`,
    };
  }
}
