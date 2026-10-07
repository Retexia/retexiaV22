"use server";

import { productPageSections } from "@retexia/content";
import type { Json } from "@retexia/supabase";
import { createAdminClient } from "@retexia/supabase/admin";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { adminUrl } from "@/lib/env";
import { requireRole } from "@/lib/auth";
import { postSigned } from "@/lib/n8n";
import { revalidateWebsite } from "@/lib/revalidate";

const uuid = z.uuid();
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and dashes");
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a colour like #2a68d9");
const key = z.string().regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers and underscores");

/** After product/package changes: refresh admin pages and the website. */
async function refresh(): Promise<ActionResult> {
  revalidatePath("/products", "layout");
  revalidatePath("/", "layout");
  const live = await revalidateWebsite("products");
  return { ok: true, message: live ? "Saved · live on website" : "Saved" };
}

const packageInput = z.object({
  slug,
  name: z.string().trim().min(1).max(120),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  price_monthly: z.number().min(0),
  price_yearly: z.number().min(0).nullable(),
  setup_fee: z.number().min(0),
  currency: z.string().max(3).optional(),
  badge: z.string().max(60).optional(),
  is_featured: z.boolean(),
  cta_label: z.string().max(60).optional(),
  fine_print: z.string().max(1000).optional(),
  features: z.array(z.object({ label: z.string().trim().min(1).max(200), included: z.boolean() })).max(40),
});

export async function createProduct(input: unknown): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = z
      .object({
        name: z.string().trim().min(2).max(80),
        short_name: z.string().trim().min(1).max(40),
        slug,
        code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Three capital letters"),
        icon: z.string().max(60),
        tagline: z.string().max(200),
        description: z.string().max(2000),
        color_light: hex,
        color_dark: hex,
        color_soft_light: hex,
        color_soft_dark: hex,
        packages: z.array(packageInput).max(10),
        form: z.object({ mode: z.enum(["blank", "clone"]), from_product_id: uuid.optional() }),
      })
      .parse(input);
    const sections = productPageSections(d.name, d.slug, d.packages.length > 0);
    const { data, error } = await supabase.rpc("admin_create_product", {
      p: { ...d, sections, form: d.form.mode === "clone" ? d.form : { mode: "blank" } } as unknown as Json,
    });
    if (error || !data) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: `${d.name} created (hidden)`, data: d.slug };
  });
}

export async function duplicateProduct(input: { productId: string; slug: string; name: string }): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = z.object({ productId: uuid, slug, name: z.string().trim().min(2).max(80) }).parse(input);
    const { error } = await supabase.rpc("admin_duplicate_product", { p_product_id: d.productId, p_new_slug: d.slug, p_new_name: d.name });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: `${d.name} created as a hidden copy`, data: d.slug };
  });
}

export async function reorder(input: { table: string; ids: string[] }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("editContent");
    const d = z.object({ table: z.string().max(60), ids: z.array(uuid).max(500) }).parse(input);
    const { error } = await supabase.rpc("admin_reorder", { p_table: d.table, p_ids: d.ids });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    const live = await revalidateWebsite(d.table);
    return { ok: true, message: live ? "Order saved · live on website" : "Order saved" };
  });
}

export async function updateProduct(input: { id: string; changes: Record<string, unknown> }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = z
      .object({
        id: uuid,
        changes: z
          .object({
            name: z.string().trim().min(2).max(80),
            short_name: z.string().trim().min(1).max(40),
            slug,
            code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
            tagline: z.string().max(200).nullable(),
            description: z.string().max(4000).nullable(),
            icon: z.string().max(60).nullable(),
            color_light: hex,
            color_dark: hex,
            color_soft_light: hex,
            color_soft_dark: hex,
            status: z.enum(["live", "coming_soon", "hidden"]),
            page_slug: z.string().max(80).nullable(),
            panel_url: z.union([z.url(), z.literal("")]).nullable(),
            panel_live: z.boolean(),
            onboarding_form_id: uuid.nullable(),
            is_visible: z.boolean(),
          })
          .partial()
          .strict(),
      })
      .parse(input);
    // A panel URL is the panel's address only (https://lingo.retexia.com): a path such as /account
    // would point at retexia.com pages, which the panel forwards away.
    const panelUrl = d.changes.panel_url ? new URL(d.changes.panel_url).origin : d.changes.panel_url;
    const changes = { ...d.changes, panel_url: panelUrl === "" ? null : panelUrl };
    if (changes.panel_url === undefined) delete changes.panel_url;
    const { error } = await supabase.from("products").update(changes).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return refresh();
  });
}

