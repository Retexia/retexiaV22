import "server-only";

import { createAdminClient } from "@retexia/supabase/admin";
import { fromMinor } from "./paddle";

type Db = ReturnType<typeof createAdminClient>;
type Json = Record<string, unknown>;

type Item = { price?: { id?: string; billing_cycle?: unknown | null } | null; price_id?: string };
type Transaction = {
  id: string;
  status: string;
  origin?: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  currency_code: string;
  custom_data?: { order_id?: string } | null;
  items?: Item[];
  details?: { totals?: { grand_total?: string; total?: string } };
  billing_period?: { starts_at?: string; ends_at?: string } | null;
  billed_at?: string | null;
};
type Subscription = {
  id: string;
  status: string;
  customer_id?: string;
  next_billed_at?: string | null;
  custom_data?: { order_id?: string } | null;
};
type Adjustment = { id: string; action: string; status: string; transaction_id: string; reason?: string; totals?: { total?: string; currency_code?: string }; currency_code?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const orderIdOf = (custom: { order_id?: string } | null | undefined) => (custom?.order_id && UUID.test(custom.order_id) ? custom.order_id : "");

/** A completed (paid) transaction → one confirmed payment, checked against the request's plan. */
async function onTransaction(db: Db, t: Transaction) {
  const orderId = orderIdOf(t.custom_data);
  const priceIds = (t.items ?? []).map((i) => i.price?.id ?? i.price_id).filter(Boolean) as string[];
  const oneTime = (t.items ?? []).some((i) => i.price && i.price.billing_cycle === null);
  const recurringOrigin = t.origin === "subscription_recurring";
  let status: "confirmed" | "pending" = "confirmed";
  let note = "Paddle";

  // First payment: the plan paid for must be the plan of the request.
  if (!recurringOrigin && orderId) {
    const { data: order } = await db.from("orders").select("billing_cycle, package_id").eq("id", orderId).maybeSingle();
    const { data: pkg } = order ? await db.from("packages").select("paddle_price_monthly, paddle_price_yearly").eq("id", order.package_id).maybeSingle() : { data: null };
    const expected = order?.billing_cycle === "yearly" ? pkg?.paddle_price_yearly : pkg?.paddle_price_monthly;
    if (!expected || !priceIds.includes(expected)) {
      status = "pending";
      note = `Paddle: the paid plan (${priceIds.join(", ") || "none"}) doesn't match this request's plan. Check it before confirming.`;
    }
  }

  const amount = fromMinor(t.details?.totals?.grand_total ?? t.details?.totals?.total, t.currency_code);
  const { data, error } = await db.rpc("svc_paddle_payment", {
    p: {
      order_id: orderId,
      transaction_id: t.id,
      subscription_id: t.subscription_id ?? "",
      customer_id: t.customer_id ?? "",
      amount: amount.toFixed(2),
      currency: t.currency_code,
      kind: !recurringOrigin && oneTime ? "setup_fee" : "subscription",
      status,
      note,
      origin: t.origin ?? "",
      paid_at: t.billed_at ?? "",
      period_start: t.billing_period?.starts_at ?? "",
      period_end: t.billing_period?.ends_at ?? "",
    },
  });
  if (error) throw new Error(error.message);
  return (data as Json | null)?.order_id as string | undefined;
}

async function onSubscription(db: Db, s: Subscription, eventType: string) {
  // Past-due emails only on the transition event, not on every update.
  const status = s.status === "past_due" && eventType !== "subscription.past_due" ? "" : s.status;
  const { data, error } = await db.rpc("svc_paddle_subscription", {
    p: { subscription_id: s.id, order_id: orderIdOf(s.custom_data), customer_id: s.customer_id ?? "", status, next_billed_at: s.next_billed_at ?? "" },
  });
  if (error) throw new Error(error.message);
  return (data as Json | null)?.order_id as string | undefined;
}

async function onAdjustment(db: Db, a: Adjustment) {
  if (!["refund", "chargeback"].includes(a.action) || a.status !== "approved") return undefined;
  const currency = a.totals?.currency_code ?? a.currency_code ?? "USD";
  const { error } = await db.rpc("svc_paddle_refund", {
    p: { transaction_id: a.transaction_id, adjustment_id: a.id, amount: fromMinor(a.totals?.total, currency).toFixed(2), currency, reason: a.action === "chargeback" ? "Chargeback" : (a.reason ?? "Paddle refund") },
  });
  if (error) throw new Error(error.message);
  return undefined;
}

/** Applies one verified webhook event (idempotent: each event is processed once). */
export async function handlePaddleEvent(event: { event_id: string; event_type: string; occurred_at?: string; data: Json }) {
  const db = createAdminClient();
  const { data: seen } = await db.from("paddle_events").select("processed_at").eq("id", event.event_id).maybeSingle();
  if (seen?.processed_at) return { duplicate: true };
  if (!seen) {
    await db.from("paddle_events").insert({ id: event.event_id, event_type: event.event_type, occurred_at: event.occurred_at ?? null, payload: event as unknown as never });
  }
  try {
    let orderId: string | undefined;
    const type = event.event_type;
    if (type === "transaction.completed") orderId = await onTransaction(db, event.data as unknown as Transaction);
    else if (type.startsWith("subscription.")) orderId = await onSubscription(db, event.data as unknown as Subscription, type);
    else if (type.startsWith("adjustment.")) orderId = await onAdjustment(db, event.data as unknown as Adjustment);
    await db.from("paddle_events").update({ processed_at: new Date().toISOString(), error: null, order_id: orderId ?? null }).eq("id", event.event_id);
    return { processed: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    await db.from("paddle_events").update({ error: message.slice(0, 500) }).eq("id", event.event_id);
    throw e;
  }
}
