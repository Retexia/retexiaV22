"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import type { OrderStatus } from "@/lib/lingo/db.types";
import { requireLingo } from "@/lib/lingo/session";
import { sendWhatsApp } from "@/lib/lingo/whatsapp";

const id = z.number().int().positive();
const lang = z.enum(["si", "singlish", "en", "ta"]);
const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// ---------------------------------------------------------------------------
// Bot and business
// ---------------------------------------------------------------------------

export async function setBotActive(input: { active: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const active = z.boolean().parse(input.active);
    const { error } = await db.from("lingo_users").update({ active, updated_at: new Date().toISOString() }).eq("id", tenant.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(active ? "Lingo is answering again." : "Lingo is paused. Customers' messages are not answered until you turn it back on.");
  });
}

const botSettings = z.object({
  business_name: z.string().trim().min(2, "Enter the business name").max(120),
  staff_name: opt(60),
  owner_phone: z.string().trim().max(20).regex(/^(\+?\d{9,15})?$/, "Digits only, with country code, e.g. 94771234567").transform((v) => v.replace(/^\+/, "") || null),
  default_language: lang,
  content_language: lang,
  followup_hours: z.number().int().min(1).max(72),
  delivery_days: z.number().int().min(1).max(30),
});

export async function saveBotSettings(input: z.input<typeof botSettings>): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const d = botSettings.parse(input);
    const { error } = await db.from("lingo_users").update({ ...d, updated_at: new Date().toISOString() }).eq("id", tenant.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved. Lingo uses it from the next message.");
  });
}

const details = z.object({
  business_type: opt(120),
  about: opt(2000),
  address: opt(400),
  location_url: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).transform((v) => v || null),
  opening_hours: opt(400),
  contact_phone: opt(40),
  website: opt(200),
  delivery_areas: opt(600),
  delivery_time: opt(200),
  default_delivery_fee: z.number().min(0).max(1_000_000),
  payment_methods: opt(400),
  extra_info: opt(2000),
});

export async function saveBusinessDetails(input: z.input<typeof details>): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const d = details.parse(input);
    const row = { ...d, lingo_user_id: tenant.id, updated_at: new Date().toISOString() };
    const { data: existing } = await db.from("business_details").select("id").eq("lingo_user_id", tenant.id).maybeSingle();
    const { error } = existing ? await db.from("business_details").update(row).eq("lingo_user_id", tenant.id) : await db.from("business_details").insert(row);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Business details saved. Lingo answers with them from the next message.");
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productInput = z.object({
  id: id.optional(),
  product_name: z.string().trim().min(1, "Enter a name").max(160),
  short_description: opt(400),
  long_description: opt(3000),
  price: z.number().min(0).max(100_000_000),
  delivery_fee: z.number().min(0).max(1_000_000).nullable(),
  ingredients: opt(2000),
  application: opt(2000),
  precautions: opt(2000),
  symptoms: opt(1000),
  aliases: opt(600),
  word_description: opt(600),
  picture_url: z.union([z.literal(""), z.url({ protocol: /^https$/ })]).transform((v) => v || null),
  active: z.boolean(),
});

export async function saveProduct(input: z.input<typeof productInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const { id: pid, ...d } = productInput.parse(input);
    const row = { ...d, updated_at: new Date().toISOString() };
    const { error } = pid
      ? await db.from("products").update(row).eq("id", pid).eq("lingo_user_id", tenant.id)
      : await db.from("products").insert({ ...row, lingo_user_id: tenant.id });
    if (error) return { ok: false, message: dbMessage(error) };
    return done(pid ? "Product saved" : "Product added. Lingo can talk about it now.");
  });
}