export async function saveProductFeature(input: { id?: string; productId: string; icon: string; title: string; description: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = z.object({ id: uuid.optional(), productId: uuid, icon: z.string().max(60), title: z.string().trim().min(1).max(120), description: z.string().max(400) }).parse(input);
    const row = { product_id: d.productId, icon: d.icon || null, title: d.title, description: d.description || null };
    const { error } = d.id
      ? await supabase.from("product_features").update(row).eq("id", d.id)
      : await supabase.from("product_features").insert({ ...row, sort_order: 999 });
    if (error) return { ok: false, message: dbMessage(error) };
    return refresh();
  });
}

export async function deleteRow(input: { table: string; id: string }): Promise<ActionResult> {
  return run(async () => {
    const tables: Record<string, "manageProducts" | "editContent"> = {
      product_features: "manageProducts",
      packages: "manageProducts",
      product_service_fields: "manageProducts",
      product_actions: "manageProducts",
      faqs: "editContent",
      services: "editContent",
      testimonials: "editContent",
      navigation_items: "editContent",
    };
    const d = z.object({ table: z.string(), id: uuid }).parse(input);
    const capability = tables[d.table];
    if (!capability) return { ok: false, message: "This can't be deleted here." };
    const { supabase } = await requireRole(capability);
    const { error } = await supabase.from(d.table as "faqs").delete().eq("id", d.id);
    if (error) {
      return { ok: false, message: error.code === "23503" ? "It's used by existing requests, so it can't be deleted. Hide it instead." : dbMessage(error) };
    }
    return refresh();
  });
}

export async function savePackage(input: { id?: string; productId: string; pkg: unknown; is_active: boolean; is_visible: boolean; price_note?: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const p = packageInput.parse(input.pkg);
    const productId = uuid.parse(input.productId);
    const row = {
      product_id: productId,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline || null,
      description: p.description || null,
      price_monthly: p.price_monthly,
      price_yearly: p.price_yearly,
      setup_fee: p.setup_fee,
      currency: p.currency || null,
      badge: p.badge || null,
      is_featured: p.is_featured,
      cta_label: p.cta_label || null,
      fine_print: p.fine_print || null,
      price_note: input.price_note || null,
      is_active: input.is_active,
      is_visible: input.is_visible,
    };
    let packageId = input.id;
    if (packageId) {
      const { error } = await supabase.from("packages").update(row).eq("id", uuid.parse(packageId));
      if (error) return { ok: false, message: dbMessage(error) };
    } else {
      const { data, error } = await supabase.from("packages").insert({ ...row, sort_order: 999 }).select("id").single();
      if (error || !data) return { ok: false, message: dbMessage(error) };
      packageId = data.id;
    }
    // Replace the feature list (order = array order).
    const { error: delError } = await supabase.from("package_features").delete().eq("package_id", packageId);
    if (delError) return { ok: false, message: dbMessage(delError) };
    if (p.features.length) {
      const { error } = await supabase
        .from("package_features")
        .insert(p.features.map((f, i) => ({ package_id: packageId!, label: f.label, included: f.included, sort_order: i + 1 })));
      if (error) return { ok: false, message: dbMessage(error) };
    }
    return refresh();
  });
}

const serviceFieldInput = z.object({
  id: uuid.optional(),
  productId: uuid,
  key,
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "number", "url", "select", "toggle", "date", "secret"]),
  options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).max(50),
  help_text: z.string().max(400),
  visible_to_customer: z.boolean(),
  required_for_status: z.string().nullable(),
  is_visible: z.boolean(),
});

export async function saveServiceField(input: z.input<typeof serviceFieldInput>): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = serviceFieldInput.parse(input);
    const row = {
      product_id: d.productId,
      key: d.key,
      label: d.label,
      type: d.type,
      options: d.options,
      help_text: d.help_text || null,
      visible_to_customer: d.type === "secret" ? false : d.visible_to_customer,
      required_for_status: d.required_for_status || null,
      is_visible: d.is_visible,
    };
    const { error } = d.id
      ? await supabase.from("product_service_fields").update(row).eq("id", d.id)
      : await supabase.from("product_service_fields").insert({ ...row, sort_order: 999 });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/products", "layout");
    return { ok: true, message: "Service field saved" };
  });
}

