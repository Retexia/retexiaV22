"use server";

import { createAdminClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { PADDLE_CURRENCIES, checkoutItems, paddleApi, paddleConfigured } from "@/lib/paddle";

/** Turn Paddle checkout on or off for the whole website. */
export async function setOnlinePayments(input: { on: boolean }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const on = z.boolean().parse(input.on);
    const { error } = await createAdminClient().from("site_settings").update({ online_payments: on }).eq("id", 1);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: "paddle.online", table: "site_settings", summary: `Online payments (Paddle) turned ${on ? "on" : "off"}` });
    revalidatePath("/settings/payments");
    return { ok: true, message: on ? "Customers pay through Paddle right after the form." : "Online payment off: requests wait for your review." };
  });
}

/**
 * A Paddle payment link for one request (e.g. for a customer on WhatsApp, or a
 * request you approved by hand). Priced from the request; opens Paddle's checkout
 * on retexia.com/pay (Paddle's default payment link).
 */
export async function createPaymentLink(input: { orderId: string }): Promise<ActionResult<string>> {
  return run(async () => {
    const staff = await requireRole("operate");
    if (!paddleConfigured()) return { ok: false, message: "Set PADDLE_API_KEY in the admin's environment first." };
    const orderId = z.uuid().parse(input.orderId);
    const db = createAdminClient();
    const { data: order } = await db.from("orders").select("id, ref, user_id, status, billing_cycle, product_id, package_name, price_amount, setup_fee, currency").eq("id", orderId).maybeSingle();
    if (!order) return { ok: false, message: "Request not found." };
    if (!["submitted", "reviewing", "awaiting_payment"].includes(order.status)) return { ok: false, message: "This request isn't waiting for a payment." };
    const currency = (order.currency ?? "USD").toUpperCase();
    if (!PADDLE_CURRENCIES.has(currency)) return { ok: false, message: `Paddle can't charge in ${currency}. Change the request's price to USD first (Overview → Change pricing).` };
    if (!Number(order.price_amount)) return { ok: false, message: "The request has no price." };
    const { data: product } = await db.from("products").select("name").eq("id", order.product_id).maybeSingle();
    const r = await paddleApi<{ id: string; checkout?: { url?: string | null } }>("/transactions", {
      method: "POST",
      body: {
        items: checkoutItems({
          product: product?.name ?? "Retexia",
          plan: order.package_name ?? product?.name ?? "Plan",
          cycle: order.billing_cycle === "yearly" ? "yearly" : "monthly",
          price: Number(order.price_amount),
          setupFee: Number(order.setup_fee ?? 0),
          currency,
        }),
        collection_mode: "automatic",
        custom_data: { order_id: order.id, ref: order.ref, user_id: order.user_id },
      },
    });
    if (!r.ok) return { ok: false, message: r.code === "transaction_default_checkout_url_not_set" ? "Set Paddle → Checkout settings → Default payment link to https://www.retexia.com/pay first." : `Paddle: ${r.error}` };
    const url = r.data.checkout?.url;
    if (!url) return { ok: false, message: "Paddle didn't return a link. Set Checkout settings → Default payment link to https://www.retexia.com/pay." };
    await audit(staff, { action: "paddle.link", table: "orders", recordId: order.id, summary: `Created a Paddle payment link for ${order.ref}` });
    return { ok: true, message: "Payment link copied", data: url };
  });
}

/** Cancel a request's Paddle subscription (at the end of the paid period, or now). */
export async function cancelPaddleSubscription(input: { orderId: string; when: "next_billing_period" | "immediately" }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z.object({ orderId: z.uuid(), when: z.enum(["next_billing_period", "immediately"]) }).parse(input);
    const { data: order } = await createAdminClient().from("orders").select("ref, paddle_subscription_id").eq("id", d.orderId).maybeSingle();
    if (!order?.paddle_subscription_id) return { ok: false, message: "This request has no Paddle subscription." };
    const r = await paddleApi(`/subscriptions/${order.paddle_subscription_id}/cancel`, { method: "POST", body: { effective_from: d.when } });
    if (!r.ok) return { ok: false, message: `Paddle: ${r.error}` };
    await audit(staff, { action: "paddle.cancel", table: "orders", recordId: d.orderId, summary: `Cancelled the Paddle subscription of ${order.ref} (${d.when.replace(/_/g, " ")})` });
    revalidatePath(`/requests/${encodeURIComponent(order.ref ?? "")}`);
    return {
      ok: true,
      message: d.when === "immediately" ? "Cancelled. The request is cancelled as soon as Paddle confirms." : "Cancels at the end of the paid period. The request is cancelled then.",
    };
  });
}
