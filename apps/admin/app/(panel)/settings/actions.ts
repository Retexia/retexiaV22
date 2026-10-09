"use server";

import type { Json } from "@retexia/supabase";
import { createAdminClient } from "@retexia/supabase/admin";
import { colorTokens, lengthTokens } from "@retexia/ui/tokens";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { postSigned } from "@/lib/n8n";
import { rateLimit } from "@/lib/rate-limit";
import { revalidateWebsite } from "@/lib/revalidate";

const uuid = z.uuid();
const text = (max: number) => z.string().max(max).transform((v) => (v.trim() ? v.trim() : null));
const url = z.string().trim().max(500).refine((v) => v === "" || /^(https?:\/\/|\/)/.test(v), "Use a full link (https://…) or a path (/…)").transform((v) => v || null);
const COLOR = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.\s,/%]+\)|hsla?\(\s*[\d.\s,/%deg]+\))$/i;
const LENGTH = /^\d{1,4}(?:\.\d{1,3})?(?:px|rem)$/;

async function saved(message: string): Promise<ActionResult> {
  revalidatePath("/", "layout");
  const live = await revalidateWebsite("site_settings");
  return { ok: true, message: live ? `${message} · live on website` : message };
}

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

const general = z
  .object({
    site_name: z.string().trim().min(1).max(80),
    tagline: text(200),
    contact_email: z.union([z.email(), z.literal("")]).transform((v) => v || null),
    contact_phone: text(40),
    whatsapp_number: z.string().trim().max(20).regex(/^\+?[0-9 ]*$/, "Digits only, with country code").transform((v) => v || null),
    whatsapp_default_message: text(300),
    address: text(400),
    business_hours: text(200),
    logo_url: url,
    logo_dark_url: url,
    favicon_url: url,
    og_image_url: url,
    seo_title_template: z.string().trim().max(80).refine((v) => v.includes("%s"), "Must contain %s (the page title)"),
    seo_default_title: text(80),
    seo_default_description: text(200),
    footer_text: text(400),
    copyright_text: text(200),
    social_links: z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.url() })).max(12),
    announcement_enabled: z.boolean(),
    announcement_text: text(200),
    announcement_href: url,
    maintenance_mode: z.boolean(),
    maintenance_message: text(600),
    default_theme: z.enum(["light", "dark", "system"]),
    currency_code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    currency_locale: z.string().trim().min(2).max(20),
    auth_google_enabled: z.boolean(),
    auth_magic_link_enabled: z.boolean(),
  })
  .partial();

export async function saveGeneralSettings(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const d = general.parse(input);
    if (d.announcement_enabled && d.announcement_text === null) return { ok: false, message: "Write the announcement text.", fieldErrors: { announcement_text: "Required" } };
    const { error } = await supabase.from("site_settings").update(d).eq("id", 1);
    if (error) return { ok: false, message: dbMessage(error) };
    return saved("Settings saved");
  });
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Only known tokens with valid colours/lengths are stored (the website re-checks). */
export async function saveTheme(input: { theme: Record<string, unknown> }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const theme: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(z.record(z.string(), z.unknown()).parse(input.theme))) {
      if (key in colorTokens) {
        const v = z.object({ light: z.string().optional(), dark: z.string().optional() }).parse(value);
        const out: Record<string, string> = {};
        for (const mode of ["light", "dark"] as const) {
          const c = v[mode]?.trim();
          if (!c) continue;
          if (!COLOR.test(c)) return { ok: false, message: `${key} (${mode}): “${c}” is not a colour.` };
          out[mode] = c;
        }
        if (Object.keys(out).length) theme[key] = out;
      } else if (key in lengthTokens) {
        const v = z.string().trim().parse(value);
        if (!v) continue;
        if (!LENGTH.test(v)) return { ok: false, message: `${key}: use px or rem, e.g. 12px.` };
        theme[key] = v;
      } else {
        return { ok: false, message: `Unknown setting “${key}”.` };
      }
    }
    const { error } = await supabase.from("site_settings").update({ theme: theme as Json }).eq("id", 1);
    if (error) return { ok: false, message: dbMessage(error) };
    return saved(Object.keys(theme).length ? "Theme saved" : "Theme reset to the Retexia defaults");
  });
}