const actionInput = z.object({
  id: uuid.optional(),
  productId: uuid,
  key,
  label: z.string().trim().min(1).max(80),
  description: z.string().max(400),
  allowed_statuses: z.array(z.string()).max(20),
  min_roles: z.array(z.enum(["support", "editor", "admin", "owner"])).min(1),
  confirm_text: z.string().max(400),
  payload_fields: z.array(z.string()).max(100),
  on_success_status: z.string().nullable(),
  on_success_note: z.string().max(1000),
  is_enabled: z.boolean(),
  webhook_url: z.string().max(500).optional(),
  signing_secret: z.string().max(200).optional(),
});

export async function saveProductAction(input: z.input<typeof actionInput>): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = actionInput.parse(input);
    if (d.webhook_url && !/^https?:\/\//.test(d.webhook_url)) return { ok: false, message: "The webhook URL must start with https://", fieldErrors: { webhook_url: "Must start with https://" } };
    const row = {
      product_id: d.productId,
      key: d.key,
      label: d.label,
      description: d.description || null,
      allowed_statuses: d.allowed_statuses,
      min_roles: d.min_roles,
      confirm_text: d.confirm_text || null,
      payload_fields: d.payload_fields,
      on_success_status: d.on_success_status || null,
      on_success_note: d.on_success_note || null,
      is_enabled: d.is_enabled,
    };
    let actionId = d.id;
    if (actionId) {
      const { error } = await supabase.from("product_actions").update(row).eq("id", actionId);
      if (error) return { ok: false, message: dbMessage(error) };
    } else {
      const { data, error } = await supabase.from("product_actions").insert({ ...row, sort_order: 999 }).select("id").single();
      if (error || !data) return { ok: false, message: dbMessage(error) };
      actionId = data.id;
    }
    if (d.webhook_url !== undefined || d.signing_secret !== undefined) {
      const { error } = await supabase.rpc("admin_set_action_secret", {
        p_action_id: actionId,
        p_webhook_url: d.webhook_url ?? (null as unknown as string),
        p_signing_secret: d.signing_secret ?? (null as unknown as string),
      });
      if (error) return { ok: false, message: dbMessage(error) };
    }
    revalidatePath("/products", "layout");
    return { ok: true, message: "Action saved" };
  });
}

export async function generateSigningSecret(): Promise<string> {
  await requireRole("manageProducts");
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/** Send a sample payload to the action's webhook and show what n8n answered. */
export async function testProductAction(input: { actionId: string }): Promise<ActionResult<{ status: number; ms: number; body: unknown }>> {
  return run(async () => {
    const staff = await requireRole("manageProducts");
    const actionId = uuid.parse(input.actionId);
    const { data: action } = await staff.supabase.from("product_actions").select("key, label, product_id, products(slug, code, name)").eq("id", actionId).maybeSingle();
    if (!action) return { ok: false, message: "Action not found." };
    const admin = createAdminClient();
    const { data: secret } = await admin.rpc("svc_get_action_secret", { p_action_id: actionId });
    const s = (secret ?? {}) as { webhook_url?: string; signing_secret?: string };
    if (!s.webhook_url) return { ok: false, message: "Save a webhook URL first." };
    const product = action.products as { slug?: string; code?: string; name?: string } | null;
    const payload = {
      event: `action.${action.key}`,
      test: true,
      run_id: "00000000-0000-4000-8000-000000000000",
      callback_url: `${adminUrl()}/api/n8n/callback`,
      order: { id: "00000000-0000-4000-8000-000000000001", ref: `${product?.code ?? "TST"}-TEST-0000`, status: "setting_up", billing_cycle: "monthly", package_name: "Test package", price_amount: 0, setup_fee: 0, currency: "LKR" },
      customer: { id: null, full_name: "Test Customer", email: "test@example.com", phone: "+94770000000", whatsapp: "+94770000000", business_name: "Test Business" },
      package: { slug: "test", name: "Test package" },
      product: { slug: product?.slug, code: product?.code, name: product?.name },
      answers: {},
      service_data: {},
      secrets: {},
    };
    const res = await postSigned(s.webhook_url, s.signing_secret ?? null, payload);
    await audit(staff, { action: "action.test", table: "product_actions", recordId: actionId, summary: `Test sent to ${new URL(s.webhook_url).host}: ${res.ok ? res.httpStatus : res.error}` });
    if (!res.ok) return { ok: false, message: res.error ?? "n8n returned an error." };
    return { ok: true, message: `n8n answered ${res.httpStatus} in ${res.ms} ms`, data: { status: res.httpStatus, ms: res.ms, body: res.json } };
  });
}
