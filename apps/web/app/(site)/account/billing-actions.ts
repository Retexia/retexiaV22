"use server";

import { createServerClient } from "@retexia/supabase/server";
import { z } from "zod";
import { PADDLE_CURRENCIES, checkoutItems, paddleApi, paddleReady } from "@/lib/paddle.server";
import { getT } from "@/lib/strings.server";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const refSchema = z.string().trim().min(3).max(40);

/**
 * Creates the Paddle transaction for one of the customer's requests: the plan's
 * recurring price (+ the one-time setup fee on the first payment), with the
 * request id in custom_data so the webhook can match the payment. Prices come
 * from the database, never from the browser.
 */
export async function startCheckout(input: { ref: string }): Promise<Result<{ transactionId: string; email: string | null }>> {
  const t = await getT();
  const unavailable = t("order.paddle.unavailable", "Online payment isn't available right now. Please try again shortly or message us.");
  if (!paddleReady()) return { ok: false, message: unavailable };
  const ref = refSchema.safeParse(input.ref);
  if (!ref.success) return { ok: false, message: unavailable };

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: t("onboarding.error.signed_out", "Your session has ended. Please sign in again.") };
  const { data: order } = await supabase
    .from("orders")
    .select("id, ref, status, billing_cycle, product_id, package_name, price_amount, setup_fee, currency")
    .eq("ref", ref.data)
    .maybeSingle();
  if (!order) return { ok: false, message: unavailable };
  if (!["submitted", "reviewing", "awaiting_payment"].includes(order.status)) {
    return { ok: false, message: t("order.paddle.already_paid", "This request is already paid.") };
  }
  const { data: product } = await supabase.from("products").select("name, pay_online").eq("id", order.product_id).maybeSingle();
  if (!product?.pay_online) return { ok: false, message: unavailable };
  const currency = (order.currency ?? "USD").toUpperCase();
  if (!PADDLE_CURRENCIES.has(currency)) {
    return { ok: false, message: t("order.paddle.currency", "This request was priced in {currency}, which our payment partner doesn't accept. Message us and we'll update it.", { currency }) };
  }
  const price = Number(order.price_amount ?? 0);
  if (price <= 0) return { ok: false, message: unavailable };
  const items = checkoutItems({
    product: product.name,
    plan: order.package_name ?? product.name,
    cycle: order.billing_cycle === "yearly" ? "yearly" : "monthly",
    price,
    setupFee: Number(order.setup_fee ?? 0),
    currency,
  });
  const r = await paddleApi<{ id: string }>("/transactions", {
    method: "POST",
    body: { items, collection_mode: "automatic", custom_data: { order_id: order.id, ref: order.ref, user_id: auth.user.id } },
  });
  if (!r.ok) {
    console.error("[paddle] transaction failed:", r.code, r.error);
    return { ok: false, message: unavailable };
  }
  // Remembered on the request so the team can look the payment up in Paddle if a webhook is missed.
  await supabase.rpc("customer_set_paddle_transaction", { p_order_id: order.id, p_transaction_id: r.data.id });
  return { ok: true, data: { transactionId: r.data.id, email: auth.user.email ?? null } };
}

/** Paddle's billing portal for this request: change card, see invoices, cancel. */
export async function openBillingPortal(input: { ref: string }): Promise<Result<{ url: string }>> {
  const t = await getT();
  const failed = t("order.paddle.portal_failed", "We couldn't open billing right now. Please try again shortly.");
  const ref = refSchema.safeParse(input.ref);
  if (!ref.success || !paddleReady()) return { ok: false, message: failed };
  const supabase = await createServerClient();
  const { data: order } = await supabase.from("orders").select("paddle_customer_id, paddle_subscription_id").eq("ref", ref.data).maybeSingle();
  if (!order?.paddle_customer_id) return { ok: false, message: failed };
  const r = await paddleApi<{ urls: { general: { overview: string }; subscriptions?: { id: string; cancel_subscription: string; update_subscription_payment_method: string }[] } }>(
    `/customers/${encodeURIComponent(order.paddle_customer_id)}/portal-sessions`,
    { method: "POST", body: order.paddle_subscription_id ? { subscription_ids: [order.paddle_subscription_id] } : {} },
  );
  if (!r.ok) {
    console.error("[paddle] portal failed:", r.code, r.error);
    return { ok: false, message: failed };
  }
  return { ok: true, data: { url: r.data.urls.general.overview } };
}
