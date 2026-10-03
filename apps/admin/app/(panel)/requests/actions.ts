"use server";

import { buildAnswers, parseForm, sanitizeValues, validateForm, type FormValues } from "@retexia/forms";
import type { Json } from "@retexia/supabase";
import { createAdminClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { adminUrl } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { postSigned, type N8nReply } from "@/lib/n8n";

const uuid = z.uuid();

function refresh(ref?: string) {
  revalidatePath("/requests");
  if (ref) revalidatePath(`/requests/${encodeURIComponent(ref)}`);
  revalidatePath("/", "layout");
}

export async function changeStatus(input: {
  orderId: string;
  ref: string;
  toStatus: string;
  customerNote?: string;
  internalNote?: string;
  notify: boolean;
  overrideReason?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z
      .object({
        orderId: uuid,
        ref: z.string(),
        toStatus: z.string().min(1).max(60),
        customerNote: z.string().max(4000).optional(),
        internalNote: z.string().max(10000).optional(),
        notify: z.boolean(),
        overrideReason: z.string().max(1000).optional(),
      })
      .parse(input);
    const { error } = await supabase.rpc("admin_change_order_status", {
      p_order_id: d.orderId,
      p_to_status: d.toStatus,
      p_customer_note: d.customerNote ?? "",
      p_internal_note: d.internalNote ?? "",
      p_notify: d.notify,
      p_override_reason: d.overrideReason ?? "",
    });
    if (error) return { ok: false, message: dbMessage(error) };
    refresh(d.ref);
    return { ok: true, message: "Status updated" };
  });
}

export async function bulkChangeStatus(input: { ids: string[]; toStatus: string; notify: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z.object({ ids: z.array(uuid).min(1).max(200), toStatus: z.string().min(1), notify: z.boolean() }).parse(input);
    let done = 0;
    const failed: string[] = [];
    for (const id of d.ids) {
      const { error } = await supabase.rpc("admin_change_order_status", { p_order_id: id, p_to_status: d.toStatus, p_notify: d.notify });
      if (error) failed.push(dbMessage(error));
      else done++;
    }
    refresh();
    if (failed.length) return { ok: done > 0, message: `${done} updated, ${failed.length} not: ${failed[0]}` } as ActionResult;
    return { ok: true, message: `${done} request${done === 1 ? "" : "s"} updated` };
  });
}

export async function assignOrders(input: { ids: string[]; userId: string | null }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z.object({ ids: z.array(uuid).min(1).max(200), userId: uuid.nullable() }).parse(input);
    for (const id of d.ids) {
      const { error } = await supabase.rpc("admin_assign_order", { p_order_id: id, p_user_id: d.userId as string });
      if (error) return { ok: false, message: dbMessage(error) };
    }
    refresh();
    return { ok: true, message: d.userId ? "Assigned" : "Unassigned" };
  });
}

export async function updateOrder(input: { orderId: string; ref: string; changes: Record<string, unknown>; reason?: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const d = z
      .object({
        orderId: uuid,
        ref: z.string(),
        changes: z
          .object({
            package_id: uuid.optional(),
            billing_cycle: z.enum(["monthly", "yearly"]).optional(),
            price_amount: z.number().min(0).optional(),
            setup_fee: z.number().min(0).optional(),
            source: z.enum(["website", "admin", "whatsapp", "referral"]).optional(),
            starts_at: z.string().nullable().optional(),
            renews_at: z.string().nullable().optional(),
            admin_note: z.string().max(10000).optional(),
          })
          .strict(),
        reason: z.string().max(1000).optional(),
      })
      .parse(input);
    const { error } = await supabase.rpc("admin_update_order", {
      p_order_id: d.orderId,
      p_changes: d.changes as Json,
      p_reason: d.reason ?? "",
    });
    if (error) return { ok: false, message: dbMessage(error) };
    refresh(d.ref);
    return { ok: true, message: "Request updated" };
  });
}

