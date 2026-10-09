"use server";

import { createServerClient } from "@retexia/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PAYHERE_CURRENCIES, cancelPayhereSubscription, checkoutHash, money, notifyUrl, payhereReady, payhereSandbox } from "@/lib/payhere.server";
import { requestOrigin } from "@/lib/site-url";
import { getT } from "@/lib/strings.server";

type Result<T> = { ok: true; data: T } | { ok: false; message: string; needsPhone?: boolean };
const refSchema = z.string().trim().min(3).max(40);

export type PayherePayment = Record<string, string | boolean>;

/**
 * Everything PayHere's popup needs for one request, priced from the request
 * itself (plan renews monthly or yearly; setup fee added to the first payment).
 * The hash is made here so the merchant secret never leaves the server.
 */
export async function startPayhere(input: { ref: string }): Promise<Result<PayherePayment>> {
  const t = await getT();
  const unavailable = t("order.pay.unavailable", "Online payment isn't available right now. Please try again shortly or message us.");
  if (!payhereReady()) return { ok: false, message: unavailable };
  const ref = refSchema.safeParse(input.ref);
  if (!ref.success) return { ok: false, message: unavailable };

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: t("onboarding.error.signed_out", "Your session has ended. Please sign in again.") };
  const [{ data: order }, { data: profile }] = await Promise.all([
    supabase.from("orders").select("id, ref, status, billing_cycle, product_id, package_name, price_amount, setup_fee, currency, answers").eq("ref", ref.data).maybeSingle(),
    supabase.from("profiles").select("full_name, email, phone, whatsapp, business_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!order) return { ok: false, message: unavailable };
  if (!["submitted", "reviewing", "awaiting_payment"].includes(order.status)) return { ok: false, message: t("order.pay.already_paid", "This request is already paid.") };
  const { data: product } = await supabase.from("products").select("name, pay_online").eq("id", order.product_id).maybeSingle();
  if (!product?.pay_online) return { ok: false, message: unavailable };
  const currency = (order.currency ?? "LKR").toUpperCase();
  if (!PAYHERE_CURRENCIES.has(currency)) return { ok: false, message: unavailable };
  const price = Number(order.price_amount ?? 0);
  if (price <= 0) return { ok: false, message: unavailable };

  const phone = (profile?.whatsapp || profile?.phone || "").replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 9) {
    return { ok: false, needsPhone: true, message: t("order.pay.needs_phone", "PayHere needs your phone number. Add it in My account → Profile, then press Pay now again.") };
  }
  const [first, ...rest] = (profile?.full_name || profile?.email || auth.user.email || "Customer").trim().split(/\s+/);
  const answers = Array.isArray(order.answers) ? (order.answers as { key?: string; value?: unknown }[]) : [];
  const city = String(answers.find((a) => a.key === "city")?.value ?? "").trim() || "Colombo";
  const setup = Number(order.setup_fee ?? 0);
  const origin = await requestOrigin();
  const page = `${origin}/account/products/${encodeURIComponent(order.ref ?? "")}`;

  const payment: PayherePayment = {
    sandbox: payhereSandbox(),
    merchant_id: process.env.PAYHERE_MERCHANT_ID ?? "",
    return_url: `${page}?paid=1`,
    cancel_url: page,
    notify_url: notifyUrl(),
    order_id: order.ref ?? order.id,
    items: `${product.name} · ${order.package_name ?? ""}`.slice(0, 100),
    amount: money(price),
    currency,
    hash: checkoutHash(order.ref ?? order.id, price, currency),
    first_name: (first ?? "Customer").slice(0, 50),
    last_name: (rest.join(" ") || first || "Customer").slice(0, 50),
    email: profile?.email || auth.user.email || "",
    phone,
    address: (profile?.business_name || city).slice(0, 100),
    city: city.slice(0, 50),
    country: "Sri Lanka",
    recurrence: order.billing_cycle === "yearly" ? "1 Year" : "1 Month",
    duration: "Forever",
    custom_1: order.id,
  };
  if (setup > 0) payment.startup_fee = money(setup);
  return { ok: true, data: payment };
}

/** Cancel the request's PayHere subscription (no more renewals), then close the request. */
export async function cancelSubscription(input: { ref: string }): Promise<{ ok: boolean; message: string }> {
  const t = await getT();
  const failed = t("order.pay.cancel_failed", "We couldn't cancel it right now. Please try again, or message us.");
  const ref = refSchema.safeParse(input.ref);
  if (!ref.success) return { ok: false, message: failed };
  const supabase = await createServerClient();
  const { data: order } = await supabase.from("orders").select("id, payhere_subscription_id").eq("ref", ref.data).maybeSingle();
  if (!order?.payhere_subscription_id) return { ok: false, message: failed };
  const r = await cancelPayhereSubscription(order.payhere_subscription_id);
  if (!r.ok) {
    console.error("[payhere] cancel failed:", r.error);
    return { ok: false, message: failed };
  }
  await supabase.rpc("customer_cancelled_subscription", { p_order_id: order.id });
  revalidatePath("/account", "layout");
  return { ok: true, message: t("order.pay.cancelled", "Your subscription is cancelled. You won't be charged again.") };
}