// ---------------------------------------------------------------------------
// Payments and receipts
// ---------------------------------------------------------------------------

export async function savePaymentSettings(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const d = z
      .object({
        invoice_business_name: text(120),
        invoice_address: text(400),
        invoice_footer: text(600),
        invoice_logo_url: url,
        receipt_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, "2–8 letters or digits"),
      })
      .parse(input);
    const { error } = await supabase.from("site_settings").update(d).eq("id", 1);
    if (error) return { ok: false, message: dbMessage(error) };
    return saved("Payment settings saved");
  });
}

// ---------------------------------------------------------------------------
// Statuses and transitions
// ---------------------------------------------------------------------------

const CORE_STATUSES = ["submitted", "reviewing", "awaiting_payment", "setting_up", "active", "paused", "cancelled", "rejected"];

export async function saveStatus(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const d = z
      .object({
        isNew: z.boolean(),
        key: z.string().regex(/^[a-z][a-z0-9_]*$/, "Lowercase letters, numbers and underscores").max(40),
        label: z.string().trim().min(1).max(60),
        description: text(400),
        tone: z.enum(["neutral", "brand", "success", "warning", "danger"]),
        is_final: z.boolean(),
        customer_can_cancel: z.boolean(),
        is_visible: z.boolean(),
        sort_order: z.number().int().min(0).max(1000),
      })
      .parse(input);
    const { isNew, ...row } = d;
    const { error } = isNew ? await supabase.from("order_statuses").insert(row) : await supabase.from("order_statuses").update(row).eq("key", d.key);
    if (error) return { ok: false, message: dbMessage(error) };
    return saved("Status saved");
  });
}

export async function deleteStatus(input: { key: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const key = z.string().max(40).parse(input.key);
    if (CORE_STATUSES.includes(key)) return { ok: false, message: "Built-in statuses can be renamed or hidden, not deleted." };
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", key);
    if (count) return { ok: false, message: `${count} request${count === 1 ? " uses" : "s use"} this status.` };
    const { error } = await supabase.from("order_statuses").delete().eq("key", key);
    if (error) return { ok: false, message: dbMessage(error) };
    return saved("Status deleted");
  });
}

export async function saveTransition(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const d = z
      .object({
        id: uuid.optional(),
        from_status: z.string().max(40),
        to_status: z.string().max(40),
        action_label: z.string().trim().min(1).max(60),
        min_roles: z.array(z.enum(["support", "editor", "admin", "owner"])).min(1),
        requires_confirmed_payment: z.boolean(),
        requires_reason: z.boolean(),
        notify_customer_default: z.boolean(),
        customer_note_template: text(2000),
      })
      .parse(input);
    if (d.from_status === d.to_status) return { ok: false, message: "Pick two different statuses." };
    const { id, ...row } = d;
    const { error } = id ? await supabase.from("order_status_transitions").update(row).eq("id", id) : await supabase.from("order_status_transitions").insert({ ...row, sort_order: 50 });
    if (error) return { ok: false, message: error.code === "23505" ? "That change already exists." : dbMessage(error) };
    revalidatePath("/settings/statuses");
    revalidatePath("/requests", "layout");
    return { ok: true, message: "Saved" };
  });
}

export async function deleteTransition(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const { error } = await supabase.from("order_status_transitions").delete().eq("id", uuid.parse(input.id));
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/settings/statuses");
    return { ok: true, message: "Removed" };
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const channelCfg = z.object({ email: z.boolean(), whatsapp: z.boolean() });

export async function saveNotificationSettings(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const d = z
      .object({
        customer: z.record(z.enum(["order.created", "order.status_changed", "payment.confirmed"]), channelCfg),
        staff_events: z.array(z.enum(["order.created", "contact.created", "payment.proof_uploaded"])),
        staff_notification_emails: z
          .string()
          .max(1000)
          .transform((v) => v.split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))
          .pipe(z.array(z.email("One of the emails is not valid")).max(20)),
      })
      .parse(input);
    const { error } = await supabase
      .from("staff_settings")
      .update({ notification_settings: { ...d.customer, staff_events: d.staff_events } as Json, staff_notification_emails: d.staff_notification_emails.join(", ") || null })
      .eq("id", 1);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/settings/notifications");
    return { ok: true, message: "Notification settings saved" };
  });
}

