import "server-only";

import { createAdminClient } from "@retexia/supabase/admin";

/**
 * Applies one verified PayHere notification (idempotent per payment + message).
 * status_code: 2 success, 0 pending, -1 cancelled, -2 failed, -3 chargeback.
 */
export async function handlePayhereNotification(f: Record<string, string>) {
  const db = createAdminClient();
  const message = f.message_type || `STATUS_${f.status_code}`;
  const id = `${f.payment_id || f.order_id}:${message}:${f.item_rec_install_paid ?? ""}`;
  const { data: seen } = await db.from("payhere_events").select("processed_at").eq("id", id).maybeSingle();
  if (seen?.processed_at) return { duplicate: true };
  if (!seen) await db.from("payhere_events").insert({ id, message, payload: f as unknown as never });

  try {
    const orderUuid = /^[0-9a-f-]{36}$/i.test(f.custom_1 ?? "") ? f.custom_1! : "";
    const base = { order_id: orderUuid, ref: f.order_id ?? "", subscription_id: f.subscription_id ?? "" };
    const nextDate = f.item_rec_date_next ? `${f.item_rec_date_next}T00:00:00Z` : "";
    let orderId: string | undefined;

    const success = f.status_code === "2" && (!f.message_type || f.message_type === "AUTHORIZATION_SUCCESS" || f.message_type === "RECURRING_INSTALLMENT_SUCCESS");
    if (success) {
      const renewal = f.message_type === "RECURRING_INSTALLMENT_SUCCESS";
      // First payment: what was paid must cover the request's own price (plan + setup fee).
      let status: "confirmed" | "pending" = "confirmed";
      let note = "PayHere";
      let kind = "subscription";
      if (!renewal) {
        const q = orderUuid ? db.from("orders").select("price_amount, setup_fee, currency").eq("id", orderUuid) : db.from("orders").select("price_amount, setup_fee, currency").eq("ref", f.order_id ?? "");
        const { data: order } = await q.maybeSingle();
        const expected = Number(order?.price_amount ?? 0) + Number(order?.setup_fee ?? 0);
        if (Number(order?.setup_fee ?? 0) > 0) kind = "setup_fee";
        if (!order || (order.currency ?? "").toUpperCase() !== (f.payhere_currency ?? "").toUpperCase() || Number(f.payhere_amount) + 0.01 < expected) {
          status = "pending";
          note = `PayHere: paid ${f.payhere_amount} ${f.payhere_currency}, the request costs ${expected.toFixed(2)} ${order?.currency ?? ""}. Check it before confirming.`;
        }
      }
      const { data, error } = await db.rpc("svc_payhere_payment", {
        p: {
          ...base,
          transaction_id: `payhere:${f.payment_id}`,
          amount: Number(f.payhere_amount).toFixed(2),
          currency: f.payhere_currency,
          kind,
          status,
          note,
          origin: renewal ? "subscription_recurring" : "web",
          paid_at: new Date().toISOString(),
          period_start: new Date().toISOString(),
          period_end: nextDate,
        },
      });
      if (error) throw new Error(error.message);
      orderId = (data as { order_id?: string } | null)?.order_id;
    } else if (f.message_type === "RECURRING_STOPPED" || f.item_rec_status === "-1") {
      const { data, error } = await db.rpc("svc_payhere_subscription", { p: { ...base, status: "canceled" } });
      if (error) throw new Error(error.message);
      orderId = (data as { order_id?: string } | null)?.order_id;
    } else if (f.message_type === "RECURRING_INSTALLMENT_FAILED") {
      const { data, error } = await db.rpc("svc_payhere_subscription", { p: { ...base, status: "past_due", next_billed_at: nextDate } });
      if (error) throw new Error(error.message);
      orderId = (data as { order_id?: string } | null)?.order_id;
    } else if (f.status_code === "-3") {
      const { error } = await db.rpc("svc_paddle_refund", {
        p: { transaction_id: `payhere:${f.payment_id}`, adjustment_id: `payhere:${f.payment_id}:chargeback`, amount: Number(f.payhere_amount).toFixed(2), currency: f.payhere_currency, reason: "Chargeback (PayHere)" },
      });
      if (error) throw new Error(error.message);
    }
    await db.from("payhere_events").update({ processed_at: new Date().toISOString(), error: null, order_id: orderId ?? null }).eq("id", id);
    return { processed: true };
  } catch (e) {
    await db.from("payhere_events").update({ error: (e instanceof Error ? e.message : "failed").slice(0, 500) }).eq("id", id);
    throw e;
  }
}
