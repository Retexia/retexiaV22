"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { lingoFeederActor } from "@/lib/feeder/lingo-feeder/data";
import { lfDb } from "@/lib/feeder/lingo-feeder/db";
import { engine } from "@/lib/feeder/lingo-feeder/engine";
import { SET_STATUSES, windowOpen } from "@/lib/feeder/lingo-feeder/labels";

const done = <T,>(message: string, data?: T): ActionResult<T> => {
  revalidatePath("/lingo-feeder", "layout");
  return { ok: true, message, data };
};
async function actor() {
  const a = await lingoFeederActor();
  if (!a) throw new AccessError("Lingo Feeder isn't on your account, or you were signed out. Please sign in again.");
  return a;
}
const event = (userId: string, type: string, detail: Record<string, unknown>, phone: string | null = null) =>
  lfDb().from("events").insert({ user_id: userId, phone, type, detail });

const text = (max: number) => z.string().trim().max(max, `Up to ${max} characters`);
const optText = (max: number) => text(max).transform((v) => v || null);
const phoneKey = z.string().regex(/^\d{6,20}$/, "Unknown chat");
const localPhone = z.string().trim().transform((v) => v.replace(/[^\d+]/g, "")).refine((v) => v === "" || /^(\+?94|0)\d{9}$/.test(v), "Enter a Sri Lankan phone number (07X XXX XXXX)");

// ---------------------------------------------------------------------------
// Business details and Lingo on / off
// ---------------------------------------------------------------------------
const businessSchema = z.object({
  business_name: text(80).min(2, "Enter your shop's name"),
  phone: optText(40),
  location: optText(120),
  address: optText(300),
  delivery_days: z.string().trim().regex(/^\d{1,2}(-\d{1,2})?$/, 'Days like "3" or "2-3"'),
  call_hours: text(40).min(2, 'When you call customers back, e.g. "9am - 6pm"'),
  about: optText(300),
  ads_only: z.boolean(),
});
export async function saveBusiness(input: z.input<typeof businessSchema>) {
  return run(async () => {
    const { userId } = await actor();
    const d = businessSchema.parse(input);
    const { error } = await lfDb().from("sellers").update(d).eq("user_id", userId);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved. Lingo uses your details from the next message.");
  });
}

export async function setLingoOn(on: boolean) {
  return run(async () => {
    const { userId } = await actor();
    const db = lfDb();
    const { data: s } = await db.from("sellers").select("status, business_name, phone").eq("user_id", userId).single();
    if (s?.status === "blocked") return { ok: false, message: "Lingo is on hold for your account. Please contact Retexia." };
    if (on) {
      if (!s?.business_name || s.business_name === "My shop") return { ok: false, message: "Add your shop's name first (Business details)." };
      const { data: n } = await db.from("numbers").select("status").eq("user_id", userId).maybeSingle();
      if (!n) return { ok: false, message: "Connect your WhatsApp number first (WhatsApp tab)." };
      if (n.status !== "connected") return { ok: false, message: "Press Test connection on the WhatsApp tab first; Lingo turns on once your number answers." };
    }
    const { error } = await db.from("sellers").update({ status: on ? "live" : "paused" }).eq("user_id", userId);
    if (error) return { ok: false, message: dbMessage(error) };
    await event(userId, on ? "lingo_on" : "lingo_off", {});
    return done(on ? "Lingo is on. She answers new messages on your WhatsApp." : "Lingo is off. New messages wait in Chats for you.");
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
    const { userId } = await actor();
    const d = numberSchema.parse(input);
    const { data, error } = await lfDb().rpc("save_number", { p: { user_id: userId, ...d } });
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
    const { userId } = await actor();
    const db = lfDb();
    const { data: n } = await db.from("numbers").select("phone_number_id").eq("user_id", userId).maybeSingle();
    if (!n) return { ok: false, message: "Save your number first." };
    const r = await engine<{ ok: boolean; error?: string | null; info?: Record<string, string> | null; subscribed?: boolean | null }>("check", userId, {}, 30_000);
    if (!r.ok) return { ok: false, message: r.error };
    const a = r.data;
    await db.rpc("bot_save_check", { p: { phone_number_id: n.phone_number_id, ok: a.ok, error: a.error ?? null, info: a.info ?? {} } });
    revalidatePath("/lingo-feeder", "layout");
    if (!a.ok) return { ok: false, message: `WhatsApp said: ${a.error ?? "no answer"}. Check the token and the Phone number ID.` };
    const extra = a.subscribed === false ? " One more step: your app isn't subscribed to this WhatsApp account yet (step 6)." : "";
    return { ok: true, message: `Connected: ${a.info?.verified_name || "your number"} ${a.info?.display_phone_number || ""}.${extra}`.replace(/\s+\./, ".") };
  });
}

export async function removeNumber() {
  return run(async () => {
    const { userId } = await actor();
    const { error } = await lfDb().rpc("remove_number", { p_user: userId });
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Number removed. Its token and App secret were deleted.");
  });
}