/** Re-send a notification to the n8n notifications webhook (signed with the callback secret). */
export async function retryNotification(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const id = uuid.parse(input.id);
    if (!(await rateLimit(`retry:${staff.user.id}`, 30, 60_000))) return { ok: false, message: "Too many retries. Wait a minute." };
    const { data: n } = await staff.supabase.from("notifications_outbox").select("*").eq("id", id).maybeSingle();
    if (!n) return { ok: false, message: "Notification not found." };
    const admin = createAdminClient();
    const { data: settings } = await admin.rpc("svc_get_integration_settings");
    const s = (settings ?? {}) as { notifications_webhook_url?: string | null; n8n_callback_secret?: string | null };
    if (!s.notifications_webhook_url) return { ok: false, message: "Set the notifications webhook in Settings → Integrations first." };
    const res = await postSigned(s.notifications_webhook_url, s.n8n_callback_secret ?? null, { type: "INSERT", table: "notifications_outbox", schema: "public", record: n, retry: true });
    await admin
      .from("notifications_outbox")
      .update({ status: res.ok ? "pending" : "failed", error: res.ok ? null : res.error, attempts: (n.attempts ?? 0) + 1 })
      .eq("id", id);
    await audit(staff, { action: "notification.retry", table: "notifications_outbox", recordId: id, summary: `Retried ${n.event} to ${n.recipient ?? "?"}: ${res.ok ? "handed to n8n" : res.error}` });
    revalidatePath("/settings/notifications");
    return res.ok ? { ok: true, message: "Handed to n8n again" } : { ok: false, message: res.error ?? "n8n returned an error" };
  });
}

// ---------------------------------------------------------------------------
// Integrations (owner)
// ---------------------------------------------------------------------------

export async function saveIntegrations(input: { notifications_webhook_url?: string; rotateSecret?: boolean }): Promise<ActionResult<string>> {
  return run(async () => {
    const staff = await requireRole("manageTeam");
    if (!(await rateLimit(`integrations:${staff.user.id}`, 10, 60_000))) return { ok: false, message: "Too many changes. Wait a minute." };
    const d = z
      .object({ notifications_webhook_url: z.union([z.url({ protocol: /^https?$/ }), z.literal("")]).optional(), rotateSecret: z.boolean().optional() })
      .parse(input);
    const p: Record<string, string> = {};
    let secret: string | undefined;
    if (d.notifications_webhook_url !== undefined) p.notifications_webhook_url = d.notifications_webhook_url;
    if (d.rotateSecret) {
      secret = `whsec_${randomBytes(24).toString("hex")}`;
      p.n8n_callback_secret = secret;
    }
    if (!Object.keys(p).length) return { ok: true, message: "Nothing changed" };
    const { error } = await staff.supabase.rpc("admin_set_integration_settings", { p: p as Json });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/settings/integrations");
    // The new secret is returned once so the owner can copy it into n8n.
    return { ok: true, message: secret ? "New callback secret created. Copy it into n8n now." : "Saved", data: secret };
  });
}

export async function testNotificationsWebhook(): Promise<ActionResult<{ status: number; ms: number }>> {
  return run(async () => {
    const staff = await requireRole("manageTeam");
    if (!(await rateLimit(`webhook-test:${staff.user.id}`, 10, 60_000))) return { ok: false, message: "Too many tests. Wait a minute." };
    const admin = createAdminClient();
    const { data } = await admin.rpc("svc_get_integration_settings");
    const s = (data ?? {}) as { notifications_webhook_url?: string | null; n8n_callback_secret?: string | null };
    if (!s.notifications_webhook_url) return { ok: false, message: "Save a webhook URL first." };
    const res = await postSigned(s.notifications_webhook_url, s.n8n_callback_secret ?? null, { type: "PING", test: true, sent_by: staff.user.email, at: new Date().toISOString() });
    await audit(staff, { action: "integration.test", table: "integration_settings", recordId: "1", summary: `Tested notifications webhook: ${res.ok ? res.httpStatus : res.error}` });
    return res.ok ? { ok: true, message: `n8n answered ${res.httpStatus} in ${res.ms} ms`, data: { status: res.httpStatus, ms: res.ms } } : { ok: false, message: res.error ?? "No answer" };
  });
}