/** Admin edits the customer's answers (validated against the current form). */
export async function editAnswers(input: { orderId: string; ref: string; values: FormValues }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const orderId = uuid.parse(input.orderId);
    const { data: order } = await supabase.from("staff_orders").select("form_id, product_id").eq("id", orderId).maybeSingle();
    if (!order?.form_id) return { ok: false, message: "This request has no form to edit." };
    const { data: raw } = await supabase.from("forms").select("*, steps:form_steps(*, fields:form_fields(*))").eq("id", order.form_id).maybeSingle();
    if (!raw) return { ok: false, message: "The form no longer exists." };
    const form = parseForm(raw);
    const result = validateForm(form, sanitizeValues(form, input.values));
    if (!result.ok) return { ok: false, message: "Some answers are not valid.", fieldErrors: result.errors };
    const answers = buildAnswers(form, result.values);
    const { error } = await supabase.rpc("admin_update_order", { p_order_id: orderId, p_changes: { answers } as unknown as Json, p_reason: "" });
    if (error) return { ok: false, message: dbMessage(error) };
    refresh(input.ref);
    return { ok: true, message: "Answers saved" };
  });
}

export async function saveServiceData(input: { orderId: string; ref: string; values: Record<string, unknown> }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z.object({ orderId: uuid, ref: z.string(), values: z.record(z.string(), z.unknown()) }).parse(input);
    const { error } = await supabase.rpc("admin_set_service_data", { p_order_id: d.orderId, p_values: d.values as Json });
    if (error) return { ok: false, message: dbMessage(error) };
    refresh(d.ref);
    return { ok: true, message: "Setup fields saved" };
  });
}

export async function revealSecret(input: { orderId: string; key: string }): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const d = z.object({ orderId: uuid, key: z.string().regex(/^[a-z][a-z0-9_]*$/) }).parse(input);
    const { data, error } = await supabase.rpc("admin_reveal_order_secret", { p_order_id: d.orderId, p_key: d.key });
    if (error) return { ok: false, message: dbMessage(error) };
    return { ok: true, data: data ?? "" };
  });
}

export async function addNote(input: { orderId: string; ref: string; body: string; pinned: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await requireRole("operate");
    const d = z.object({ orderId: uuid, ref: z.string(), body: z.string().trim().min(1).max(10000), pinned: z.boolean() }).parse(input);
    const { error } = await supabase.from("order_notes").insert({ order_id: d.orderId, author_id: user.id, body: d.body, pinned: d.pinned });
    if (error) return { ok: false, message: dbMessage(error) };
    refresh(d.ref);
    return { ok: true, message: "Note added" };
  });
}

export async function updateNote(input: { id: string; ref: string; pinned?: boolean; remove?: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z.object({ id: uuid, ref: z.string(), pinned: z.boolean().optional(), remove: z.boolean().optional() }).parse(input);
    const { error } = d.remove
      ? await supabase.from("order_notes").delete().eq("id", d.id)
      : await supabase.from("order_notes").update({ pinned: d.pinned ?? false }).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    refresh(d.ref);
    return { ok: true, message: d.remove ? "Note deleted" : d.pinned ? "Pinned" : "Unpinned" };
  });
}

const paymentSchema = z.object({
  orderId: uuid,
  kind: z.enum(["setup_fee", "subscription", "addon", "refund", "other"]),
  amount: z.number().min(0).max(100_000_000),
  method: z.enum(["bank_transfer", "cash", "card", "online_gateway", "other"]),
  reference: z.string().max(200).optional(),
  paidAt: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  status: z.enum(["pending", "confirmed"]),
  proofPath: z.string().max(500).optional(),
  note: z.string().max(2000).optional(),
});