/** The order form (a WhatsApp Flow): created and published in the seller's own WhatsApp Business Account. */
export async function setupOrderForm() {
  return run(async () => {
    const { userId } = await actor();
    const db = lfDb();
    const { data: n } = await db.from("numbers").select("status, waba_id").eq("user_id", userId).maybeSingle();
    if (!n) return { ok: false, message: "Connect your WhatsApp number first." };
    if (!n.waba_id) return { ok: false, message: "Add your WhatsApp Business Account ID above first (the form is made in that account)." };
    if (n.status !== "connected") return { ok: false, message: "Press Test connection first." };
    const r = await engine<{ ok: boolean; flow_id?: string | null; published?: boolean; error?: string | null }>("flow_setup", userId, {}, 45_000);
    if (!r.ok) return { ok: false, message: r.error };
    const a = r.data;
    const now = new Date().toISOString();
    await db.from("numbers").update(
      a.ok && a.flow_id
        ? { flow_id: a.flow_id, flow_status: "published", flow_error: null, flow_at: now }
        : { flow_status: "failed", flow_error: (a.error ?? "WhatsApp didn't create the form").slice(0, 500), flow_at: now },
    ).eq("user_id", userId);
    await event(userId, a.ok ? "order_form_ready" : "order_form_failed", { flow_id: a.flow_id ?? null, error: a.error ?? null });
    revalidatePath("/lingo-feeder", "layout");
    return a.ok ? { ok: true, message: "The order form is ready. Customers get it when they tap 🛒 Order." } : { ok: false, message: a.error ?? "WhatsApp didn't create the form." };
  });
}

