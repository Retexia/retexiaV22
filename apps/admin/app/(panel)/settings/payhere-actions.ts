"use server";

import { createAdminClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { cancelPayhereSubscription, searchPayherePayments } from "@/lib/payhere";

/** Looks the request's payment up in PayHere (by its reference) and records it if received (for a missed notification). */
export async function checkPayherePayment(input: { orderId: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const orderId = z.uuid().parse(input.orderId);
    const db = createAdminClient();
    const { data: order } = await db.from("orders").select("id, ref, price_amount, setup_fee, currency").eq("id", orderId).maybeSingle();
    if (!order?.ref) return { ok: false, message: "Request not found." };
    const r = await searchPayherePayments(order.ref);
    if (!r.ok) return { ok: false, message: `PayHere: ${r.error}` };
    const paid = (r.data ?? []).filter((p) => String(p.status).toUpperCase() === "RECEIVED");
    if (!paid.length) return { ok: false, message: "PayHere has no received payment for this request yet." };
    let recorded = 0;
    for (const p of paid) {
      const expected = Number(order.price_amount ?? 0) + Number(order.setup_fee ?? 0);
      const ok = String(p.currency).toUpperCase() === (order.currency ?? "").toUpperCase() && Number(p.amount) + 0.01 >= (recorded ? Number(order.price_amount ?? 0) : expected);
      const { error } = await db.rpc("svc_payhere_payment", {
        p: {
          order_id: order.id,
          transaction_id: `payhere:${p.payment_id}`,
          amount: Number(p.amount).toFixed(2),
          currency: p.currency,
          kind: recorded === 0 && Number(order.setup_fee ?? 0) > 0 ? "setup_fee" : "subscription",
          status: ok ? "confirmed" : "pending",
          note: ok ? "PayHere (checked by the team)" : `PayHere: paid ${p.amount} ${p.currency}; check before confirming.`,
          origin: recorded === 0 ? "web" : "subscription_recurring",
          paid_at: p.date ? new Date(p.date).toISOString() : "",
        },
      });
      if (error) return { ok: false, message: error.message };
      recorded++;
    }
    await audit(staff, { action: "payhere.check", table: "orders", recordId: order.id, summary: `Recorded ${recorded} PayHere payment(s) for ${order.ref} from PayHere's API` });
    revalidatePath(`/requests/${encodeURIComponent(order.ref)}`);
    revalidatePath("/payments");
    return { ok: true, message: `Found ${recorded} payment${recorded === 1 ? "" : "s"} in PayHere and recorded ${recorded === 1 ? "it" : "them"}.` };
  });
}

/** Stops the request's PayHere subscription (no more renewals) and cancels the request. */
export async function cancelPayhere(input: { orderId: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const orderId = z.uuid().parse(input.orderId);
    const db = createAdminClient();
    const { data: order } = await db.from("orders").select("id, ref, payhere_subscription_id").eq("id", orderId).maybeSingle();
    if (!order?.payhere_subscription_id) return { ok: false, message: "This request has no PayHere subscription." };
    const r = await cancelPayhereSubscription(order.payhere_subscription_id);
    if (!r.ok) return { ok: false, message: `PayHere: ${r.error}` };
    await db.rpc("svc_payhere_subscription", { p: { order_id: order.id, status: "canceled" } });
    await audit(staff, { action: "payhere.cancel", table: "orders", recordId: order.id, summary: `Cancelled the PayHere subscription of ${order.ref}` });
    revalidatePath(`/requests/${encodeURIComponent(order.ref ?? "")}`);
    return { ok: true, message: "Subscription cancelled in PayHere and the request is cancelled." };
  });
}