export async function recordPayment(input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await requireRole("operate");
    const d = paymentSchema.parse(input);
    const { data: order } = await supabase.from("staff_orders").select("ref, currency").eq("id", d.orderId).maybeSingle();
    if (!order) return { ok: false, message: "Request not found." };
    const { error } = await supabase.from("payments").insert({
      order_id: d.orderId,
      kind: d.kind,
      amount: d.amount,
      currency: order.currency,
      method: d.method,
      reference: d.reference || null,
      paid_at: d.paidAt ? new Date(d.paidAt).toISOString() : null,
      period_start: d.periodStart ? new Date(d.periodStart).toISOString() : null,
      period_end: d.periodEnd ? new Date(d.periodEnd).toISOString() : null,
      status: d.status,
      proof_path: d.proofPath || null,
      note: d.note || null,
      recorded_by: user.id,
    });
    if (error) return { ok: false, message: dbMessage(error) };
    refresh(order.ref ?? undefined);
    revalidatePath("/payments");
    return { ok: true, message: d.status === "confirmed" ? "Payment recorded and confirmed" : "Payment recorded as pending" };
  });
}

export async function setPaymentStatus(input: { id: string; status: "confirmed" | "refunded" | "failed" }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole(input.status === "refunded" ? "manageSettings" : "operate");
    const d = z.object({ id: uuid, status: z.enum(["confirmed", "refunded", "failed"]) }).parse(input);
    const { data, error } = await staff.supabase.from("payments").update({ status: d.status }).eq("id", d.id).select("order_id").maybeSingle();
    if (error) return { ok: false, message: dbMessage(error) };
    if (!data) return { ok: false, message: "Payment not found." };
    revalidatePath("/payments");
    revalidatePath("/requests", "layout");
    return { ok: true, message: d.status === "confirmed" ? "Payment confirmed" : d.status === "refunded" ? "Marked as refunded" : "Marked as failed" };
  });
}

export async function deletePayment(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const { error } = await supabase.from("payments").delete().eq("id", uuid.parse(input.id));
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/payments");
    revalidatePath("/requests", "layout");
    return { ok: true, message: "Payment deleted" };
  });
}

/** Short-lived link to a payment proof in the private bucket. */
export async function proofUrl(input: { path: string }): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const path = z.string().min(3).max(500).parse(input.path);
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 120);
    if (error || !data) return { ok: false, message: "Could not open the proof." };
    return { ok: true, data: data.signedUrl };
  });
}

