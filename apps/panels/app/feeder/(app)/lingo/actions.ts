"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { lingoActor } from "@/lib/feeder/lingo/data";
import { botDb } from "@/lib/feeder/lingo/db";
import { engine } from "@/lib/feeder/lingo/engine";
import { FIXED, FIXED_KEYS, LIMIT, windowOpen } from "@/lib/feeder/lingo/labels";

const done = <T,>(message: string, data?: T): ActionResult<T> => {
  revalidatePath("/lingo", "layout");
  return { ok: true, message, data };
};
async function actor() {
  const a = await lingoActor();
  if (!a) throw new AccessError("Lingo isn't on your account, or you were signed out. Please sign in again.");
  return a;
}
const event = (id: number, type: string, detail: Record<string, unknown>, phone: string | null = null) =>
  botDb().from("bot_events").insert({ lingo_user_id: id, phone, type, detail });

const text = (max: number) => z.string().trim().max(max, `Up to ${max} characters`);
const optText = (max: number) => text(max).transform((v) => v || null);
const phoneKey = z.string().regex(/^\d{6,20}$/, "Unknown chat");

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  business_name: text(120).min(2, "Enter your shop's name"),
  shop_phone: optText(40),
  shop_address: optText(300),
  delivery_days: z.coerce.number().int().min(1).max(30),
  default_lang: z.enum(["si", "sg", "en"]),
  order_fields: z.array(z.enum(["name", "address", "contact"])).min(1, "Ask for at least one detail"),
  batch_seconds: z.coerce.number().int().min(2).max(30),
  handoff_pause_hours: z.coerce.number().int().min(1).max(168),
  reply_to_non_ad: z.boolean(),
  followups: z.object({
    hours: z.coerce.number().int().min(1).max(20),
    from: z.coerce.number().int().min(0).max(23),
    to: z.coerce.number().int().min(1).max(24),
    confirmed: z.boolean(),
    cancelled: z.boolean(),
    no_order: z.boolean(),
  }).refine((f) => f.to > f.from, { message: "The end hour must be after the start hour", path: ["to"] }),
  banned_claims: z.array(text(80)).max(50),
});
export async function saveSettings(input: z.input<typeof settingsSchema>) {
  return run(async () => {
    const { id } = await actor();
    const d = settingsSchema.parse(input);
    const db = botDb();
    const { error: e1 } = await db.from("lingo_users").update({ business_name: d.business_name }).eq("id", id);
    if (e1) return { ok: false, message: dbMessage(e1) };
    const { error } = await db
      .from("bot_sellers")
      .update({
        shop_phone: d.shop_phone, shop_address: d.shop_address, delivery_days: d.delivery_days, default_lang: d.default_lang,
        order_fields: d.order_fields, batch_seconds: d.batch_seconds, handoff_pause_hours: d.handoff_pause_hours,
        reply_to_non_ad: d.reply_to_non_ad, followups: d.followups, banned_claims: [...new Set(d.banned_claims.filter(Boolean))],
      })
      .eq("lingo_user_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Settings saved. Lingo uses them from the next message.");
  });
}