export async function setOrderFormOn(on: boolean) {
  return run(async () => {
    const { userId } = await actor();
    const db = lfDb();
    const { data: n } = await db.from("numbers").select("flow_id").eq("user_id", userId).maybeSingle();
    if (on && !n?.flow_id) return { ok: false, message: "Create the order form first." };
    const { error } = await db.from("numbers").update({ flow_status: on ? "published" : "draft" }).eq("user_id", userId);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(on ? "Customers get the order form again." : "The order form is off: customers type their details.");
  });
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------
export async function setChatStatus(input: { phone: string; status: string }) {
  return run(async () => {
    const { userId } = await actor();
    const phone = phoneKey.parse(input.phone);
    const status = z.enum(SET_STATUSES).parse(input.status);
    const { error } = await lfDb().from("chats").update({ status, status_at: new Date().toISOString() }).eq("user_id", userId).eq("phone", phone);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Status changed.");
  });
}

export async function markCalled(input: { phone: string; called: boolean }) {
  return run(async () => {
    const { userId } = await actor();
    const phone = phoneKey.parse(input.phone);
    const { error } = await lfDb().from("chats").update(input.called ? { needs_call: false } : { needs_call: true, call_reason: "Marked by you" }).eq("user_id", userId).eq("phone", phone);
    if (error) return { ok: false, message: dbMessage(error) };
    await event(userId, input.called ? "called" : "call_marked", {}, phone);
    return done(input.called ? "Marked as called." : "Added to Call them.");
  });
}

export async function setChatPaused(input: { phone: string; paused: boolean }) {
  return run(async () => {
    const { userId } = await actor();
    const phone = phoneKey.parse(input.phone);
    const until = input.paused ? new Date(Date.now() + 365 * 86400_000).toISOString() : null;
    const { error } = await lfDb().from("chats").update({ paused_until: until, unsure: 0 }).eq("user_id", userId).eq("phone", phone);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(input.paused ? "Lingo is paused in this chat. You answer it." : "Lingo answers this chat again from the next message.");
  });
}

export async function replyToChat(input: { phone: string; text: string }) {
  return run(async () => {
    const { userId } = await actor();
    const phone = phoneKey.parse(input.phone);
    const body = text(4000).min(1, "Write a message").parse(input.text);
    const db = lfDb();
    const { data: c } = await db.from("chats").select("last_in_at").eq("user_id", userId).eq("phone", phone).eq("test", false).maybeSingle();
    if (!c) return { ok: false, message: "This chat doesn't exist." };
    if (!windowOpen(c.last_in_at)) return { ok: false, message: "WhatsApp only allows a free reply within 24 hours of the customer's last message. Call them instead." };
    const r = await engine<{ ok: boolean; wa_id?: string | null; error?: string | null }>("send", userId, { to: phone, text: body });
    if (!r.ok) return { ok: false, message: r.error };
    if (!r.data.ok) return { ok: false, message: `WhatsApp didn't send it: ${r.data.error ?? "unknown error"}` };
    const now = new Date();
    await db.from("messages").insert({ user_id: userId, phone, role: "s", content: body, wa_id: r.data.wa_id, status: "sent", route: "human" });
    await db.from("chats").update({ paused_until: new Date(now.getTime() + 12 * 3600_000).toISOString(), last_msg_at: now.toISOString(), last_out_at: now.toISOString() }).eq("user_id", userId).eq("phone", phone);
    return done("Sent. Lingo stays quiet in this chat for 12 hours (or press Let Lingo answer).");
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const orderSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: text(80).min(2, "Enter the name"),
  address: text(300).min(5, "Enter the address"),
  phone1: localPhone.refine((v) => v !== "", "Enter a phone number"),
  phone2: localPhone,
  qty: z.coerce.number().int().min(1).max(20),
});
export async function saveOrder(input: z.input<typeof orderSchema>) {
  return run(async () => {
    const { userId } = await actor();
    const d = orderSchema.parse(input);
    const db = lfDb();
    const { data: o } = await db.from("orders").select("unit_price, delivery_fee, exported_at").eq("user_id", userId).eq("id", d.id).maybeSingle();
    if (!o) return { ok: false, message: "Order not found." };
    const { error } = await db.from("orders").update({
      name: d.name, address: d.address, phone1: d.phone1, phone2: d.phone2 || null, qty: d.qty,
      total: Number(o.unit_price) * d.qty + Number(o.delivery_fee ?? 0),
    }).eq("user_id", userId).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(o.exported_at ? "Saved. It's already in a courier file: change it in Feeder too." : "Order saved.");
  });
}

export async function setOrderStatus(input: { id: number; status: "confirmed" | "cancelled" }) {
  return run(async () => {
    const { userId } = await actor();
    const status = z.enum(["confirmed", "cancelled"]).parse(input.status);
    const now = new Date().toISOString();
    const { error } = await lfDb().from("orders")
      .update(status === "cancelled" ? { status, cancelled_at: now } : { status, cancelled_at: null })
      .eq("user_id", userId).eq("id", Number(input.id)).neq("status", "draft");
    if (error) return { ok: false, message: dbMessage(error) };
    return done(status === "cancelled" ? "Order cancelled." : "Order back on.");
  });
}

export async function setOrderSent(input: { id: number; sent: boolean }) {
  return run(async () => {
    const { userId } = await actor();
    const { error } = await lfDb().from("orders").update({ exported_at: input.sent ? new Date().toISOString() : null }).eq("user_id", userId).eq("id", Number(input.id)).eq("status", "confirmed");
    if (error) return { ok: false, message: dbMessage(error) };
    return done(input.sent ? "Marked as sent to Feeder." : "Back in the next courier file.");
  });
}

// ---------------------------------------------------------------------------
// Products and ads
// ---------------------------------------------------------------------------
export async function setProduct(input: { product_id: number; enabled: boolean; price: number | string | null }) {
  return run(async () => {
    const { userId } = await actor();
    const pid = z.coerce.number().int().positive().parse(input.product_id);
    const raw = input.price === "" || input.price == null ? null : Number(input.price);
    if (raw !== null && (!Number.isFinite(raw) || raw <= 0 || raw > 1_000_000)) return { ok: false, message: "Enter a price in rupees, or leave it empty for the Feeder price." };
    const { error } = await lfDb().from("seller_products").upsert({ user_id: userId, product_id: pid, enabled: Boolean(input.enabled), price: raw });
    if (error) return { ok: false, message: dbMessage(error) };
    return done(input.enabled ? "Saved." : "Lingo won't offer this product.");
  });
}

export async function setAdProduct(input: { ad_id: string; product_id: number | null }) {
  return run(async () => {
    const { userId } = await actor();
    const adId = text(300).min(1).parse(input.ad_id);
    const pid = input.product_id ? z.coerce.number().int().positive().parse(input.product_id) : null;
    const { error } = await lfDb().from("ads").update({ product_id: pid, matched_by: pid ? "seller" : null, tried: true }).eq("user_id", userId).eq("ad_id", adId);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(pid ? "Saved: customers from this ad get this product." : "Cleared.");
  });
}

// ---------------------------------------------------------------------------
// Try Lingo (test chats, nothing goes to WhatsApp)
// ---------------------------------------------------------------------------
export type TryReply = {
  ok: boolean; stopped?: string; status?: string; needs_call?: boolean; call_reason?: string | null; route?: string; lang?: string; log?: string;
  messages?: { kind: string; text: string; body: Record<string, unknown> }[];
  ai?: { task: string; model: string; ok: boolean; in: number; cached: number; out: number }[]; cost_usd?: number;
};
export async function tryLingo(input: { text?: string; tap?: { id: string; title: string } | null; start_product?: number | null; name?: string }) {
  return run<TryReply>(async () => {
    const { userId } = await actor();
    const t = String(input.text ?? "").trim().slice(0, 1500);
    if (!t && !input.tap) return { ok: false, message: "Type a message." };
    const { count } = await lfDb().from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).like("phone", "test-%").eq("role", "c")
      .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
    if ((count ?? 0) >= 150) return { ok: false, message: "That's a lot of test messages today. Try again tomorrow." };
    const r = await engine<TryReply>("test_bot", userId, { session: "panel", text: t, tap: input.tap ?? null, start_product: input.start_product ?? null, name: input.name ?? "" });
    if (!r.ok) return { ok: false, message: r.error };
    return { ok: true, data: r.data };
  });
}
export async function resetTry() {
  return run(async () => {
    const { userId } = await actor();
    const { error } = await lfDb().from("chats").delete().eq("user_id", userId).eq("test", true);
    if (error) return { ok: false, message: dbMessage(error) };
    return { ok: true, message: "New test chat." };
  });
}
