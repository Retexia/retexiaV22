import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paddle Billing for the admin: catalog sync, subscription actions and webhook
 * signature checks. PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET are server-only.
 */

export type PaddleEnv = "sandbox" | "production";
export const paddleEnv = (): PaddleEnv => (process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox");
export const paddleConfigured = () => Boolean(process.env.PADDLE_API_KEY);
const base = () => (paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com");

/** Paddle dashboard links (sandbox or live). */
export const paddleDashboard = (path: string) => `${paddleEnv() === "production" ? "https://vendors.paddle.com" : "https://sandbox-vendors.paddle.com"}${path}`;

export type PaddleResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export async function paddleApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<PaddleResult<T>> {
  const key = process.env.PADDLE_API_KEY;
  if (!key) return { ok: false, error: "PADDLE_API_KEY is not set" };
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; detail?: string } };
    if (!res.ok || json.data === undefined) return { ok: false, error: json.error?.detail ?? `Paddle replied ${res.status}`, code: json.error?.code };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, error: "Paddle did not answer" };
  }
}

/** Paddle-Signature: "ts=…;h1=…" (h1 = HMAC-SHA256 of "ts:rawBody" with the webhook secret). Rejects stale timestamps. */
export function verifyPaddleSignature(rawBody: string, header: string | null, secret: string | undefined, toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(";").map((p) => p.split("=") as [string, string]);
  const ts = parts.find(([k]) => k === "ts")?.[1];
  const sigs = parts.filter(([k]) => k === "h1").map(([, v]) => v);
  if (!ts || !sigs.length || !/^\d+$/.test(ts)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest();
  return sigs.some((h) => {
    const given = Buffer.from(h, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "VND", "COP"]);
/** Paddle amounts are strings in the lowest unit ("2500" = 25.00 USD). */
export const fromMinor = (amount: string | number | null | undefined, currency: string) => Number(amount ?? 0) / (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100);
export const toMinor = (amount: number, currency: string) => String(Math.round(amount * (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100)));

/** Currencies Paddle can charge in (LKR is not one of them). */
export const PADDLE_CURRENCIES = new Set(["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD", "JPY", "KRW", "INR", "BRL", "MXN", "ZAR", "PLN", "CZK", "HUF", "ILS", "TRY", "TWD", "THB", "CNY", "ARS", "COP", "CLP", "PEN", "RUB", "UAH", "VND"]);
