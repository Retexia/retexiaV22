import "server-only";

/**
 * Paddle Billing (Merchant of Record) for the website: checkout transactions
 * and the customer billing portal. PADDLE_API_KEY stays on the server;
 * NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is Paddle's public client-side token.
 * Payments are recorded by the admin's webhook (admin.retexia.com/api/paddle/webhook).
 */

export type PaddleEnv = "sandbox" | "production";
export const paddleEnv = (): PaddleEnv => (process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox");
export const paddleReady = () => Boolean(process.env.PADDLE_API_KEY && process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);
const base = () => (paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com");

/** Currencies Paddle can charge in (LKR is not one of them). */
export const PADDLE_CURRENCIES = new Set(["USD", "EUR", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD", "JPY", "KRW", "INR", "BRL", "MXN", "ZAR", "PLN", "CZK", "HUF", "ILS", "TRY", "TWD", "THB", "CNY", "ARS", "COP", "CLP", "PEN", "RUB", "UAH", "VND"]);
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "VND", "COP"]);
const toMinor = (amount: number, currency: string) => String(Math.round(amount * (ZERO_DECIMAL.has(currency) ? 1 : 100)));

type PaddleResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

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

/**
 * Checkout lines for a request, priced from the request itself (the amount the
 * customer saw when ordering): the plan, renewing monthly or yearly, plus the
 * one-time setup fee on the first payment. No Paddle catalog needed.
 */
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
      price: {
        name: `${o.plan} setup`,
        description: `${o.product} · ${o.plan} · one-time setup`,
        unit_price: { amount: toMinor(o.setupFee, o.currency), currency_code: o.currency },
        product,
      },
    });
  }
  return items;
}
