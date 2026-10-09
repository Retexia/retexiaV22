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
export function verifyPaddleSignature(rawBody: string, header: string | null, secretSetting: string | undefined, toleranceSeconds = 300): boolean {
  // Tolerate copy-paste slips in the env var: spaces, line breaks, quotes. Several secrets: comma-separated (rotation).
  const secrets = (secretSetting ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
  if (!header || !secrets.length) return false;
  const parts = header.split(";").map((p) => p.trim().split("=") as [string, string]);
  const ts = parts.find(([k]) => k === "ts")?.[1];
  const sigs = parts.filter(([k]) => k === "h1").map(([, v]) => v);
  if (!ts || !sigs.length || !/^\d+$/.test(ts)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSeconds) return false;
  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest();
    return sigs.some((h) => {
      const given = Buffer.from(h.trim(), "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  });
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "VND", "COP"]);
/** Paddle amounts are strings in the lowest unit ("2500" = 25.00 USD). */
export const fromMinor = (amount: string | number | null | undefined, currency: string) => Number(amount ?? 0) / (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100);
export const toMinor = (amount: number, currency: string) => String(Math.round(amount * (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100)));

/** Currencies Paddle can charge in (LKR is not one of them). */
export const PADDLE_CURRENCIES = new Set(["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD", "JPY", "KRW", "INR", "BRL", "MXN", "ZAR", "PLN", "CZK", "HUF", "ILS", "TRY", "TWD", "THB", "CNY", "ARS", "COP", "CLP", "PEN", "RUB", "UAH", "VND"]);

/** Checkout lines priced from the request itself: the plan (monthly/yearly) + one-time setup fee. Same as the website. */
export function checkoutItems(o: { product: string; plan: string; cycle: "monthly" | "yearly"; price: number; setupFee: number; currency: string }) {
  const product = { name: o.product, tax_category: "standard" };
  const items: { quantity: number; price: Record<string, unknown> }[] = [
    {
      quantity: 1,
      price: {
        name: `${o.plan} (${o.cycle})`,
        description: `${o.product} · ${o.plan} · ${o.cycle}`,
        unit_price: { amount: toMinor(o.price, o.currency), currency_code: o.currency },
        billing_cycle: { interval: o.cycle === "yearly" ? "year" : "month", frequency: 1 },
        product,
      },
    },
  ];
  if (o.setupFee > 0) {
    items.push({
      quantity: 1,
      price: { name: `${o.plan} setup`, description: `${o.product} · ${o.plan} · one-time setup`, unit_price: { amount: toMinor(o.setupFee, o.currency), currency_code: o.currency }, product },
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Webhook IP allowlist: Paddle publishes its sending IPs at /ips (source of truth, can change).
// ---------------------------------------------------------------------------
let ipCache: { cidrs: string[]; at: number } | null = null;

async function paddleIps(): Promise<string[] | null> {
  if (ipCache && Date.now() - ipCache.at < 60 * 60_000) return ipCache.cidrs;
  try {
    const res = await fetch(`${base()}/ips`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    const json = (await res.json()) as { data?: { ipv4_cidrs?: string[] } };
    const cidrs = json.data?.ipv4_cidrs ?? [];
    if (res.ok && cidrs.length) ipCache = { cidrs, at: Date.now() };
  } catch {
    // keep the last known list
  }
  return ipCache?.cidrs ?? null;
}

const ipToInt = (ip: string) => ip.split(".").reduce((n, p) => (n << 8) + (Number(p) & 255), 0) >>> 0;
function inCidr(ip: string, cidr: string) {
  const [net, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw ?? 32);
  if (!net || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(net) & mask);
}

/** true: from Paddle; false: not; null: Paddle's IP list couldn't be loaded (answer 503 so Paddle retries). */
export async function fromPaddleIp(clientIp: string | null): Promise<boolean | null> {
  const cidrs = await paddleIps();
  if (!cidrs) return null;
  return Boolean(clientIp && cidrs.some((c) => inCidr(clientIp, c)));
}
