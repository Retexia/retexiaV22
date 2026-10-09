import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/** PayHere for the admin: notification checks, payment lookups and subscription cancelling. */
export const paymentProvider = (): "payhere" | "paddle" => (process.env.PAYMENT_PROVIDER === "paddle" ? "paddle" : "payhere");
export const payhereSandbox = () => process.env.NEXT_PUBLIC_PAYHERE_SANDBOX !== "false";
const base = () => (payhereSandbox() ? "https://sandbox.payhere.lk" : "https://www.payhere.lk");
export const payhereDashboard = () => (payhereSandbox() ? "https://sandbox.payhere.lk/merchant" : "https://www.payhere.lk/merchant");

const md5 = (s: string) => createHash("md5").update(s).digest("hex").toUpperCase();
const secret = () => (process.env.PAYHERE_MERCHANT_SECRET ?? "").trim().replace(/^["']|["']$/g, "");

/** md5sig = UPPER(MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(MD5(secret)))) */
export function verifyPayhereNotification(f: Record<string, string>): boolean {
  const merchantId = (process.env.PAYHERE_MERCHANT_ID ?? "").trim();
  if (!merchantId || !secret() || f.merchant_id !== merchantId || !f.md5sig) return false;
  const expected = md5(`${f.merchant_id}${f.order_id}${f.payhere_amount}${f.payhere_currency}${f.status_code}${md5(secret())}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(f.md5sig.toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

async function apiToken(): Promise<string | null> {
  const appId = process.env.PAYHERE_APP_ID;
  const appSecret = process.env.PAYHERE_APP_SECRET;
  if (!appId || !appSecret) return null;
  try {
    const res = await fetch(`${base()}/merchant/v1/oauth/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return ((await res.json().catch(() => ({}))) as { access_token?: string }).access_token ?? null;
  } catch {
    return null;
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const token = await apiToken();
  if (!token) return { ok: false, error: "Set PAYHERE_APP_ID and PAYHERE_APP_SECRET (PayHere → Settings → API keys)." };
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { status?: number; msg?: string; data?: T };
    return res.ok && json.status === 1 ? { ok: true, data: json.data as T } : { ok: false, error: json.msg ?? `PayHere replied ${res.status}` };
  } catch {
    return { ok: false, error: "PayHere did not answer" };
  }
}

export type PayherePaymentRow = { payment_id: number | string; order_id: string; date?: string; status: string; currency: string; amount: number | string };

/** Payments PayHere has for one order id (our request reference). */
export const searchPayherePayments = (orderId: string) => api<PayherePaymentRow[]>(`/merchant/v1/payment/search?order_id=${encodeURIComponent(orderId)}`);
export const cancelPayhereSubscription = (subscriptionId: string) => api<unknown>("/merchant/v1/subscription/cancel", { method: "POST", body: { subscription_id: Number(subscriptionId) || subscriptionId } });
