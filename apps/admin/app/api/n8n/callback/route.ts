import type { Json } from "@retexia/supabase";
import { createAdminClient } from "@retexia/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/n8n";

/**
 * n8n reports back here, signed with the n8n callback secret
 * (Settings → Integrations): headers X-Retexia-Timestamp and
 * X-Retexia-Signature = hex HMAC-SHA256 of `${timestamp}.${body}`.
 *
 * Product action result:
 *   { "run_id": "…", "status": "succeeded" | "failed", "service_data": {…},
 *     "order_status": "active", "customer_note": "…", "error": "…" }
 * Notification delivery:
 *   { "type": "notification", "notification_id": "…", "status": "sent" | "failed", "error": "…" }
 *
 * Idempotent: a run that already finished is not changed again.
 */
const actionSchema = z.object({
  run_id: z.uuid(),
  status: z.enum(["succeeded", "failed", "running"]),
  service_data: z.record(z.string(), z.unknown()).optional(),
  order_status: z.string().max(60).optional(),
  customer_note: z.string().max(4000).optional(),
  error: z.string().max(4000).optional(),
});
const notificationSchema = z.object({
  type: z.literal("notification"),
  notification_id: z.uuid(),
  status: z.enum(["sent", "failed"]),
  error: z.string().max(4000).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (body.length > 200_000) return NextResponse.json({ error: "Body too large" }, { status: 413 });
  const admin = createAdminClient();
  const { data: settings } = await admin.rpc("svc_get_integration_settings");
  const secret = (settings as { n8n_callback_secret?: string | null } | null)?.n8n_callback_secret ?? "";
  if (!secret) return NextResponse.json({ error: "Callback secret is not set (Settings → Integrations)" }, { status: 503 });
  const check = verifySignature(secret, request.headers.get("x-retexia-timestamp"), request.headers.get("x-retexia-signature"), body);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const note = notificationSchema.safeParse(json);
  if (note.success) {
    const n = note.data;
    const { data: current } = await admin.from("notifications_outbox").select("attempts").eq("id", n.notification_id).maybeSingle();
    if (!current) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    await admin
      .from("notifications_outbox")
      .update({
        status: n.status,
        error: n.error ?? null,
        attempts: (current.attempts ?? 0) + 1,
        sent_at: n.status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", n.notification_id);
    return NextResponse.json({ ok: true });
  }

  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const d = parsed.data;
  const { data, error } = await admin.rpc("svc_apply_action_result", {
    p_run_id: d.run_id,
    p_status: d.status,
    p_service_data: (d.service_data ?? null) as Json,
    p_order_status: d.order_status ?? "",
    p_customer_note: d.customer_note ?? "",
    p_error: d.error ?? "",
    p_response: json as Json,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "P0002" ? 404 : 400 });
  await admin.from("audit_logs").insert({
    actor_role: "n8n",
    action: "action.callback",
    table_name: "action_runs",
    record_id: d.run_id,
    summary: `n8n reported ${d.status}${d.order_status ? ` → ${d.order_status}` : ""}`,
    after: json as Json,
  });
  return NextResponse.json({ ok: true, result: data });
}