export async function deleteProduct(input: { id: number }): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const pid = id.parse(input.id);
    const { error } = await db.from("products").delete().eq("id", pid).eq("lingo_user_id", tenant.id);
    if (error) {
      if (error.code === "23503") {
        await db.from("products").update({ active: false }).eq("id", pid).eq("lingo_user_id", tenant.id);
        return done("This product has orders, so it was hidden instead of deleted.");
      }
      return { ok: false, message: dbMessage(error) };
    }
    return done("Product deleted");
  });
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Product photo for WhatsApp (public bucket "lingo-products", path starts with the account id). */
export async function uploadProductPhoto(form: FormData): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const file = form.get("file");
    if (!(file instanceof File)) return { ok: false, message: "Choose a photo." };
    const ext = PHOTO_TYPES[file.type];
    if (!ext) return { ok: false, message: "Use a JPG, PNG or WebP photo." };
    if (file.size > 5 * 1024 * 1024) return { ok: false, message: "Photos must be under 5 MB." };
    const path = `${tenant.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("lingo-products").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (error) return { ok: false, message: error.message.includes("Bucket") ? "Photo storage is not set up yet (run 0006_lingo_schema.sql)." : error.message };
    const { data } = db.storage.from("lingo-products").getPublicUrl(path);
    return { ok: true, message: "Photo uploaded", data: { url: data.publicUrl } };
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: ["confirmed"],
};

export async function setOrderStatus(input: { id: number; status: OrderStatus; cancel_reason?: string; notify: boolean; message?: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const d = z
      .object({
        id,
        status: z.enum(["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"]),
        cancel_reason: z.string().trim().max(300).optional(),
        notify: z.boolean(),
        message: z.string().trim().max(1500).optional(),
      })
      .parse(input);
    const { data: order } = await db.from("orders").select("id, status, customer_id").eq("id", d.id).eq("lingo_user_id", tenant.id).maybeSingle();
    if (!order) return { ok: false, message: "Order not found." };
    if (!NEXT[order.status].includes(d.status)) return { ok: false, message: `An order that is ${order.status} can't be marked ${d.status}.` };
    const { error } = await db
      .from("orders")
      .update({
        status: d.status,
        status_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(d.status === "cancelled" && d.cancel_reason ? { cancel_reason: d.cancel_reason } : {}),
      })
      .eq("id", d.id)
      .eq("lingo_user_id", tenant.id)
      .eq("status", order.status);
    if (error) return { ok: false, message: dbMessage(error) };
    if (d.notify && d.message) {
      const sent = await sendWhatsApp(tenant.id, order.customer_id, d.message);
      if (!sent.ok) return { ok: true, message: `Order updated, but the WhatsApp message failed: ${sent.error}` };
      return done("Order updated and the customer was told on WhatsApp.");
    }
    return done("Order updated");
  });
}

const orderEdit = z.object({
  id,
  quantity: z.number().int().min(1).max(999),
  delivery_fee: z.number().min(0).max(1_000_000),
  customer_name: opt(120),
  address: opt(400),
  delivery_phone: opt(20),
});

export async function updateOrder(input: z.input<typeof orderEdit>): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const { id: oid, ...d } = orderEdit.parse(input);
    const { error } = await db.from("orders").update({ ...d, updated_at: new Date().toISOString() }).eq("id", oid).eq("lingo_user_id", tenant.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Order details saved");
  });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function setCustomerBotPaused(input: { id: number; paused: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const d = z.object({ id, paused: z.boolean() }).parse(input);
    const { error } = await db.from("customers").update({ bot_paused: d.paused, updated_at: new Date().toISOString() }).eq("id", d.id).eq("lingo_user_id", tenant.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(d.paused ? "Lingo stopped for this customer. Reply to them yourself on WhatsApp." : "Lingo answers this customer again.");
  });
}

export async function sendCustomerMessage(input: { id: number; text: string }): Promise<ActionResult> {
  return run(async () => {
    const { tenant } = await requireLingo();
    const d = z.object({ id, text: z.string().trim().min(1).max(1500) }).parse(input);
    const sent = await sendWhatsApp(tenant.id, d.id, d.text);
    return sent.ok ? done("Sent on WhatsApp") : { ok: false, message: sent.error };
  });
}

// ---------------------------------------------------------------------------
// Bot replies (fixed_messages): your own version overrides the Retexia default
// ---------------------------------------------------------------------------

const replyKey = z.string().regex(/^[a-z][a-z0-9_]{1,60}$/);

export async function saveReply(input: { key: string; language: string; content: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const d = z.object({ key: replyKey, language: lang, content: z.string().trim().min(1, "Write the reply").max(3000) }).parse(input);
    const now = new Date().toISOString();
    const { data: own } = await db.from("fixed_messages").select("id").eq("lingo_user_id", tenant.id).eq("key", d.key).eq("language", d.language).maybeSingle();
    const { error } = own
      ? await db.from("fixed_messages").update({ content: d.content, updated_at: now }).eq("id", own.id)
      : await db.from("fixed_messages").insert({ lingo_user_id: tenant.id, key: d.key, language: d.language, content: d.content, updated_at: now });
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Reply saved");
  });
}

export async function resetReply(input: { key: string; language: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, tenant } = await requireLingo();
    const d = z.object({ key: replyKey, language: lang }).parse(input);
    const { error } = await db.from("fixed_messages").delete().eq("lingo_user_id", tenant.id).eq("key", d.key).eq("language", d.language);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Back to the Retexia default");
  });
}