/** Run a product action: role/status checks in the database, then a signed POST to n8n. */
export async function runProductAction(input: { orderId: string; ref: string; actionId: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const d = z.object({ orderId: uuid, ref: z.string(), actionId: uuid }).parse(input);
    const { data: started, error } = await staff.supabase.rpc("admin_start_action_run", { p_order_id: d.orderId, p_action_id: d.actionId });
    if (error || !started) return { ok: false, message: dbMessage(error) };
    const job = started as { run_id: string; action: { key: string; label: string; payload_fields: string[] }; context: Record<string, unknown> };

    const admin = createAdminClient();
    const { data: secret } = await admin.rpc("svc_get_action_secret", { p_action_id: d.actionId });
    const s = (secret ?? {}) as { webhook_url?: string | null; signing_secret?: string | null };
    const finish = (status: "succeeded" | "failed", reply: N8nReply | null, errorText?: string | null, response?: unknown) =>
      admin.rpc("svc_apply_action_result", {
        p_run_id: job.run_id,
        p_status: status,
        p_service_data: (reply?.service_data ?? null) as Json,
        p_order_status: reply?.order_status ?? "",
        p_customer_note: reply?.customer_note ?? reply?.note ?? "",
        p_error: errorText ?? "",
        p_response: (response ?? null) as Json,
      });

    if (!s.webhook_url) {
      await finish("failed", null, "No webhook URL is saved for this action.");
      refresh(d.ref);
      return { ok: false, message: "No webhook URL is saved for this action. Add it under Products → Actions." };
    }

    // Secrets are sent only when the action lists their keys.
    let secrets: Record<string, unknown> = {};
    if (job.action.payload_fields.length) {
      const { data: fields } = await staff.supabase.from("product_service_fields").select("key, type").eq("type", "secret");
      const keys = (fields ?? []).map((f) => f.key).filter((k) => job.action.payload_fields.includes(k));
      if (keys.length) {
        const { data } = await admin.rpc("svc_get_order_secrets", { p_order_id: d.orderId, p_keys: keys });
        secrets = (data ?? {}) as Record<string, unknown>;
      }
    }

    const payload = { event: `action.${job.action.key}`, run_id: job.run_id, callback_url: `${adminUrl()}/api/n8n/callback`, ...job.context, secrets };
    const res = await postSigned(s.webhook_url, s.signing_secret ?? null, payload);
    await audit(staff, {
      action: "action.run",
      table: "orders",
      recordId: d.orderId,
      summary: `${d.ref}: ${job.action.label} → n8n ${res.ok ? `OK (${res.httpStatus})` : res.error}`,
    });

    if (!res.ok) {
      await finish("failed", null, res.error, res.json);
      refresh(d.ref);
      return { ok: false, message: res.error ?? "n8n returned an error." };
    }
    const reply = (res.json && typeof res.json === "object" ? res.json : {}) as N8nReply;
    if (reply.status === "succeeded" || reply.status === "failed") {
      const { data: applied } = await finish(reply.status, reply, reply.error ?? null, res.json);
      refresh(d.ref);
      const note = (applied as { note?: string } | null)?.note;
      return reply.status === "succeeded"
        ? { ok: true, message: note ? `Done. ${note}` : `${job.action.label}: done` }
        : { ok: false, message: reply.error ?? "The workflow reported a failure." };
    }
    // Accepted: stays "running" until n8n calls back.
    await admin.rpc("svc_apply_action_result", { p_run_id: job.run_id, p_status: "running", p_response: (res.json ?? null) as Json });
    refresh(d.ref);
    return { ok: true, message: `${job.action.label} started. The status updates when n8n reports back.` };
  });
}

/** Staff create a request for a customer (WhatsApp lead, referral, …). */
export async function createRequest(input: {
  userId: string;
  productId: string;
  packageId: string;
  billingCycle: "monthly" | "yearly";
  source: "admin" | "whatsapp" | "referral";
  values: FormValues;
  customerNote?: string;
}): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z
      .object({
        userId: uuid,
        productId: uuid,
        packageId: uuid,
        billingCycle: z.enum(["monthly", "yearly"]),
        source: z.enum(["admin", "whatsapp", "referral"]),
        values: z.record(z.string(), z.unknown()),
        customerNote: z.string().max(2000).optional(),
      })
      .parse(input);
    const { data: product } = await supabase.from("products").select("onboarding_form_id").eq("id", d.productId).maybeSingle();
    let answers: unknown[] = [];
    if (product?.onboarding_form_id) {
      const { data: raw } = await supabase.from("forms").select("*, steps:form_steps(*, fields:form_fields(*))").eq("id", product.onboarding_form_id).maybeSingle();
      if (raw) {
        const form = parseForm(raw);
        const result = validateForm(form, sanitizeValues(form, d.values));
        if (!result.ok) return { ok: false, message: "Some answers are not valid.", fieldErrors: result.errors };
        answers = buildAnswers(form, result.values);
      }
    }
    const { data, error } = await supabase.rpc("admin_create_order", {
      p: {
        user_id: d.userId,
        product_id: d.productId,
        package_id: d.packageId,
        billing_cycle: d.billingCycle,
        answers,
        form_id: product?.onboarding_form_id ?? "",
        source: d.source,
        customer_note: d.customerNote ?? "",
      } as unknown as Json,
    });
    if (error || !data) return { ok: false, message: dbMessage(error) };
    refresh();
    return { ok: true, message: "Request created", data: (data as { ref: string }).ref };
  });
}
