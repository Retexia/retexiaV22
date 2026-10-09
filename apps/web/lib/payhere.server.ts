import "server-only";

import { createHash } from "node:crypto";

/**
 * PayHere (Sri Lanka) for the website: the checkout popup (hash made here, on
 * the server, with the merchant secret) and subscription cancelling. Payments
 * are recorded by the admin's notify URL (admin.retexia.com/api/payhere/notify).
 */

/** Which gateway the website uses: PayHere (default) or Paddle. */
export const paymentProvider = (): "payhere" | "paddle" => (process.env.PAYMENT_PROVIDER === "paddle" ? "paddle" : "payhere");

export const payhereSandbox = () => process.env.NEXT_PUBLIC_PAYHERE_SANDBOX !== "false";
export const payhereReady = () => Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET);
export const PAYHERE_CURRENCIES = new Set(["LKR", "USD", "GBP", "EUR", "AUD"]);
const base = () => (payhereSandbox() ? "https://sandbox.payhere.lk" : "https://www.payhere.lk");
export const notifyUrl = () => `${(process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.retexia.com").replace(/\/+$/, "")}/api/payhere/notify`;

const md5 = (s: string) => createHash("md5").update(s).digest("hex").toUpperCase();
export const money = (n: number) => n.toFixed(2);

/** hash = UPPER(MD5(merchant_id + order_id + amount + currency + UPPER(MD5(merchant_secret)))) */
export function checkoutHash(orderId: string, amount: number, currency: string) {
  const id = process.env.PAYHERE_MERCHANT_ID ?? "";
  return md5(`${id}${orderId}${money(amount)}${currency}${md5(process.env.PAYHERE_MERCHANT_SECRET ?? "")}`);
}

/** OAuth token for PayHere's merchant API (Settings → API keys: App ID + App Secret). */
async function apiToken(): Promise<string | null> {
  const appId = process.env.PAYHERE_APP_ID;
  const secret = process.env.PAYHERE_APP_SECRET;
  if (!appId || !secret) return null;
  try {
    const res = await fetch(`${base()}/merchant/v1/oauth/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

export async function cancelPayhereSubscription(subscriptionId: string): Promise<{ ok: boolean; error?: string }> {
  const token = await apiToken();
  if (!token) return { ok: false, error: "PAYHERE_APP_ID / PAYHERE_APP_SECRET are not set" };
  try {
    const res = await fetch(`${base()}/merchant/v1/subscription/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ subscription_id: Number(subscriptionId) || subscriptionId }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { status?: number; msg?: string };
    return res.ok && json.status === 1 ? { ok: true } : { ok: false, error: json.msg ?? `PayHere replied ${res.status}` };
  } catch {
    return { ok: false, error: "PayHere did not answer" };
  }
}