export async function setBotOn(on: boolean) {
  return run(async () => {
    const { id } = await actor();
    const db = botDb();
    const { data: s } = await db.from("bot_sellers").select("status").eq("lingo_user_id", id).single();
    if (s?.status === "blocked") return { ok: false, message: "Lingo is on hold for your account. Please contact Retexia." };
    if (on) {
      const { data: n } = await db.from("wa_numbers").select("status").eq("lingo_user_id", id).maybeSingle();
      if (!n) return { ok: false, message: "Connect your WhatsApp number first (WhatsApp tab)." };
      if (n.status !== "connected") return { ok: false, message: "Press Test connection on the WhatsApp tab first; Lingo turns on once your number answers." };
    }
    const { error } = await db.from("bot_sellers").update({ status: on ? "live" : "paused" }).eq("lingo_user_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    await event(id, on ? "bot_on" : "bot_off", {});
    return done(on ? "Lingo is on. It answers new messages from your ads." : "Lingo is off. New messages wait in your Inbox.");
  });
}

// ---------------------------------------------------------------------------
// WhatsApp number
// ---------------------------------------------------------------------------
const numberSchema = z.object({
  phone_number_id: z.string().trim().regex(/^\d{6,25}$/, "The Phone number ID is a long number (WhatsApp → API Setup)"),
  waba_id: z.string().trim().regex(/^(\d{6,25})?$/, "The WhatsApp Business Account ID is a long number").transform((v) => v || null),
  token: z.string().trim().max(1000).regex(/^(EA[A-Za-z0-9]{20,}|)$/, "That doesn't look like a permanent token (it starts with EA…)").transform((v) => v || null),
  app_secret: z.string().trim().max(200).regex(/^([a-f0-9]{32}|)$/i, "The App secret is 32 letters and numbers (App settings → Basic)").transform((v) => v || null),
});
export async function saveNumber(input: z.input<typeof numberSchema>) {
  return run(async () => {
    const { id } = await actor();
    const d = numberSchema.parse(input);
    const { data, error } = await botDb().rpc("save_wa_number", { p: { lingo_user_id: id, ...d } });
    if (error) return { ok: false, message: dbMessage(error) };
    const r = data as { ok: boolean; error?: string };
    if (!r.ok) {
      const msg: Record<string, string> = {
        taken: "This number is already connected to another Retexia account.",
        secrets: "Paste the permanent token and the App secret too (needed the first time).",
        phone_number_id: "Check the Phone number ID.",
        waba_id: "Check the WhatsApp Business Account ID.",
      };
      return { ok: false, message: msg[r.error ?? ""] ?? "Couldn't save the number." };
    }
    return done("Saved. Now press Test connection.");
  });
}

export async function checkNumber() {
  return run(async () => {
    const { id } = await actor();
    const db = botDb();
    const { data: n } = await db.from("wa_numbers").select("phone_number_id").eq("lingo_user_id", id).maybeSingle();
    if (!n) return { ok: false, message: "Save your number first." };
    const r = await engine<{ ok: boolean; error?: string | null; info?: Record<string, string> | null; subscribed?: boolean | null; subscribe_error?: string | null }>("check", id, {}, 30_000);
    if (!r.ok) return { ok: false, message: r.error };
    const a = r.data;
    await db.rpc("bot_save_check", { p: { phone_number_id: n.phone_number_id, ok: a.ok, error: a.error ?? null, info: a.info ?? {} } });
    revalidatePath("/lingo", "layout");
    if (!a.ok) return { ok: false, message: `WhatsApp said: ${a.error ?? "no answer"}. Check the token and the Phone number ID.` };
    const extra = a.subscribed === false ? " One more step: your app isn't subscribed to this WhatsApp account yet (step 6)." : "";
    return { ok: true, message: `Connected: ${a.info?.verified_name || "your number"} ${a.info?.display_phone_number || ""}.${extra}`.replace(/\s+\./, ".") };
  });
}

export async function removeNumber() {
  return run(async () => {
    const { id } = await actor();
    const { error } = await botDb().rpc("remove_wa_number", { p_seller: id });
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Number removed. Its token and App secret were deleted.");
  });
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------
export async function replyToChat(input: { phone: string; text: string }) {
  return run(async () => {
    const { id } = await actor();
    const phone = phoneKey.parse(input.phone);
    const body = text(4000).min(1, "Write a message").parse(input.text);
    const db = botDb();
    const { data: c } = await db.from("bot_customers").select("last_in_at").eq("lingo_user_id", id).eq("phone", phone).eq("test", false).maybeSingle();
    if (!c) return { ok: false, message: "This chat doesn't exist." };
    if (!windowOpen(c.last_in_at)) return { ok: false, message: "WhatsApp only allows free text within 24 hours of the customer's last message." };
    const r = await engine<{ ok: boolean; wa_id?: string | null; error?: string | null }>("send", id, { to: phone, text: body });
    if (!r.ok) return { ok: false, message: r.error };
    if (!r.data.ok) return { ok: false, message: `WhatsApp didn't send it: ${r.data.error ?? "unknown error"}` };
    const { data: s } = await db.from("bot_sellers").select("handoff_pause_hours").eq("lingo_user_id", id).single();
    await db.from("bot_messages").insert({ lingo_user_id: id, phone, role: "seller", content: body, wa_id: r.data.wa_id, status: "sent" });
    const until = new Date(Date.now() + Number(s?.handoff_pause_hours ?? 12) * 3600_000).toISOString();
    await db.from("bot_customers").update({ needs_seller: false, paused_until: until, last_msg_at: new Date().toISOString() }).eq("lingo_user_id", id).eq("phone", phone);
    return done("Sent. Lingo stays paused for this chat until you resume it.");
  });
}

export async function setChatPaused(input: { phone: string; paused: boolean }) {
  return run(async () => {
    const { id } = await actor();
    const phone = phoneKey.parse(input.phone);
    const db = botDb();
    if (input.paused) {
      const until = new Date(Date.now() + 365 * 86400_000).toISOString();
      const { error } = await db.from("bot_customers").update({ paused_until: until }).eq("lingo_user_id", id).eq("phone", phone);
      if (error) return { ok: false, message: dbMessage(error) };
      await event(id, "chat_paused", {}, phone);
      return done("Lingo is paused for this chat. You answer it.");
    }
    const { data: o } = await db.from("bot_orders").select("status, name, address, contact").eq("lingo_user_id", id).eq("phone", phone).order("id", { ascending: false }).limit(1).maybeSingle();
    const stage = o?.status === "confirmed" ? "ordered" : o?.status === "draft" && (o.name || o.address || o.contact) ? "collecting" : "browsing";
    const { error } = await db.from("bot_customers").update({ paused_until: null, needs_seller: false, unsure_streak: 0, handoff_reason: null, stage }).eq("lingo_user_id", id).eq("phone", phone);
    if (error) return { ok: false, message: dbMessage(error) };
    await event(id, "chat_resumed", {}, phone);
    return done("Lingo answers this chat again from the next message.");
  });
}

/** 👍 / 👎 on a bot reply. A 👎 with the right answer becomes an FAQ (and a test case), so next time Lingo answers it without AI. */
export async function rateMessage(input: { id: number; rating: 1 | -1; correction?: string }) {
  return run(async () => {
    const { id } = await actor();
    const db = botDb();
    const { data: msg } = await db.from("bot_messages").select("id, phone, meta, role").eq("lingo_user_id", id).eq("id", Number(input.id)).maybeSingle();
    if (!msg || msg.role !== "b") return { ok: false, message: "That message isn't from Lingo." };
    if (input.rating === 1) {
      await db.from("bot_messages").update({ rating: 1, correction: null }).eq("id", msg.id);
      return done("Thanks, noted.");
    }
    const correction = text(1000).min(2, "Write the answer Lingo should have given").parse(input.correction ?? "");
    const { data: prev } = await db.from("bot_messages").select("role, content").eq("lingo_user_id", id).eq("phone", msg.phone).lt("id", msg.id).order("id", { ascending: false }).limit(10);
    const asked: string[] = [];
    for (const m of prev ?? []) { if (m.role !== "c") break; asked.unshift(m.content); }
    const customerText = asked.join(" ").slice(0, 200);
    const meta = (msg.meta ?? {}) as { q?: string; pid?: number; k?: string; t?: string };
    const { data: cust } = await db.from("bot_customers").select("lang, stage").eq("lingo_user_id", id).eq("phone", msg.phone).single();
    const question = (meta.q || customerText || "Customer question").slice(0, 200);
    let faqId: number | null = null;
    if (meta.pid) {
      const own = await db.from("products").select("id, product_id_feeder").eq("lingo_user_id", id).eq("id", meta.pid).maybeSingle();
      if (own.data) {
        const { data: faq, error } = await db
          .from("product_faqs")
          .insert({
            lingo_user_id: id, product_id: own.data.id, question_en: question.length >= 3 ? question : "Customer question",
            variants: customerText ? [customerText] : [], answer_si: cust?.lang === "en" ? null : correction, answer_en: cust?.lang === "en" ? correction : null, source: "correction",
          })
          .select("id")
          .single();
        if (error) return { ok: false, message: dbMessage(error) };
        faqId = faq.id;
        await db.from("eval_cases").insert({
          lingo_user_id: id, source: "correction",
          input: { messages: asked, product: meta.pid, stage: cust?.stage ?? null },
          expected: { k: "question", t: meta.t ?? null, p: 0, faq: faqId },
        });
      }
    }
    await db.from("bot_messages").update({ rating: -1, correction }).eq("id", msg.id);
    return done(faqId ? "Saved as an FAQ: next time Lingo answers this from your words, without AI." : "Saved. (No product was set for this chat, so it couldn't become an FAQ.)");
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const orderSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: optText(80),
  address: optText(300),
  contact: optText(40),
  qty: z.coerce.number().int().min(1).max(99),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  delivery_status: z.enum(["", "dispatched", "delivered", "returned"]).transform((v) => v || null),
  cancel_reason: optText(300),
});
export async function saveOrder(input: z.input<typeof orderSchema>) {
  return run(async () => {
    const { id } = await actor();
    const d = orderSchema.parse(input);
    const db = botDb();
    const { data: o } = await db.from("bot_orders").select("id, phone, status, unit_price, delivery_fee").eq("lingo_user_id", id).eq("id", d.id).maybeSingle();
    if (!o) return { ok: false, message: "Order not found." };
    if (d.status === "confirmed" && (!d.name || !d.address || !d.contact)) return { ok: false, message: "A confirmed order needs a name, address and phone number." };
    const total = Number(o.unit_price ?? 0) * d.qty + Number(o.delivery_fee ?? 0);
    const confirming = d.status === "confirmed" && o.status !== "confirmed";
    const { error } = await db
      .from("bot_orders")
      .update({
        name: d.name, address: d.address, contact: d.contact, qty: d.qty, total, status: d.status, delivery_status: d.delivery_status, cancel_reason: d.cancel_reason,
        ...(confirming ? { confirmed_at: new Date().toISOString(), feeder_sync: "pending", exported_at: null } : {}),
      })
      .eq("id", o.id);
    if (error) return { ok: false, message: dbMessage(error) };
    if (confirming) await db.from("bot_customers").update({ stage: "ordered" }).eq("lingo_user_id", id).eq("phone", o.phone);
    await event(id, "order_edited", { order_id: o.id, status: d.status }, o.phone);
    return done("Order saved.");
  });
}

export async function setOrderExport(input: { id: number; pending: boolean }) {
  return run(async () => {
    const { id } = await actor();
    const { error } = await botDb()
      .from("bot_orders")
      .update(input.pending ? { feeder_sync: "pending", exported_at: null } : { feeder_sync: "done", exported_at: new Date().toISOString() })
      .eq("lingo_user_id", id)
      .eq("id", Number(input.id))
      .eq("status", "confirmed");
    if (error) return { ok: false, message: dbMessage(error) };
    return done(input.pending ? "It goes into your next courier file." : "Marked as sent to Feeder.");
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
const productSchema = z.object({
  id: z.coerce.number().int().positive(),
  product_name: optText(200),
  short_description: optText(300),
  long_description: optText(1024),
  ingredients: optText(2000),
  application: optText(2000),
  precautions: optText(2000),
  symptoms: optText(1000),
  aliases: optText(1000),
  picture_url: z.string().trim().max(500).refine((v) => !v || /^https:\/\/\S+$/.test(v), "Use a public https:// link to the photo").transform((v) => v || null),
  price: z.coerce.number().min(0).max(10_000_000),
  delivery_fee: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000)]).transform((v) => (v === "" ? null : v)),
  active: z.boolean(),
});
export async function saveProduct(input: z.input<typeof productSchema>) {
  return run(async () => {
    const { id } = await actor();
    const d = productSchema.parse(input);
    const db = botDb();
    const { data: p } = await db.from("products").select("id, product_name").eq("lingo_user_id", id).eq("id", d.id).maybeSingle();
    if (!p) return { ok: false, message: "Product not found." };
    const { error } = await db
      .from("products")
      .update({ ...d, product_name: d.product_name ?? p.product_name, id: undefined })
      .eq("id", p.id)
      .eq("lingo_user_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Product saved. Saved answers for it are refreshed automatically.");
  });
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------
const faqSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  product_id: z.coerce.number().int().positive(),
  question_en: text(200).min(3, "Write the question in short English"),
  variants: z.array(text(200)).max(20),
  answer_si: optText(1000),
  answer_en: optText(1000),
  active: z.boolean(),
}).refine((f) => f.answer_si || f.answer_en, { message: "Write the answer in Sinhala or English", path: ["answer_si"] });
export async function saveFaq(input: z.input<typeof faqSchema>) {
  return run(async () => {
    const { id } = await actor();
    const d = faqSchema.parse(input);
    const db = botDb();
    const { data: p } = await db.from("products").select("id").eq("lingo_user_id", id).eq("id", d.product_id).maybeSingle();
    if (!p) return { ok: false, message: "Product not found." };
    const row = { question_en: d.question_en, variants: d.variants.filter(Boolean), answer_si: d.answer_si, answer_en: d.answer_en, active: d.active };
    const { error } = d.id
      ? await db.from("product_faqs").update(row).eq("id", d.id).eq("lingo_user_id", id)
      : await db.from("product_faqs").insert({ ...row, lingo_user_id: id, product_id: p.id, source: "manual" });
    if (error) return { ok: false, message: dbMessage(error) };
    return done(d.id ? "FAQ saved." : "FAQ added. Lingo can use it from the next message.");
  });
}
export async function deleteFaq(faqId: number) {
  return run(async () => {
    const { id } = await actor();
    const { error } = await botDb().from("product_faqs").delete().eq("id", Number(faqId)).eq("lingo_user_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("FAQ deleted.");
  });
}
export async function hideSharedFaq(input: { id: number; hidden: boolean }) {
  return run(async () => {
    const { id } = await actor();
    const db = botDb();
    const { data: s } = await db.from("bot_sellers").select("hidden_faqs").eq("lingo_user_id", id).single();
    const set = new Set((s?.hidden_faqs ?? []).map(Number));
    if (input.hidden) set.add(Number(input.id));
    else set.delete(Number(input.id));
    const { error } = await db.from("bot_sellers").update({ hidden_faqs: [...set] }).eq("lingo_user_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(input.hidden ? "Lingo won't use this shared FAQ for you." : "Shared FAQ switched back on.");
  });
}
export async function promoteAnswer(key: string) {
  return run(async () => {
    const { id } = await actor();
    const db = botDb();
    const { data: c } = await db.from("answer_cache").select("*").eq("key", String(key)).maybeSingle();
    if (!c) return { ok: false, message: "That answer is gone (the product changed)." };
    const { data: p } = await db.from("products").select("id").eq("lingo_user_id", id).eq("id", c.product_id).maybeSingle();
    if (!p) return { ok: false, message: "That answer isn't for one of your products." };
    const { error } = await db.from("product_faqs").insert({
      lingo_user_id: id, product_id: p.id, question_en: String(c.q).trim().length >= 3 ? String(c.q).trim().slice(0, 200) : "Customer question", variants: [],
      answer_si: c.lang === "en" ? null : c.answer, answer_en: c.lang === "en" ? c.answer : null, source: "cache",
    });
    if (error) return { ok: false, message: dbMessage(error) };
    await db.from("answer_cache").update({ promoted: true }).eq("key", c.key);
    return done("Made into an FAQ. You can edit its wording any time.");
  });
}

// ---------------------------------------------------------------------------
// Ads, texts, rules
// ---------------------------------------------------------------------------
export async function setAdProduct(input: { ad_id: string; product_id: number | null }) {
  return run(async () => {
    const { id } = await actor();
    const db = botDb();
    if (input.product_id) {
      const { data: p } = await db.from("products").select("id").eq("lingo_user_id", id).eq("id", Number(input.product_id)).maybeSingle();
      if (!p) return { ok: false, message: "Product not found." };
    }
    const { error } = await db.from("bot_ads").update({ product_id: input.product_id ? Number(input.product_id) : null, auto_matched: false, match_tried: true }).eq("lingo_user_id", id).eq("ad_id", String(input.ad_id));
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved. New customers from this ad get this product.");
  });
}

const kindOf = (key: string) => FIXED.flatMap((g) => g.items).find((i) => i.key === key)?.kind ?? "text";
export async function saveFixedText(input: { key: string; si: string; en: string }) {
  return run(async () => {
    const { id } = await actor();
    if (!FIXED_KEYS.includes(input.key)) return { ok: false, message: "Unknown text." };
    const limit = LIMIT[kindOf(input.key)];
    const si = String(input.si ?? "").trim();
    const en = String(input.en ?? "").trim();
    if (Array.from(si).length > limit || Array.from(en).length > limit) return { ok: false, message: `WhatsApp allows up to ${limit} characters here.` };
    const db = botDb();
    const { error } = await db.from("bot_fixed_messages").upsert({ key: input.key, lingo_user_id: id, text_si: si, text_en: en }, { onConflict: "key,lingo_user_id" });
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved. Customers get your wording from the next message.");
  });
}
export async function resetFixedText(key: string) {
  return run(async () => {
    const { id } = await actor();
    const { error } = await botDb().from("bot_fixed_messages").delete().eq("lingo_user_id", id).eq("key", String(key));
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Back to Retexia's text.");
  });
}

const STAGES = ["new", "browsing", "collecting", "confirming", "ordered", "cancelled"] as const;
const ruleSchema = z.object({
  pattern: text(400).min(2).refine((p) => { try { new RegExp(p, "iu"); return true; } catch { return false; } }, "That pattern isn't valid"),
  stage_in: z.array(z.enum(STAGES)).max(6),
  k: z.enum(["details", "confirm", "change", "cancel", "question", "complaint", "human", "chat"]),
  t: z.enum(["", "price", "delivery", "payment", "stock", "contact", "shop"]).transform((v) => v || null),
  note: optText(120),
});
export async function saveRule(input: z.input<typeof ruleSchema>) {
  return run(async () => {
    const { id } = await actor();
    const d = ruleSchema.parse(input);
    if (d.k === "question" && !d.t) return { ok: false, message: "Pick which question it answers.", fieldErrors: { t: "Pick a topic" } };
    const { error } = await botDb().from("quick_rules").insert({ ...d, lingo_user_id: id, priority: 1 });
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Rule added. It's checked before the AI from the next message.");
  });
}
export async function deleteRule(ruleId: number) {
  return run(async () => {
    const { id } = await actor();
    const { error } = await botDb().from("quick_rules").delete().eq("id", Number(ruleId)).eq("lingo_user_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Rule deleted.");
  });
}
export async function toggleGlobalRule(input: { id: number; off: boolean }) {
  return run(async () => {
    const { id } = await actor();
    const db = botDb();
    const { data: s } = await db.from("bot_sellers").select("disabled_rules").eq("lingo_user_id", id).single();
    const set = new Set((s?.disabled_rules ?? []).map(Number));
    if (input.off) set.add(Number(input.id));
    else set.delete(Number(input.id));
    const { error } = await db.from("bot_sellers").update({ disabled_rules: [...set] }).eq("lingo_user_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(input.off ? "Rule switched off for you." : "Rule switched on.");
  });
}

// ---------------------------------------------------------------------------
// Test bot
// ---------------------------------------------------------------------------
export type TestReply = {
  ok: boolean; stopped?: string; route?: string; stage?: string; lang?: string; handoff?: { reason: string } | null; log?: string;
  messages?: { text: string; body: Record<string, unknown>; pid: number | null }[];
  ai?: { stage: string; model: string; in: number; out: number }[]; cost_usd?: number; ad_match?: boolean;
  meta?: Record<string, unknown>;
};
export async function testBot(input: { text?: string; tap?: { id: string; title: string } | null; start_product?: number | null }) {
  return run<TestReply>(async () => {
    const { id } = await actor();
    const t = String(input.text ?? "").trim().slice(0, 1500);
    if (!t && !input.tap) return { ok: false, message: "Type a message." };
    const r = await engine<TestReply>("test_bot", id, { session: "panel", text: t, tap: input.tap ?? null, start_product: input.start_product ?? null }, 60_000);
    if (!r.ok) return { ok: false, message: r.error };
    return { ok: true, data: r.data };
  });
}
export async function resetTestBot() {
  return run(async () => {
    const { id } = await actor();
    const { error } = await botDb().from("bot_customers").delete().eq("lingo_user_id", id).eq("test", true);
    if (error) return { ok: false, message: dbMessage(error) };
    return { ok: true, message: "New test chat." };
  });
}
